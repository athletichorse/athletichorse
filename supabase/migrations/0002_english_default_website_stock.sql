-- =====================================================================
-- 0002_english_default_website_stock.sql
--  * English becomes the default language (Arabic stays available).
--  * Setting: which location's stock the website sells from
--    (Jeddah branch BR02 until the owner changes it).
-- Safe to run more than once.
-- =====================================================================

alter table public.profiles alter column locale set default 'en';

-- Switch everyone who still has the old default to English (one-time; harmless if re-run).
update public.profiles set locale = 'en' where locale = 'ar'
  and not exists (select 1 from public.settings where key = 'english_default_applied');

insert into public.settings (key, value) values ('english_default_applied', 'true'::jsonb)
on conflict (key) do nothing;

-- Website stock source = Jeddah branch, stored as the location id.
insert into public.settings (key, value)
select 'website_stock_location', to_jsonb(id::text)
  from public.locations
 where code = 'BR02'
on conflict (key) do nothing;
