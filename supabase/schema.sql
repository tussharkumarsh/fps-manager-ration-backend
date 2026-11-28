-- FPS Manager Ration: Supabase schema
-- Mirrors the previous per-dealer Excel workbook (data/{fps_id}.xlsx) plus
-- the shared users workbook (data/users.xlsx), one table per former sheet.

create table if not exists users (
  fps_id text primary key,
  dist_code text not null,
  username text not null unique,
  password_hash text not null,
  display_name text not null default '',
  role text not null default 'dealer' check (role in ('dealer', 'admin')),
  created_at timestamptz not null default now(),
  active boolean not null default true
);

create table if not exists customers (
  fps_id text not null,
  src_no text not null,
  name text not null,
  last_dispatched text,
  scheme text check (scheme in ('PHH', 'AAY')),
  s_no integer,
  area_type text,
  status text,
  member_count integer,
  mobile text,
  family_head text,
  members_json jsonb,
  disabled boolean not null default false,
  disabled_reason text,
  disabled_at timestamptz,
  primary key (fps_id, src_no)
);

-- Added after initial deploy: manual disable/enable (run this if
-- `customers` already existed without these columns).
alter table customers add column if not exists disabled boolean not null default false;
alter table customers add column if not exists disabled_reason text;
alter table customers add column if not exists disabled_at timestamptz;

create table if not exists transactions (
  row_key text primary key,
  fps_id text not null,
  year text not null,
  month text not null,
  sl_no integer not null default 0,
  src_no text not null,
  scheme text not null default 'PHH',
  avail_type text not null default 'Authenticated',
  receipt_no text not null,
  date text,
  wheat numeric not null default 0,
  rice numeric not null default 0,
  sugar numeric not null default 0,
  saree numeric not null default 0,
  jowar numeric not null default 0,
  amount numeric not null default 0,
  portability text,
  auth_trans_time text,
  fetched_at timestamptz,
  source text not null default 'api' check (source in ('api', 'manual'))
);
create index if not exists transactions_fps_month_idx on transactions (fps_id, year, month);

-- Added after initial deploy: Sugar and Jowar columns from the government
-- transaction report's "Qty in Kgs" group (run this if `transactions` already
-- existed without them).
alter table transactions add column if not exists sugar numeric not null default 0;
alter table transactions add column if not exists jowar numeric not null default 0;

create table if not exists month_locks (
  fps_id text not null,
  year text not null,
  month text not null,
  status text not null default 'live' check (status in ('live', 'synced_locked')),
  last_synced_at timestamptz,
  record_count integer not null default 0,
  primary key (fps_id, year, month)
);

