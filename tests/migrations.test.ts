import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const dir = "supabase/migrations";
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

describe("migrations are numbered and re-runnable", () => {
  it("are numbered 0001, 0002, … with no gaps", () => {
    files.forEach((f, i) => expect(f.startsWith(String(i + 1).padStart(4, "0") + "_")).toBe(true));
  });
  for (const f of files) {
    const sql = readFileSync(`${dir}/${f}`, "utf8").replace(/--.*$/gm, "");
    it(`${f}: only idempotent DDL`, () => {
      expect(sql).not.toMatch(/create table (?!if not exists)/i);
      expect(sql).not.toMatch(/create (unique )?index (?!if not exists)/i);
      expect(sql).not.toMatch(/create function/i);
      for (const m of sql.matchAll(/create trigger (\w+)/gi)) {
        expect(sql, `trigger ${m[1]} needs "drop trigger if exists" first`).toMatch(new RegExp(`drop trigger if exists ${m[1]}\\b`, "i"));
      }
      expect(sql).not.toMatch(/\b(real|double precision|float\d?)\b/i); // never floats for money
    });
    it(`${f}: every table has RLS enabled`, () => {
      const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);
      for (const t of tables) expect(sql).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`, "i"));
    });
    it(`${f}: no RLS policies (browser never reads data)`, () => expect(sql).not.toMatch(/create policy/i));
  }
});
