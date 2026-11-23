-- =====================================================================
-- 0029_marketing.sql — marketing plan, budget and campaigns.
--   marketing_budget       planned budget per year, month and channel
--   marketing_campaigns    each campaign: channel, dates, budget, money spent by hand,
--                          discount code, goal; a Meta campaign is linked by its id
--   marketing_meta_daily   Meta (Facebook/Instagram) results per campaign per day,
--                          read from the Meta ad account (spend, reach, clicks, purchases)
-- Only adds. Safe to run more than once.
-- =====================================================================

create table if not exists public.marketing_budget (
  year    int not null check (year between 2020 and 2100),
  month   int not null check (month between 1 and 12),
  channel text not null check (channel ~ '^[a-z_]{2,30}$'),
  amount  numeric(12,2) not null default 0 check (amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (year, month, channel)
);

create table if not exists public.marketing_campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 200),
  channel          text not null check (channel ~ '^[a-z_]{2,30}$'),
  status           text not null default 'planned' check (status in ('planned', 'active', 'done', 'cancelled')),
  start_on         date not null,
  end_on           date check (end_on is null or end_on >= start_on),
  budget           numeric(12,2) not null default 0 check (budget >= 0),
  spend_manual     numeric(12,2) not null default 0 check (spend_manual >= 0),
  discount_code    text check (discount_code is null or length(discount_code) <= 60),
  goal             text not null default '' check (length(goal) <= 300),
  notes            text not null default '' check (length(notes) <= 1000),
  meta_campaign_id text unique check (meta_campaign_id is null or meta_campaign_id ~ '^[0-9]{5,30}$'),
  created_by       uuid references public.profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists marketing_campaigns_dates_idx on public.marketing_campaigns (start_on, end_on);

create table if not exists public.marketing_meta_daily (
  meta_campaign_id text not null,
  day              date not null,
  spend            numeric(12,2) not null default 0,
  impressions      bigint not null default 0,
  reach            bigint not null default 0,
  clicks           bigint not null default 0,
  purchases        int not null default 0,
  purchase_value   numeric(12,2) not null default 0,
  synced_at        timestamptz not null default now(),
  primary key (meta_campaign_id, day)
);

alter table public.marketing_budget enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_meta_daily enable row level security;
revoke all on public.marketing_budget, public.marketing_campaigns, public.marketing_meta_daily from anon, authenticated;
grant all on public.marketing_budget, public.marketing_campaigns, public.marketing_meta_daily to service_role;
