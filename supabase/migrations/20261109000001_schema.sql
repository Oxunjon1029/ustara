-- Ustara MVP schema. Times: timestamptz (UTC). Money: bigint whole UZS.
create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- Enums -------------------------------------------------------------------
create type user_role       as enum ('client', 'barber', 'admin');
create type app_locale      as enum ('uz', 'ru');
create type booking_status  as enum ('held', 'confirmed', 'completed', 'no_show', 'cancelled', 'expired');
create type booking_source  as enum ('app', 'walkin');
create type token_purpose   as enum ('login', 'link', 'reset');
create type token_status    as enum ('pending', 'confirmed', 'used', 'expired');
create type time_off_kind   as enum ('break', 'day_off', 'vacation');
create type pay_provider    as enum ('payme', 'click', 'uzum', 'cash');
create type txn_kind        as enum ('payment', 'refund');
create type txn_status      as enum ('created', 'performed', 'cancelled', 'failed');
create type payout_status   as enum ('draft', 'paid');
create type payment_mode    as enum ('in_shop', 'online');
create type fee_payer       as enum ('client', 'barber');

-- updated_at trigger ------------------------------------------------------
create or replace function set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- Accounts ----------------------------------------------------------------
create table profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique references auth.users(id) on delete cascade,
  role            user_role not null default 'client',
  full_name       text not null,
  phone           text unique,
  username        text unique,
  locale          app_locale not null default 'uz',
  phone_verified  boolean not null default false,
  failed_logins   int not null default 0 check (failed_logins >= 0),
  locked_until    timestamptz,
  no_show_count   int not null default 0 check (no_show_count >= 0),
  booking_blocked boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (username is null or username ~ '^[A-Za-z0-9_]{3,32}$'),
  check (phone is null or phone ~ '^\+998[0-9]{9}$')
);

