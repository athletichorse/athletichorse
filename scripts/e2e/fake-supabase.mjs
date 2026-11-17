#!/usr/bin/env node
/**
 * DEV/TEST ONLY — a small local stand-in for Supabase so the real app can be
 * driven end-to-end against a local Postgres that has our migrations applied.
 * Implements just the parts the app uses:
 *   /rest/v1/<table>   (select/filters/order/range/count/single, insert/upsert/update/delete)
 *   /rest/v1/rpc/<fn>
 *   /auth/v1/token, /auth/v1/user, /auth/v1/logout, /auth/v1/admin/users[/id]
 * Like the real project (RLS on, no policies), only the service-role key can read data.
 *
 * Usage: DATABASE_URL=postgres://… JWT_SECRET=… PORT=54321 node scripts/e2e/fake-supabase.mjs
 *        node scripts/e2e/fake-supabase.mjs --keys   (prints anon + service keys for the secret)
 */
import http from "node:http";
import crypto from "node:crypto";
import pg from "pg";

const SECRET = process.env.JWT_SECRET || "local-e2e-secret-not-for-production-0123456789";
const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(payload) {
  const head = b64u(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", SECRET).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
function verify(token) {
  const [h, b, s] = String(token || "").split(".");
  if (!h || !b || !s) return null;
  const want = crypto.createHmac("sha256", SECRET).update(`${h}.${b}`).digest("base64url");
  if (want.length !== s.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(s))) return null;
  const p = JSON.parse(Buffer.from(b, "base64url").toString());
  if (p.exp && p.exp < Date.now() / 1000) return null;
  return p;
}
export const keys = {
  anon: sign({ role: "anon", iss: "e2e" }),
  service: sign({ role: "service_role", iss: "e2e" }),
};
if (process.argv.includes("--keys")) {
  console.log(JSON.stringify(keys));
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const IDENT = /^[a-z_][a-z0-9_]*$/;
const q = (id) => {
  if (!IDENT.test(id)) throw httpErr(400, `bad identifier ${id}`);
  return `"${id}"`;
};
function httpErr(status, message, code = "PGRST000") {
  const e = new Error(message);
  e.status = status;
  e.code = code;
  return e;
}

async function setupAuth() {
  await pool.query(`
    create extension if not exists pgcrypto;
    alter table auth.users add column if not exists email text unique;
    alter table auth.users add column if not exists encrypted_password text;
    alter table auth.users add column if not exists created_at timestamptz default now();`);
}

// ---------------------------------------------------------------- PostgREST
function splitTop(s) {
  // split "a,b,(c,d)" on top-level commas, respecting quotes and parentheses
  const out = [];
  let cur = "", depth = 0, inQ = false;
  for (const ch of s) {
    if (ch === '"') inQ = !inQ;
    if (!inQ && ch === "(") depth++;
    if (!inQ && ch === ")") depth--;
    if (!inQ && depth === 0 && ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  if (cur !== "") out.push(cur);
  return out;
}
const unquote = (v) => (v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v);

/** PostgREST logic trees: or=(a.eq.1,and(b.gt.2,c.ilike.*x*)) and and=(…), nested. */
function logicTree(kind, inner, args) {
  const parts = splitTop(inner.replace(/^\(/, "").replace(/\)$/, "")).map((x) => {
    const m = /^(not\.)?(or|and)(\(.*\))$/.exec(x);
    if (m) { const c = logicTree(m[2], m[3], args); return m[1] ? `not (${c})` : c; }
    const d = x.indexOf(".");
    return oneCond(q(x.slice(0, d)), x.slice(d + 1), args);
  });
  return `(${parts.join(kind === "or" ? " or " : " and ")})`;
}

function buildWhere(params, args) {
  const conds = [];
  for (const [key, raw] of params) {
    if (["select", "order", "limit", "offset", "on_conflict", "columns"].includes(key)) continue;
    if (key === "or" || key === "and") { conds.push(logicTree(key, raw, args)); continue; }
    conds.push(oneCond(q(key), raw, args));
  }
  return conds.length ? `where ${conds.join(" and ")}` : "";
}

function oneCond(col, raw, args) {
  {
    let v = raw, neg = false;
    if (v.startsWith("not.")) {
      neg = true;
      v = v.slice(4);
    }
    const dot = v.indexOf(".");
    const op = v.slice(0, dot), val = v.slice(dot + 1);
    let c;
    const p = () => {
      args.push(val);
      return `$${args.length}`;
    };
    switch (op) {
      case "eq": c = `${col} = ${p()}`; break;
      case "neq": c = `${col} <> ${p()}`; break;
      case "gt": c = `${col} > ${p()}`; break;
      case "gte": c = `${col} >= ${p()}`; break;
      case "lt": c = `${col} < ${p()}`; break;
      case "lte": c = `${col} <= ${p()}`; break;
      case "like": args.push(val.replaceAll("*", "%")); c = `${col}::text like $${args.length}`; break;
      case "ilike": args.push(val.replaceAll("*", "%")); c = `${col}::text ilike $${args.length}`; break;
      case "is":
        if (val === "null") c = `${col} is null`;
        else if (val === "true" || val === "false") c = `${col} is ${val}`;
        else throw httpErr(400, `bad is.${val}`);
        break;
      case "in": {
        const items = splitTop(val.replace(/^\(/, "").replace(/\)$/, "")).map(unquote);
        args.push(items);
        c = `${col}::text = any($${args.length}::text[])`;
        break;
      }
      default:
        throw httpErr(400, `operator ${op} not supported by the e2e stand-in`);
    }
    return neg ? `not (${c})` : c;
  }
}

function buildSelect(sel) {
  if (!sel || sel === "*") return "*";
  return splitTop(sel.replace(/\s+/g, "")).map((c) => {
    if (c.includes("(")) throw httpErr(400, "embedded selects are not supported by the e2e stand-in");
    return q(c);
  }).join(", ");
}

function buildOrder(order) {
  if (!order) return "";
  return "order by " + splitTop(order).map((part) => {
    const [col, ...mods] = part.split(".");
    let s = q(col);
    if (mods.includes("desc")) s += " desc";
    if (mods.includes("nullsfirst")) s += " nulls first";
    if (mods.includes("nullslast")) s += " nulls last";
    return s;
  }).join(", ");
}

async function primaryKey(table) {
  const r = await pool.query(
    `select a.attname from pg_index i join pg_attribute a on a.attrelid = i.indrelid and a.attnum = any(i.indkey)
      where i.indrelid = $1::regclass and i.indisprimary order by a.attnum`, [`public.${table}`]);
  return r.rows.map((x) => x.attname);
}

function pgErrToHttp(e) {
  const status = e.code === "23505" ? 409 : e.code === "23503" || e.code === "23514" || e.code === "22P02" || e.code === "P0001" ? 400 : e.status || 400;
  return { status, body: { code: e.code || "PGRST000", message: e.message, details: e.detail ?? null, hint: e.hint ?? null } };
}

async function rest(req, url, body) {
  const auth = verify((req.headers.authorization || "").replace(/^Bearer /, "")) || verify(req.headers.apikey);
  if (!auth || auth.role !== "service_role") {
    // RLS on, no policies: anon/authenticated see nothing and can change nothing.
    return { status: req.method === "GET" || req.method === "HEAD" ? 200 : 401, body: req.method === "GET" ? [] : { code: "42501", message: "permission denied (RLS)" } };
  }
  const path = url.pathname.replace(/^\/rest\/v1\//, "");
  const params = [...url.searchParams.entries()];
  const prefer = String(req.headers.prefer || "");
  const wantObject = String(req.headers.accept || "").includes("vnd.pgrst.object");

  if (path.startsWith("rpc/")) {
    const fn = q(path.slice(4));
    const argsObj = body ? JSON.parse(body) : {};
    const names = Object.keys(argsObj);
    const vals = names.map((n) => {
      const v = argsObj[n];
      return v !== null && typeof v === "object" && !Array.isArray(v) ? JSON.stringify(v)
        : Array.isArray(v) && v.length && typeof v[0] === "object" ? JSON.stringify(v)
        : v;
    });
    const sql = `select public.${fn}(${names.map((n, i) => `${q(n)} => $${i + 1}`).join(", ")}) as r`;
    const r = await pool.query(sql, vals);
    return { status: 200, body: r.rows[0]?.r ?? null };
  }

  const table = path;
  q(table);
  const args = [];
  const where = buildWhere(params, args);
  const sp = url.searchParams;

  if (req.method === "GET" || req.method === "HEAD") {
    const sel = buildSelect(sp.get("select"));
    const order = buildOrder(sp.get("order"));
    const limit = sp.get("limit") ? `limit ${Number(sp.get("limit"))}` : "";
    const offset = sp.get("offset") ? `offset ${Number(sp.get("offset"))}` : "";
    const r = await pool.query(`select ${sel} from public.${q(table)} ${where} ${order} ${limit} ${offset}`, args);
    const headers = {};
    if (prefer.includes("count=exact")) {
      const c = await pool.query(`select count(*)::int as n from public.${q(table)} ${where}`, args);
      const from = Number(sp.get("offset") || 0);
      headers["content-range"] = `${r.rows.length ? `${from}-${from + r.rows.length - 1}` : "*"}/${c.rows[0].n}`;
    }
    if (wantObject) {
      if (r.rows.length !== 1) return { status: 406, headers, body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned", details: `The result contains ${r.rows.length} rows`, hint: null } };
      return { status: 200, headers, body: r.rows[0] };
    }
    return { status: 200, headers, body: req.method === "HEAD" ? undefined : r.rows };
  }

  const returning = prefer.includes("return=representation") ? "returning *" : "";
  const finish = (rows) => {
    if (!returning) return { status: req.method === "POST" ? 201 : 204, body: undefined };
    if (wantObject) {
      if (rows.length !== 1) return { status: 406, body: { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" } };
      return { status: 200, body: rows[0] };
    }
    return { status: 200, body: rows };
  };

  if (req.method === "POST") {
    const data = JSON.parse(body || "[]");
    const rows = Array.isArray(data) ? data : [data];
    if (!rows.length) return finish([]);
    const cols = [...new Set(rows.flatMap((r) => Object.keys(r)))];
    const colList = cols.map(q).join(", ");
    let conflict = "";
    if (prefer.includes("resolution=merge-duplicates") || prefer.includes("resolution=ignore-duplicates")) {
      const target = sp.get("on_conflict") ? sp.get("on_conflict").split(",") : await primaryKey(table);
      const updates = cols.filter((c) => !target.includes(c));
      conflict = prefer.includes("ignore-duplicates") || !updates.length
        ? `on conflict (${target.map(q).join(", ")}) do nothing`
        : `on conflict (${target.map(q).join(", ")}) do update set ${updates.map((c) => `${q(c)} = excluded.${q(c)}`).join(", ")}`;
    }
    const r = await pool.query(
      `insert into public.${q(table)} (${colList}) select ${colList} from json_populate_recordset(null::public.${q(table)}, $1) ${conflict} ${returning}`,
      [JSON.stringify(rows)]);
    return finish(r.rows);
  }

  if (req.method === "PATCH") {
    const data = JSON.parse(body || "{}");
    const cols = Object.keys(data);
    if (!cols.length) return finish([]);
    args.push(JSON.stringify(data));
    const r = await pool.query(
      `update public.${q(table)} set (${cols.map(q).join(", ")}) = (select ${cols.map(q).join(", ")} from json_populate_record(null::public.${q(table)}, $${args.length})) ${where} ${returning}`,
      args);
    return finish(r.rows);
  }

  if (req.method === "DELETE") {
    const r = await pool.query(`delete from public.${q(table)} ${where} ${returning}`, args);
    return finish(r.rows);
  }
  throw httpErr(405, "method not allowed");
}

// ---------------------------------------------------------------- GoTrue
const userObj = (row) => ({
  id: row.id, aud: "authenticated", role: "authenticated", email: row.email,
  app_metadata: { provider: "email" }, user_metadata: {}, created_at: row.created_at, email_confirmed_at: row.created_at,
});
function session(row) {
  const now = Math.floor(Date.now() / 1000);
  const access = sign({ sub: row.id, role: "authenticated", aud: "authenticated", email: row.email, iat: now, exp: now + 86400 });
  return { access_token: access, token_type: "bearer", expires_in: 86400, expires_at: now + 86400, refresh_token: sign({ sub: row.id, typ: "refresh", iat: now }), user: userObj(row) };
}

async function authApi(req, url, body) {
  const p = url.pathname.replace(/^\/auth\/v1/, "");
  const json = body ? JSON.parse(body) : {};
  const bearer = verify((req.headers.authorization || "").replace(/^Bearer /, ""));
  const isService = bearer?.role === "service_role";

  if (p === "/token" && url.searchParams.get("grant_type") === "password") {
    const r = await pool.query(`select id, email, created_at from auth.users where email = lower($1) and encrypted_password = extensions.crypt($2, encrypted_password)`, [json.email, json.password]);
    if (!r.rows.length) return { status: 400, body: { error: "invalid_grant", error_description: "Invalid login credentials", code: "invalid_credentials", msg: "Invalid login credentials" } };
    return { status: 200, body: session(r.rows[0]) };
  }
  if (p === "/token" && url.searchParams.get("grant_type") === "refresh_token") {
    const rt = verify(json.refresh_token);
    if (!rt) return { status: 400, body: { error: "invalid_grant", msg: "Invalid Refresh Token" } };
    const r = await pool.query(`select id, email, created_at from auth.users where id = $1`, [rt.sub]);
    return r.rows.length ? { status: 200, body: session(r.rows[0]) } : { status: 400, body: { error: "invalid_grant" } };
  }
  if (p === "/user" && req.method === "GET") {
    if (!bearer?.sub) return { status: 401, body: { code: 401, msg: "invalid JWT" } };
    const r = await pool.query(`select id, email, created_at from auth.users where id = $1`, [bearer.sub]);
    return r.rows.length ? { status: 200, body: userObj(r.rows[0]) } : { status: 401, body: { msg: "user not found" } };
  }
  if (p === "/logout") return { status: 204, body: undefined };

  if (p.startsWith("/admin/users")) {
    if (!isService) return { status: 401, body: { msg: "service role required" } };
    const id = p.split("/")[3];
    if (req.method === "POST" && !id) {
      const exists = await pool.query(`select 1 from auth.users where email = lower($1)`, [json.email]);
      if (exists.rows.length) return { status: 422, body: { code: "email_exists", msg: "A user with this email address has already been registered" } };
      const r = await pool.query(`insert into auth.users (email, encrypted_password) values (lower($1), extensions.crypt($2, extensions.gen_salt('bf', 6))) returning id, email, created_at`, [json.email, json.password]);
      return { status: 200, body: userObj(r.rows[0]) };
    }
    if (req.method === "PUT" && id) {
      if (json.password) await pool.query(`update auth.users set encrypted_password = extensions.crypt($2, extensions.gen_salt('bf', 6)) where id = $1`, [id, json.password]);
      const r = await pool.query(`select id, email, created_at from auth.users where id = $1`, [id]);
      return { status: 200, body: userObj(r.rows[0]) };
    }
    if (req.method === "DELETE" && id) {
      await pool.query(`delete from auth.users where id = $1`, [id]);
      return { status: 200, body: {} };
    }
  }
  return { status: 404, body: { msg: `e2e stand-in: ${req.method} ${p} not implemented` } };
}

// ---------------------------------------------------------------- server
const server = http.createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", async () => {
    const url = new URL(req.url, "http://localhost");
    let out;
    try {
      if (url.pathname.startsWith("/rest/v1/")) out = await rest(req, url, body);
      else if (url.pathname.startsWith("/auth/v1/")) out = await authApi(req, url, body);
      else out = { status: 404, body: { msg: "not found" } };
    } catch (e) {
      out = pgErrToHttp(e);
      if (process.env.E2E_LOG) console.error("ERR", req.method, url.pathname, url.search, e.message);
    }
    if (process.env.E2E_LOG) console.log(out.status, req.method, url.pathname + url.search);
    res.writeHead(out.status, { "content-type": "application/json", ...(out.headers || {}) });
    res.end(out.body === undefined ? "" : JSON.stringify(out.body));
  });
});

await setupAuth();
const port = Number(process.env.PORT || 54321);
server.listen(port, () => console.log(`fake supabase on http://localhost:${port}`));
