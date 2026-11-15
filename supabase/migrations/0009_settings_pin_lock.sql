-- =====================================================================
-- 0009_settings_pin_lock.sql — cashier settings, manager PIN lock-out,
-- "no selling below zero" rule.
-- Safe to run more than once.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Cashier settings (one value per key in `settings`; only added if missing)
-- ---------------------------------------------------------------------
insert into public.settings (key, value) values
  ('receipt_footer_ar', to_jsonb('الاسترجاع خلال 3 أيام مع هذا الإيصال'::text)),
  ('receipt_footer_en', to_jsonb('Returns within 3 days with this receipt'::text)),
  ('receipt_paper_mm', to_jsonb(80)),
  ('receipt_width_mm', to_jsonb(70)),
  ('late_allowed', to_jsonb(3)),
  ('late_day_value', to_jsonb(0.25)),
  ('absence_days', to_jsonb(1)),
  ('unexcused_absence_days', to_jsonb(2)),
  ('overtime_rate', to_jsonb(1))
on conflict (key) do nothing;
-- "No selling below zero" starts ON only once stock has been entered; with no
-- stock yet it would refuse every sale. Switch it in Company → Cashier settings.
insert into public.settings (key, value)
values ('block_negative_stock', to_jsonb(exists (select 1 from public.stock_levels where qty > 0)))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- Manager PIN: locked for 15 minutes after 5 wrong tries in a row.
-- ---------------------------------------------------------------------
alter table public.profiles add column if not exists pin_failed integer not null default 0;
alter table public.profiles add column if not exists pin_locked_until timestamptz;

create or replace function public.verify_staff_pin(p_username text, p_pin text)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, extensions
as $$
declare p record;
begin
  select id, pin_hash, active, pin_failed, pin_locked_until into p
    from profiles where username = lower(p_username) for update;
  if not found or not p.active or p.pin_hash is null then return null; end if;
  if p.pin_locked_until is not null and p.pin_locked_until > now() then return null; end if;
  if p.pin_hash = extensions.crypt(p_pin, p.pin_hash) then
    if p.pin_failed <> 0 or p.pin_locked_until is not null then
      update profiles set pin_failed = 0, pin_locked_until = null where id = p.id;
    end if;
    return p.id;
  end if;
  update profiles
     set pin_failed = case when p.pin_failed + 1 >= 5 then 0 else p.pin_failed + 1 end,
         pin_locked_until = case when p.pin_failed + 1 >= 5 then now() + interval '15 minutes' else pin_locked_until end
   where id = p.id;
  return null;
end;
$$;

create or replace function public.staff_pin_locked(p_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select pin_locked_until > now() from profiles where username = lower(p_username)), false);
$$;

revoke all on function public.verify_staff_pin(text, text) from public, anon, authenticated;
revoke all on function public.staff_pin_locked(text) from public, anon, authenticated;
grant execute on function public.verify_staff_pin(text, text) to service_role;
grant execute on function public.staff_pin_locked(text) to service_role;

-- ---------------------------------------------------------------------
-- No selling below zero (setting block_negative_stock). Applies to till
-- sales only: offline sales (they already happened) and website orders are
-- always accepted.
-- ---------------------------------------------------------------------
create or replace function public.apply_stock_change(
  p_location uuid, p_variant uuid, p_change numeric, p_kind text,
  p_doc uuid, p_user uuid, p_ref_type text default null, p_ref_id uuid default null)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare v_after numeric(12,3);
begin
  insert into stock_levels (location_id, variant_id, qty, updated_at)
  values (p_location, p_variant, p_change, now())
  on conflict (location_id, variant_id) do update set qty = stock_levels.qty + excluded.qty, updated_at = now()
  returning qty into v_after;
  if p_kind = 'sale' and p_ref_type = 'invoice' and v_after < 0
     and coalesce((select (value #>> '{}')::boolean from settings where key = 'block_negative_stock'), false)
     and not exists (select 1 from invoices where id = p_ref_id and offline_temp_no is not null) then
    raise exception 'not_enough_stock: % available', (v_after - p_change)::numeric(12,3);
  end if;
  insert into stock_movements (doc_id, kind, location_id, variant_id, qty_change, qty_after, ref_type, ref_id, created_by)
  values (p_doc, p_kind, p_location, p_variant, p_change, v_after, p_ref_type, p_ref_id, p_user);
  return v_after;
end;
$$;
revoke all on function public.apply_stock_change(uuid, uuid, numeric, text, uuid, uuid, text, uuid) from public, anon, authenticated;
grant execute on function public.apply_stock_change(uuid, uuid, numeric, text, uuid, uuid, text, uuid) to service_role;
