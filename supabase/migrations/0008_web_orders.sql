-- =====================================================================
-- 0008_web_orders.sql — website (Shopify) orders, imported daily.
--  * Upserts by Shopify order id: re-importing never duplicates.
--  * Customers matched/created by Saudi mobile number.
--  * Stock: orders created on/after the setting `web_orders_stock_from`
--    reduce the website stock location (Jeddah) by each line's current
--    quantity; cancellations/edits/refunds put the difference back.
--    Each line remembers what it already applied, so a re-sync only applies
--    changes. Older orders are kept for the record only.
-- Safe to run more than once.
-- =====================================================================

create table if not exists public.web_orders (
  id                  uuid primary key default gen_random_uuid(),
  shopify_order_id    bigint not null unique,
  name                text not null,                 -- e.g. #1025
  created_at          timestamptz not null,
  updated_at          timestamptz not null,
  cancelled_at        timestamptz,
  financial_status    text not null default '',
  fulfillment_status  text not null default '',
  currency            text not null default 'SAR',
  customer_id         uuid references public.customers(id) on delete set null,
  customer_name       text not null default '',
  phone               text,
  email               text,
  city                text not null default '',
  subtotal            numeric(12,2) not null default 0,
  shipping            numeric(12,2) not null default 0,
  discounts           numeric(12,2) not null default 0,
  tax                 numeric(12,2) not null default 0,
  total               numeric(12,2) not null default 0,   -- current total (after edits/refunds/cancel)
  location_id         uuid references public.locations(id),
  synced_at           timestamptz not null default now()
);
create index if not exists web_orders_created_idx on public.web_orders (created_at desc);

create table if not exists public.web_order_lines (
  order_id            uuid not null references public.web_orders(id) on delete cascade,
  shopify_line_id     text not null unique,
  variant_id          uuid references public.product_variants(id),
  shopify_variant_id  bigint,
  name                text not null,
  sku                 text,
  qty                 numeric(12,3) not null,         -- ordered
  current_qty         numeric(12,3) not null,         -- after removals/refunds
  unit_price          numeric(12,2) not null,
  line_total          numeric(12,2) not null,
  stock_applied       numeric(12,3) not null default 0,   -- qty already taken from stock
  primary key (order_id, shopify_line_id)
);

-- Orders from this moment on move stock (set once; change it in Settings if needed).
insert into public.settings (key, value) values ('web_orders_stock_from', to_jsonb(now()::text))
on conflict (key) do nothing;

