-- =====================================================================
-- 0016_offline_everywhere.sql — a desk quotation made with no connection
-- keeps its temporary number (OFF-…-Q0001) so the cashier can find it by
-- that number (or its QR) once it has been sent.
-- Only adds: safe to run more than once.
-- =====================================================================

alter table public.quotations add column if not exists offline_temp_no text;
create unique index if not exists quotations_offline_temp_no_uq on public.quotations (offline_temp_no) where offline_temp_no is not null;
