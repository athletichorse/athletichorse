-- =====================================================================
-- 0003_products.sql — products (models), variants (sellable items with
-- SKU = barcode), extra codes, images, groups (المجموعة) & sub-groups (النوع),
-- and the website (Shopify) sync.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Groups: parent_id null = group (المجموعة); parent set = sub-group (النوع)
-- ---------------------------------------------------------------------
create table if not exists public.product_groups (
  id          uuid primary key default gen_random_uuid(),
  parent_id   uuid references public.product_groups(id) on delete restrict,
  name_en     text not null,
  name_ar     text not null default '',
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
create unique index if not exists product_groups_top_name_uq
  on public.product_groups (lower(name_en)) where parent_id is null;
create unique index if not exists product_groups_sub_name_uq
  on public.product_groups (parent_id, lower(name_en)) where parent_id is not null;

-- ---------------------------------------------------------------------
-- Products = models (e.g. "Kettlebell"); variants = colours/sizes/weights
-- ---------------------------------------------------------------------
create table if not exists public.products (
  id                  uuid primary key default gen_random_uuid(),
  name_en             text not null,
  name_ar             text not null default '',
  group_id            uuid references public.product_groups(id) on delete set null,
  subgroup_id         uuid references public.product_groups(id) on delete set null,
  unit                text not null default 'piece',
  is_service          boolean not null default false,  -- services have no stock
  active              boolean not null default true,
  vendor              text not null default '',
  tags                text[] not null default '{}',
  options             jsonb not null default '[]',      -- e.g. ["Color","Size"]
  description_html    text not null default '',
  -- Website link (null for products created only in the portal)
  shopify_product_id  bigint unique,
  shopify_handle      text,
  synced_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists products_group_idx on public.products(group_id);

drop trigger if exists products_touch on public.products;
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table if not exists public.product_variants (
  id                  uuid primary key default gen_random_uuid(),
  product_id          uuid not null references public.products(id) on delete cascade,
  sku                 text unique check (sku is null or sku ~ '^[A-Za-z0-9._/-]{1,40}$'),  -- = barcode
  option1             text,
  option2             text,
  option3             text,
  price               numeric(12,2) not null default 0 check (price >= 0),  -- VAT-inclusive
  compare_at_price    numeric(12,2) check (compare_at_price is null or compare_at_price >= 0),
  cost                numeric(12,2) check (cost is null or cost >= 0),       -- portal only
  position            integer not null default 1,
  image_url           text,
  active              boolean not null default true,
  shopify_variant_id  bigint unique,
  shopify_sku         text,          -- SKU as typed on the website (may be empty or duplicated)
  synced_at           timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create index if not exists product_variants_product_idx on public.product_variants(product_id);
create index if not exists product_variants_shopify_sku_idx on public.product_variants(shopify_sku);

drop trigger if exists product_variants_touch on public.product_variants;
create trigger product_variants_touch before update on public.product_variants
  for each row execute function public.touch_updated_at();

-- Extra barcodes / codes for the same item
create table if not exists public.product_codes (
  code        text primary key check (code ~ '^[A-Za-z0-9._/-]{1,40}$'),
  variant_id  uuid not null references public.product_variants(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists product_codes_variant_idx on public.product_codes(variant_id);

create table if not exists public.product_images (
  id                uuid primary key default gen_random_uuid(),
  product_id        uuid not null references public.products(id) on delete cascade,
  url               text not null,
  alt               text not null default '',
  position          integer not null default 1,
  shopify_image_id  bigint unique,
  created_at        timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images(product_id);

-- Log of every website sync (daily + "Sync now")
create table if not exists public.sync_runs (
  id           uuid primary key default gen_random_uuid(),
  source       text not null default 'shopify',
  trigger      text not null default 'manual' check (trigger in ('manual', 'daily')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  status       text not null default 'running' check (status in ('running', 'ok', 'error')),
  counts       jsonb not null default '{}',
  error        text,
  started_by   uuid references public.profiles(id) on delete set null
);
create index if not exists sync_runs_started_idx on public.sync_runs(started_at desc);

-- A code may not be used twice: not as another item's SKU, not as another extra code.
create or replace function public.check_code_unique()
returns trigger language plpgsql as $$
begin
  if tg_table_name = 'product_codes' then
    if exists (select 1 from public.product_variants v where v.sku = new.code and v.id <> new.variant_id) then
      raise exception 'Code % is already the SKU of another item', new.code;
    end if;
  elsif new.sku is not null then
    if exists (select 1 from public.product_codes c where c.code = new.sku and c.variant_id <> new.id) then
      raise exception 'SKU % is already an extra code of another item', new.sku;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists product_codes_unique on public.product_codes;
create trigger product_codes_unique before insert or update on public.product_codes
  for each row execute function public.check_code_unique();
drop trigger if exists product_variants_code_unique on public.product_variants;
create trigger product_variants_code_unique before insert or update of sku on public.product_variants
  for each row execute function public.check_code_unique();

-- ---------------------------------------------------------------------
-- Website sync. The website is the source for names (English), prices,
-- options, variants and images. Portal-only fields are never overwritten:
-- Arabic name, cost, SKU once set, extra codes, group once set, unit, service.
-- p_products = array of Shopify products (as in /products.json).
-- ---------------------------------------------------------------------
create or replace function public.sync_shopify_products(p_products jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pr jsonb; v jsonb; img jsonb;
  pid uuid; gid uuid; inserted boolean;
  n_new int := 0; n_upd int := 0; n_var int := 0; n_img int := 0;
  ptype text;
begin
  for pr in select * from jsonb_array_elements(coalesce(p_products, '[]'::jsonb)) loop
    -- group from the website's product type
    gid := null;
    ptype := nullif(btrim(pr->>'product_type'), '');
    if ptype is not null then
      insert into product_groups (name_en, name_ar) values (ptype, '')
      on conflict ((lower(name_en))) where parent_id is null do nothing;
      select id into gid from product_groups where parent_id is null and lower(name_en) = lower(ptype);
    end if;

    insert into products (shopify_product_id, shopify_handle, name_en, vendor, tags, options,
                          description_html, group_id, active, synced_at)
    values ((pr->>'id')::bigint, pr->>'handle', coalesce(pr->>'title', ''), coalesce(pr->>'vendor', ''),
            coalesce(array(select jsonb_array_elements_text(coalesce(pr->'tags', '[]'::jsonb))), '{}'),
            coalesce((select jsonb_agg(o->>'name' order by (o->>'position')::int) from jsonb_array_elements(coalesce(pr->'options', '[]'::jsonb)) o
                      where o->>'name' <> 'Title'), '[]'::jsonb),
            coalesce(pr->>'body_html', ''), gid, true, now())
    on conflict (shopify_product_id) do update set
      shopify_handle   = excluded.shopify_handle,
      name_en          = excluded.name_en,
      vendor           = excluded.vendor,
      tags             = excluded.tags,
      options          = excluded.options,
      description_html = excluded.description_html,
      group_id         = coalesce(products.group_id, excluded.group_id),
      active           = true,
      synced_at        = now()
    returning id, (xmax = 0) into pid, inserted;
    if inserted then n_new := n_new + 1; else n_upd := n_upd + 1; end if;

    -- images
    for img in select * from jsonb_array_elements(coalesce(pr->'images', '[]'::jsonb)) loop
      insert into product_images (product_id, url, alt, position, shopify_image_id)
      values (pid, img->>'src', coalesce(img->>'alt', ''), coalesce((img->>'position')::int, 1), (img->>'id')::bigint)
      on conflict (shopify_image_id) do update set
        product_id = excluded.product_id, url = excluded.url, alt = excluded.alt, position = excluded.position;
      n_img := n_img + 1;
    end loop;
    delete from product_images
     where product_id = pid and shopify_image_id is not null
       and shopify_image_id not in (select (x->>'id')::bigint from jsonb_array_elements(coalesce(pr->'images', '[]'::jsonb)) x);

    -- variants
    for v in select * from jsonb_array_elements(coalesce(pr->'variants', '[]'::jsonb)) loop
      insert into product_variants (product_id, shopify_variant_id, shopify_sku, option1, option2, option3,
                                    price, compare_at_price, position, image_url, active, synced_at)
      values (pid, (v->>'id')::bigint, nullif(btrim(v->>'sku'), ''),
              case when v->>'option1' = 'Default Title' then null else v->>'option1' end,
              v->>'option2', v->>'option3',
              coalesce((v->>'price')::numeric(12,2), 0),
              nullif(v->>'compare_at_price', '')::numeric(12,2),
              coalesce((v->>'position')::int, 1),
              coalesce(v->'featured_image'->>'src', pr->'images'->0->>'src'),
              true, now())
      on conflict (shopify_variant_id) do update set
        product_id       = excluded.product_id,
        shopify_sku      = excluded.shopify_sku,
        option1          = excluded.option1,
        option2          = excluded.option2,
        option3          = excluded.option3,
        price            = excluded.price,
        compare_at_price = excluded.compare_at_price,
        position         = excluded.position,
        image_url        = excluded.image_url,
        active           = true,
        synced_at        = now();
      n_var := n_var + 1;
    end loop;
    update product_variants set active = false
     where product_id = pid and shopify_variant_id is not null
       and shopify_variant_id not in (select (x->>'id')::bigint from jsonb_array_elements(coalesce(pr->'variants', '[]'::jsonb)) x);
  end loop;

  -- Use the website SKU as the portal SKU only when it is present and unique.
  update product_variants pv set sku = pv.shopify_sku
   where pv.sku is null and pv.shopify_sku is not null
     and pv.shopify_sku ~ '^[A-Za-z0-9._/-]{1,40}$'
     and not exists (select 1 from product_variants o where o.sku = pv.shopify_sku)
     and not exists (select 1 from product_codes c where c.code = pv.shopify_sku)
     and (select count(*) from product_variants o where o.shopify_sku = pv.shopify_sku) = 1;

  return jsonb_build_object('products_new', n_new, 'products_updated', n_upd, 'variants', n_var, 'images', n_img);
end;
$$;

-- Products that disappeared from the website become inactive (never deleted).
create or replace function public.deactivate_missing_shopify_products(p_ids bigint[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;  -- never wipe on an empty feed
  update products set active = false
   where shopify_product_id is not null and active and not (shopify_product_id = any (p_ids));
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function public.sync_shopify_products(jsonb) from public, anon, authenticated;
revoke all on function public.deactivate_missing_shopify_products(bigint[]) from public, anon, authenticated;
grant execute on function public.sync_shopify_products(jsonb) to service_role;
grant execute on function public.deactivate_missing_shopify_products(bigint[]) to service_role;

-- ---------------------------------------------------------------------
-- Security: RLS on, no policies (server only).
-- ---------------------------------------------------------------------
alter table public.product_groups    enable row level security;
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.product_codes     enable row level security;
alter table public.product_images    enable row level security;
alter table public.sync_runs         enable row level security;
revoke all on public.product_groups, public.products, public.product_variants,
              public.product_codes, public.product_images, public.sync_runs
  from anon, authenticated;


-- ---------------------------------------------------------------------
-- One row per product for the list screen (search, filters, paging).
-- ---------------------------------------------------------------------
create or replace view public.product_list with (security_invoker = true) as
select p.id, p.name_en, p.name_ar, p.active, p.is_service, p.shopify_product_id, p.updated_at,
       p.group_id, g.name_en as group_en, g.name_ar as group_ar,
       count(v.id) filter (where v.active)                                  as variant_count,
       min(v.price) filter (where v.active)                                 as min_price,
       max(v.price) filter (where v.active)                                 as max_price,
       count(v.id) filter (where v.active and v.sku is null)                as missing_sku,
       (select i.url from public.product_images i where i.product_id = p.id order by i.position limit 1) as image_url,
       lower(p.name_en || ' ' || p.name_ar || ' ' || coalesce(string_agg(v.sku, ' '), '') || ' ' ||
             coalesce(string_agg(v.shopify_sku, ' '), '') || ' ' ||
             coalesce((select string_agg(c.code, ' ') from public.product_codes c join public.product_variants cv on cv.id = c.variant_id where cv.product_id = p.id), '')
       ) as search
  from public.products p
  left join public.product_groups g on g.id = p.group_id
  left join public.product_variants v on v.product_id = p.id
 group by p.id, g.id;

revoke all on public.product_list from anon, authenticated;

-- Website address for the sync
insert into public.settings (key, value) values ('shopify_store_url', '"https://athletic-horse.com"'::jsonb)
on conflict (key) do nothing;
