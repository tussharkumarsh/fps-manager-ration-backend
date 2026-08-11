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
  primary key (fps_id, src_no)
);

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
  saree numeric not null default 0,
  amount numeric not null default 0,
  portability text,
  auth_trans_time text,
  fetched_at timestamptz,
  source text not null default 'api' check (source in ('api', 'manual'))
);
create index if not exists transactions_fps_month_idx on transactions (fps_id, year, month);

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
  tx_field text not null default '' check (tx_field in ('wheat', 'rice', '')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (fps_id, item_id)
);

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

-- RLS stays disabled: all access goes through the backend service using the
-- service_role key, which bypasses RLS entirely. No table should ever be
-- queried directly from the browser with the anon key.