create or replace function public.sync_shopify_orders(p_orders jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o jsonb; li jsonb; v_id uuid; v_cust uuid; v_phone text; v_loc uuid; v_from timestamptz; v_var uuid;
  v_target numeric(12,3); v_applied numeric(12,3); inserted boolean;
  n_new int := 0; n_upd int := 0; n_cust int := 0; n_moves int := 0; v_digits text;
begin
  v_from := coalesce((select (value #>> '{}')::timestamptz from settings where key = 'web_orders_stock_from'), now());
  v_loc := (select (value #>> '{}')::uuid from settings where key = 'website_stock_location');

  for o in select * from jsonb_array_elements(coalesce(p_orders, '[]'::jsonb)) loop
    -- Saudi mobile: +9665XXXXXXXX (from customer, shipping address or order)
    v_phone := null;
    v_digits := regexp_replace(coalesce(o->>'phone', ''), '\D', '', 'g');
    v_digits := regexp_replace(v_digits, '^(00)?966', '');
    v_digits := regexp_replace(v_digits, '^0', '');
    if v_digits ~ '^5[0-9]{8}$' then v_phone := '+966' || v_digits; end if;

    v_cust := null;
    if v_phone is not null then
      select id into v_cust from customers where phone = v_phone;
      if v_cust is null then
        insert into customers (phone, name, email, notes)
        values (v_phone, left(coalesce(o->>'customer_name', ''), 200),
                case when coalesce(o->>'email', '') ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then o->>'email' end,
                'Website customer')
        on conflict (phone) do nothing
        returning id into v_cust;
        if v_cust is null then select id into v_cust from customers where phone = v_phone; else n_cust := n_cust + 1; end if;
      end if;
    end if;

    insert into web_orders (shopify_order_id, name, created_at, updated_at, cancelled_at, financial_status, fulfillment_status, currency,
                            customer_id, customer_name, phone, email, city, subtotal, shipping, discounts, tax, total, location_id, synced_at)
    values ((o->>'id')::bigint, o->>'name', (o->>'created_at')::timestamptz, (o->>'updated_at')::timestamptz,
            nullif(o->>'cancelled_at', '')::timestamptz, coalesce(o->>'financial_status', ''), coalesce(o->>'fulfillment_status', ''),
            coalesce(o->>'currency', 'SAR'), v_cust, left(coalesce(o->>'customer_name', ''), 200), v_phone, nullif(o->>'email', ''),
            left(coalesce(o->>'city', ''), 120), coalesce((o->>'subtotal')::numeric, 0), coalesce((o->>'shipping')::numeric, 0),
            coalesce((o->>'discounts')::numeric, 0), coalesce((o->>'tax')::numeric, 0), coalesce((o->>'total')::numeric, 0), v_loc, now())
    on conflict (shopify_order_id) do update set
      updated_at = excluded.updated_at, cancelled_at = excluded.cancelled_at, financial_status = excluded.financial_status,
      fulfillment_status = excluded.fulfillment_status, customer_id = coalesce(web_orders.customer_id, excluded.customer_id),
      customer_name = excluded.customer_name, phone = coalesce(excluded.phone, web_orders.phone), email = excluded.email,
      city = excluded.city, subtotal = excluded.subtotal, shipping = excluded.shipping, discounts = excluded.discounts,
      tax = excluded.tax, total = excluded.total, synced_at = now()
    returning id, (xmax = 0) into v_id, inserted;
    if inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;

    for li in select * from jsonb_array_elements(coalesce(o->'lines', '[]'::jsonb)) loop
      select id into v_var from product_variants where shopify_variant_id = nullif(li->>'variant_id', '')::bigint;
      insert into web_order_lines (order_id, shopify_line_id, variant_id, shopify_variant_id, name, sku, qty, current_qty, unit_price, line_total)
      values (v_id, li->>'id', v_var, nullif(li->>'variant_id', '')::bigint, left(coalesce(li->>'name', ''), 300), nullif(li->>'sku', ''),
              coalesce((li->>'qty')::numeric, 0), coalesce((li->>'current_qty')::numeric, 0),
              coalesce((li->>'unit_price')::numeric, 0), coalesce((li->>'line_total')::numeric, 0))
      on conflict (shopify_line_id) do update set
        variant_id = coalesce(excluded.variant_id, web_order_lines.variant_id), qty = excluded.qty,
        current_qty = excluded.current_qty, unit_price = excluded.unit_price, line_total = excluded.line_total;

      -- stock: only orders from the start date, only known non-service items, only at the website location
      if v_loc is not null and v_var is not null and (o->>'created_at')::timestamptz >= v_from
         and not exists (select 1 from product_variants pv join products p on p.id = pv.product_id where pv.id = v_var and p.is_service) then
        v_target := case when nullif(o->>'cancelled_at', '') is null then coalesce((li->>'current_qty')::numeric, 0) else 0 end;
        select stock_applied into v_applied from web_order_lines where shopify_line_id = li->>'id';
        if v_target <> v_applied then
          perform apply_stock_change(v_loc, v_var, -(v_target - v_applied),
                                     case when v_target > v_applied then 'sale' else 'return' end,
                                     null, null, 'web_order', v_id);
          update web_order_lines set stock_applied = v_target where shopify_line_id = li->>'id';
          n_moves := n_moves + 1;
        end if;
      end if;
    end loop;
  end loop;
  return jsonb_build_object('orders_new', n_new, 'orders_updated', n_upd, 'customers_new', n_cust, 'stock_moves', n_moves);
end;
$$;

revoke all on function public.sync_shopify_orders(jsonb) from public, anon, authenticated;
grant execute on function public.sync_shopify_orders(jsonb) to service_role;

-- sync_runs now also logs order syncs
alter table public.sync_runs drop constraint if exists sync_runs_source_check;
alter table public.sync_runs add constraint sync_runs_source_check check (source in ('shopify', 'shopify_orders'));

alter table public.web_orders      enable row level security;
alter table public.web_order_lines enable row level security;
revoke all on public.web_orders, public.web_order_lines from anon, authenticated;