create table telegram_links (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null unique references auth.users(id) on delete cascade,
  telegram_user_id bigint not null unique,
  chat_id          bigint not null,
  tg_username      text,
  linked_at        timestamptz not null default now(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table auth_tokens (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique, -- SHA-256 hex, never the raw token
  purpose          token_purpose not null,
  user_id          uuid references auth.users(id) on delete cascade,
  telegram_user_id bigint,
  status           token_status not null default 'pending',
  expires_at       timestamptz not null default now() + interval '5 minutes',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table push_tokens (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  expo_token  text not null unique,
  platform    text not null check (platform in ('ios', 'android', 'web')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Shop ----------------------------------------------------------------------
create table barbers (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  bio_uz        text,
  bio_ru        text,
  photo_path    text,
  rating_avg    numeric(3,2) not null default 0,
  rating_count  int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table services (
  id            uuid primary key default gen_random_uuid(),
  name_uz       text not null,
  name_ru       text not null,
  duration_min  int not null check (duration_min > 0),
  price_uzs     bigint not null check (price_uzs >= 0),
  buffer_min    int not null default 0 check (buffer_min >= 0),
  is_active     boolean not null default true,
  sort          int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table barber_services (
  id                  uuid primary key default gen_random_uuid(),
  barber_id           uuid not null references barbers(id) on delete cascade,
  service_id          uuid not null references services(id) on delete cascade,
  price_override_uzs  bigint check (price_override_uzs >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (barber_id, service_id)
);

create table working_hours (
  id           uuid primary key default gen_random_uuid(),
  barber_id    uuid not null references barbers(id) on delete cascade,
  weekday      smallint not null check (weekday between 0 and 6), -- 0 = Sunday
  start_local  time not null,
  end_local    time not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (end_local > start_local)
);

create table time_off (
  id          uuid primary key default gen_random_uuid(),
  barber_id   uuid not null references barbers(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  kind        time_off_kind not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

-- Money -------------------------------------------------------------------
create table fee_tiers (
  id             uuid primary key default gen_random_uuid(),
  min_price_uzs  bigint not null check (min_price_uzs >= 0),
  max_price_uzs  bigint check (max_price_uzs is null or max_price_uzs >= min_price_uzs),
  fee_uzs        bigint not null check (fee_uzs >= 0),
  active_from    timestamptz not null default now(),
  active_to      timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  -- inclusive price range; no two tiers active at the same time may overlap
  exclude using gist (
    int8range(min_price_uzs, max_price_uzs, '[]') with &&,
    tstzrange(active_from, active_to) with &&
  )
);

create table bookings (
  id                uuid primary key default gen_random_uuid(),
  client_id         uuid references auth.users(id) on delete set null, -- null for walk-ins
  walkin_name       text,
  walkin_phone      text,
  barber_id         uuid not null references barbers(id),
  service_id        uuid not null references services(id),
  starts_at         timestamptz not null,
  ends_at           timestamptz not null, -- includes buffer
  status            booking_status not null,
  hold_expires_at   timestamptz,
  source            booking_source not null default 'app',
  price_uzs         bigint not null check (price_uzs >= 0),
  fee_uzs           bigint not null check (fee_uzs >= 0),
  client_total_uzs  bigint not null check (client_total_uzs >= 0),
  barber_net_uzs    bigint not null check (barber_net_uzs >= 0),
  fee_tier_id       uuid references fee_tiers(id),
  reschedule_count  int not null default 0,
  cancelled_by      uuid references auth.users(id),
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (ends_at > starts_at),
  check (barber_net_uzs = price_uzs - fee_uzs),
  check (client_total_uzs = price_uzs),
  check (source = 'walkin' or client_id is not null),
  check (status <> 'held' or hold_expires_at is not null),
  -- No double-booking, even under concurrent requests.
  constraint bookings_no_overlap exclude using gist (
    barber_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('held', 'confirmed'))
);
create index bookings_client_idx on bookings (client_id, starts_at desc);
create index bookings_barber_idx on bookings (barber_id, starts_at);

create table payouts (
  id            uuid primary key default gen_random_uuid(),
  barber_id     uuid not null references barbers(id),
  period_start  date not null,
  period_end    date not null,
  gross_uzs     bigint not null default 0 check (gross_uzs >= 0),
  fee_uzs       bigint not null default 0 check (fee_uzs >= 0),
  net_uzs       bigint not null default 0 check (net_uzs >= 0),
  status        payout_status not null default 'draft',
  paid_at       timestamptz,
  reference     text,
  card_last4    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (barber_id, period_start)
);

create table transactions (
  id               uuid primary key default gen_random_uuid(),
  booking_id       uuid not null references bookings(id),
  provider         pay_provider not null,
  provider_txn_id  text,
  kind             txn_kind not null default 'payment',
  amount_uzs       bigint not null check (amount_uzs >= 0),
  price_uzs        bigint not null check (price_uzs >= 0),
  fee_uzs          bigint not null check (fee_uzs >= 0),
  barber_net_uzs   bigint not null check (barber_net_uzs >= 0),
  status           txn_status not null default 'created',
  provider_state   int,
  performed_at     timestamptz,
  cancelled_at     timestamptz,
  cancel_reason    int,
  payout_id        uuid references payouts(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (provider, provider_txn_id)
);

create table payment_events (
  id             uuid primary key default gen_random_uuid(),
  provider       pay_provider not null,
  method         text not null,
  request_json   jsonb not null,
  response_json  jsonb,
  received_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table barber_payout_cards (
  id               uuid primary key default gen_random_uuid(),
  barber_id        uuid not null references barbers(id) on delete cascade,
  card_number_enc  bytea not null, -- encrypted via Vault; never returned to the app
  card_last4       text not null check (card_last4 ~ '^[0-9]{4}$'),
  card_brand       text not null check (card_brand in ('uzcard', 'humo', 'visa', 'mastercard')),
  holder_name      text not null,
  is_active        boolean not null default true,
  verified_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index barber_payout_cards_one_active on barber_payout_cards (barber_id) where is_active;

create table audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references auth.users(id),
  action      text not null,
  target      text,
  details     jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- CRM ---------------------------------------------------------------------
create table client_notes (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references auth.users(id) on delete cascade,
  author_id   uuid not null references auth.users(id),
  body        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table reviews (
  id          uuid primary key default gen_random_uuid(),
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  rating      smallint not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table settings (
  id                         boolean primary key default true check (id), -- single row
  fee_payer                  fee_payer not null default 'barber',
  hold_minutes               int not null default 10 check (hold_minutes > 0),
  refund_window_minutes      int not null default 120 check (refund_window_minutes >= 0),
  reschedule_window_minutes  int not null default 120 check (reschedule_window_minutes >= 0),
  shop_open                  time not null default '10:00',
  shop_close                 time not null default '20:00',
  payment_mode               payment_mode not null default 'in_shop',
  no_show_limit              int not null default 2 check (no_show_limit > 0),
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now()
);
insert into settings default values;

-- updated_at triggers on every table
do $$
declare t text;
begin
  for t in select table_name from information_schema.columns
           where table_schema = 'public' and column_name = 'updated_at'
  loop
    execute format('create trigger %I_updated_at before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;