create table if not exists inventory_items (
  fps_id text not null,
  item_id text not null,
  name text not null,
  unit text not null,
  tx_field text not null default '' check (tx_field in ('wheat', 'rice', 'sugar', 'jowar', '')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (fps_id, item_id)
);

-- Added after initial deploy: widen tx_field to allow Sugar/Jowar-linked
-- items (run this if `inventory_items` already existed with the old,
-- narrower check).
alter table inventory_items drop constraint if exists inventory_items_tx_field_check;
alter table inventory_items add constraint inventory_items_tx_field_check
  check (tx_field in ('wheat', 'rice', 'sugar', 'jowar', ''));

create table if not exists inventory_ledger (
  fps_id text not null,
  year text not null,
  month text not null,
  item_id text not null,
  opening numeric not null default 0,
  received numeric not null default 0,
  distributed_manual numeric not null default 0,
  closing numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (fps_id, year, month, item_id)
);

-- Reference-only snapshot of the government's own stock register
-- (fps_stock_register_comm.action), pulled on demand. Kept separate from
-- inventory_ledger (the dealer's locally-tracked numbers) so the two can be
-- displayed side by side for comparison rather than one overwriting the other.
create table if not exists gov_stock_register (
  fps_id text not null,
  year text not null,
  month text not null,
  commodity text not null,
  unit text not null default '',
  alloted numeric not null default 0,
  opening numeric not null default 0,
  received_regular numeric not null default 0,
  received_extra numeric not null default 0,
  received_moved numeric not null default 0,
  issued numeric not null default 0,
  closing numeric not null default 0,
  fetched_at timestamptz not null default now(),
  primary key (fps_id, year, month, commodity)
);

create table if not exists scm_monthly_ro_records (
  fps_id text not null,
  shop_no text not null,
  district_code text not null,
  district_name text not null,
  year text not null,
  month text not null,
  ro_no text not null,
  ro_date text,
  ro_time text,
  dispatched boolean not null default false,
  sequence_no integer not null default 0,
  source_identifier text not null,
  imported_at timestamptz not null default now(),
  primary key (source_identifier)
);

create table if not exists scm_truck_chits (
  fps_id text not null,
  truck_chit_no text not null,
  ro_no text not null,
  year text not null,
  month text not null,
  sequence_no integer not null default 0,
  dispatch_date text,
  truck_no text,
  source_identifier text not null,
  imported_at timestamptz not null default now(),
  primary key (source_identifier)
);

create table if not exists scm_inventory_transactions (
  fps_id text not null,
  truck_chit_no text not null,
  ro_no text not null,
  year text not null,
  month text not null,
  scheme text not null,
  commodity text not null,
  unit text not null default '',
  allocated_qty numeric not null default 0,
  dispatched_qty numeric not null default 0,
  received_qty numeric not null default 0,
  transaction_date text,
  district_code text,
  source_identifier text not null,
  imported_at timestamptz not null default now(),
  primary key (source_identifier)
);

create table if not exists scm_inventory_summary (
  fps_id text not null,
  year text not null,
  month text not null,
  scheme text not null,
  commodity text not null,
  opening_stock numeric not null default 0,
  received_qty numeric not null default 0,
  distributed_qty numeric not null default 0,
  closing_stock numeric not null default 0,
  carried_forward_qty numeric not null default 0,
  truck_chit_count integer not null default 0,
  ro_count integer not null default 0,
  imported_at timestamptz not null default now(),
  primary key (fps_id, year, month, scheme, commodity)
);

create index if not exists scm_monthly_ro_records_lookup_idx on scm_monthly_ro_records (fps_id, year, month);
create index if not exists scm_truck_chits_lookup_idx on scm_truck_chits (fps_id, year, month);
create index if not exists scm_inventory_transactions_lookup_idx on scm_inventory_transactions (fps_id, year, month);
create index if not exists scm_inventory_summary_lookup_idx on scm_inventory_summary (fps_id, year, month);

-- RLS stays disabled: all access goes through the backend service using the
-- service_role key, which bypasses RLS entirely. No table should ever be
-- queried directly from the browser with the anon key.

-- Hand-entered goshwara (monthly summary) per FPS per month, kept alongside
-- the one computed from transactions so dealers can record the figures from
-- their manual register. `entries` maps a particular key (e.g. "wheat") to
-- { phh, aay }.
create table if not exists manual_goshwara (
  fps_id text not null,
  year text not null,
  month text not null,
  entries jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (fps_id, year, month)
);

-- Added 2026-11-26: ePOS commodity columns without a dedicated field
-- (e.g. a new scheme item) are kept here, keyed by the report's header text.
alter table transactions add column if not exists extra_items jsonb not null default '{}'::jsonb;

-- Added 2026-11-26: failed login attempts, for the per-identifier lockout
-- (10 failures / 15 minutes). Stored here rather than in memory so the
-- limit holds across serverless instances. Cleared on a successful login.
create table if not exists login_attempts (
  identifier text not null,
  attempted_at timestamptz not null default now()
);
create index if not exists login_attempts_idx on login_attempts (identifier, attempted_at);
-- RLS on with no policies: only the service_role backend can touch it.
alter table login_attempts enable row level security;

-- Added 2026-11-26: per-scheme allotment (e.g. {"PHH": 2358, "AAY": 1155})
-- from the portal's Detailed Allotment report, alongside the total in `alloted`.
alter table gov_stock_register add column if not exists alloted_by_scheme jsonb not null default '{}'::jsonb;

-- Added 2026-11-27: each dealer's own contact book of the other shops whose
-- ration cards collect at their shop (portability). shop_fps_id is the FPS
-- number the ePOS portability column shows for those transactions.
create table if not exists other_shops (
  fps_id text not null,
  shop_fps_id text not null,
  shop_name text not null default '',
  dealer_name text not null default '',
  mobile text not null default '',
  alt_mobile text not null default '',
  address text not null default '',
  notes text not null default '',
  updated_at timestamptz not null default now(),
  primary key (fps_id, shop_fps_id)
);
alter table other_shops enable row level security;

-- Added 2026-11-27: the portal's public FPS directory ("FPS Details",
-- /Epos_Spring/api/fps/afsoOwnerDetails), fetched per AFSO office on demand.
-- Shared by every dealer; holds no dealer's own data.
create table if not exists fps_directory (
  shop_fps_id text primary key,
  office_code text not null,
  owner_name text not null default '',
  terminal_id text not null default '',
  mobile_masked text not null default '',
  dist_name text not null default '',
  afso_name text not null default '',
  total_cards integer not null default 0,
  longitude double precision,
  latitude double precision,
  fetched_at timestamptz not null default now()
);
create index if not exists fps_directory_office_idx on fps_directory (office_code);
alter table fps_directory enable row level security;

-- Added 2026-11-28: government "FPS-wise RC & Member Details" uploads are
-- merged into customers. Each card records which FPS's file it came from
-- and when it was last present in an upload (the file carries no date).
-- portal_mobile is the file's (usually masked) mobile; it never replaces
-- the dealer's own `mobile`.
alter table customers add column if not exists source_fps_id text;
alter table customers add column if not exists source_fps_name text;
alter table customers add column if not exists portal_synced_at timestamptz;
alter table customers add column if not exists approval_date text;
alter table customers add column if not exists approved_by text;
alter table customers add column if not exists status_code text;
alter table customers add column if not exists portal_mobile text;

-- One row per beneficiary-file upload: the file's header and footer
-- summary, plus what the merge did.
create table if not exists beneficiary_imports (
  id uuid primary key default gen_random_uuid(),
  fps_id text not null,
  source_fps_id text not null,
  source_fps_name text not null default '',
  district text not null default '',
  dfso text not null default '',
  tfso text not null default '',
  office_code text not null default '',
  file_name text not null default '',
  imported_at timestamptz not null,
  cards integer not null default 0,
  members integer not null default 0,
  aay_cards integer not null default 0,
  phh_cards integer not null default 0,
  footer jsonb not null default '{}'::jsonb,
  new_cards integer not null default 0,
  updated_cards integer not null default 0,
  missing_cards integer not null default 0
);
create index if not exists beneficiary_imports_latest_idx
  on beneficiary_imports (fps_id, source_fps_id, imported_at desc);
alter table beneficiary_imports enable row level security;

-- Added 2026-11-28: shops from the government "FPS Wise Scheme Wise UID
-- Count" report (one file per TFSO), uploaded by a dealer. Public data,
-- shared like fps_directory; only shops related to the uploading dealer are
-- stored. A newer report (report_updated_at) always wins.
create table if not exists fps_shop_profiles (
  shop_fps_id text primary key,
  office_code text not null default '',
  dealer_name text not null default '',
  mobile text not null default '',
  shop_no text not null default '',
  village text not null default '',
  tehsil text not null default '',
  license_no text not null default '',
  shop_type text not null default '',
  district text not null default '',
  dfso text not null default '',
  tfso text not null default '',
  report_updated_on text not null default '',
  report_updated_at timestamptz not null,
  counts jsonb not null default '{}'::jsonb,
  uploaded_at timestamptz not null default now()
);
alter table fps_shop_profiles enable row level security;

-- Changed 2026-11-28: profiles are per dealer (what he uploaded), so one
-- dealer's upload never changes another dealer's view.
alter table fps_shop_profiles add column if not exists fps_id text;
update fps_shop_profiles set fps_id = '151209500212' where fps_id is null;
alter table fps_shop_profiles alter column fps_id set not null;
alter table fps_shop_profiles drop constraint if exists fps_shop_profiles_pkey;
alter table fps_shop_profiles add primary key (fps_id, shop_fps_id);

-- Added 2026-11-28: one row per nightly auto-sync job (per dealer, per
-- month for transactions, and SCM allotment). finished_at stays null when
-- a job ran out of time.
create table if not exists sync_runs (
  id uuid primary key default gen_random_uuid(),
  fps_id text not null,
  job text not null,
  year text not null default '',
  month text not null default '',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  ok boolean,
  detail text not null default ''
);
create index if not exists sync_runs_latest_idx on sync_runs (fps_id, started_at desc);
alter table sync_runs enable row level security;
