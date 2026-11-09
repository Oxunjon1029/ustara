-- Helpers -----------------------------------------------------------------
create or replace function auth_role() returns user_role
language sql stable security definer set search_path = public as $$
  select role from profiles where user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(auth_role() = 'admin', false)
$$;

create or replace function my_barber_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from barbers where user_id = auth.uid()
$$;

-- Fee for a price from the currently active tier (mirrors packages/shared/src/fee.ts)
create or replace function fee_for_price(p_price bigint, out fee bigint, out tier_id uuid)
language sql stable set search_path = public as $$
  select least(coalesce(t.fee_uzs, 0), p_price), t.id
  from (select 1) one
  left join fee_tiers t
    on p_price >= t.min_price_uzs
   and (t.max_price_uzs is null or p_price <= t.max_price_uzs)
   and now() >= t.active_from and (t.active_to is null or now() < t.active_to)
$$;

-- Snapshot price/fee/net on every new booking and compute ends_at from the service.
create or replace function bookings_fill_money() returns trigger
language plpgsql set search_path = public as $$
declare
  v_price bigint; v_dur int; v_buf int; f record;
begin
  select coalesce(bs.price_override_uzs, s.price_uzs), s.duration_min, s.buffer_min
    into v_price, v_dur, v_buf
  from services s
  left join barber_services bs on bs.service_id = s.id and bs.barber_id = new.barber_id
  where s.id = new.service_id;
  if v_price is null then raise exception 'unknown service %', new.service_id; end if;

  select * into f from fee_for_price(v_price);
  new.price_uzs        := v_price;
  new.fee_uzs          := f.fee;
  new.client_total_uzs := v_price;            -- fee_payer = barber: client pays price only
  new.barber_net_uzs   := v_price - f.fee;
  new.fee_tier_id      := f.tier_id;
  new.ends_at          := new.starts_at + make_interval(mins => v_dur + v_buf);
  return new;
end $$;

create trigger bookings_fill_money before insert on bookings
for each row execute function bookings_fill_money();

-- Create a profile row for every new auth user (role/name come from admin-API metadata).
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, full_name, phone, username, role, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.raw_user_meta_data->>'phone',
    new.raw_user_meta_data->>'username',
    coalesce((new.raw_app_meta_data->>'role')::user_role, 'client'),
    coalesce((new.raw_user_meta_data->>'locale')::app_locale, 'uz')
  );
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function handle_new_user();

-- Clients may not change their own role or lockout fields.
create or replace function profiles_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if not is_admin() and current_user = 'authenticated' then
    new.role := old.role;
    new.failed_logins := old.failed_logins;
    new.locked_until := old.locked_until;
    new.no_show_count := old.no_show_count;
    new.booking_blocked := old.booking_blocked;
    new.phone_verified := old.phone_verified;
  end if;
  return new;
end $$;
create trigger profiles_guard before update on profiles
for each row execute function profiles_guard();

-- Row Level Security ------------------------------------------------------
alter table profiles            enable row level security;
alter table telegram_links      enable row level security;
alter table auth_tokens         enable row level security;
alter table push_tokens         enable row level security;
alter table barbers             enable row level security;
alter table services            enable row level security;
alter table barber_services     enable row level security;
alter table working_hours       enable row level security;
alter table time_off            enable row level security;
alter table fee_tiers           enable row level security;
alter table bookings            enable row level security;
alter table payouts             enable row level security;
alter table transactions        enable row level security;
alter table payment_events      enable row level security;
alter table barber_payout_cards enable row level security;
alter table audit_log           enable row level security;
alter table client_notes        enable row level security;
alter table reviews             enable row level security;
alter table settings            enable row level security;

-- profiles: own row; barbers see clients they serve; admin all
create policy profiles_select on profiles for select using (
  user_id = auth.uid() or is_admin()
  or exists (select 1 from bookings b where b.client_id = profiles.user_id and b.barber_id = my_barber_id())
  or exists (select 1 from barbers br where br.user_id = profiles.user_id and br.is_active) -- barber names are public
);
create policy profiles_update on profiles for update using (user_id = auth.uid() or is_admin());

create policy telegram_links_select on telegram_links for select using (user_id = auth.uid() or is_admin());
-- auth_tokens, payment_events, audit_log: service role only (no policies = no access)
create policy push_tokens_own on push_tokens for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- public catalogue
create policy barbers_read on barbers for select using (is_active or user_id = auth.uid() or is_admin());
create policy barbers_self_update on barbers for update using (user_id = auth.uid() or is_admin());
create policy barbers_admin on barbers for insert with check (is_admin());

create policy services_read on services for select using (is_active or is_admin());
create policy services_admin on services for all using (is_admin()) with check (is_admin());

create policy barber_services_read on barber_services for select using (true);
create policy barber_services_admin on barber_services for all using (is_admin()) with check (is_admin());

create policy working_hours_read on working_hours for select using (true);
create policy working_hours_write on working_hours for all
  using (barber_id = my_barber_id() or is_admin()) with check (barber_id = my_barber_id() or is_admin());

-- time_off: anyone signed in may read (needed for slot grid); barber/admin write
create policy time_off_read on time_off for select using (auth.uid() is not null);
create policy time_off_write on time_off for all
  using (barber_id = my_barber_id() or is_admin()) with check (barber_id = my_barber_id() or is_admin());

create policy fee_tiers_read on fee_tiers for select using (true);
create policy fee_tiers_admin on fee_tiers for all using (is_admin()) with check (is_admin());

-- bookings
create policy bookings_select on bookings for select using (
  client_id = auth.uid() or barber_id = my_barber_id() or is_admin()
);
create policy bookings_insert on bookings for insert with check (
  is_admin()
  or (source = 'walkin' and barber_id = my_barber_id())
  or (source = 'app' and client_id = auth.uid()
      and not coalesce((select booking_blocked from profiles where user_id = auth.uid()), true))
);
create policy bookings_update on bookings for update using (
  client_id = auth.uid() or barber_id = my_barber_id() or is_admin()
);

-- Occupied time for the slot grid without exposing who booked.
create or replace function busy_intervals(p_barber uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select starts_at, ends_at from bookings
  where barber_id = p_barber and status in ('held', 'confirmed')
    and tstzrange(starts_at, ends_at) && tstzrange(p_from, p_to)
$$;
grant execute on function busy_intervals to authenticated;

-- money: read-only for owners, written by Edge Functions (service role)
create policy payouts_select on payouts for select using (barber_id = my_barber_id() or is_admin());
create policy payouts_admin_update on payouts for update using (is_admin());
create policy transactions_select on transactions for select using (
  is_admin() or exists (
    select 1 from bookings b where b.id = transactions.booking_id
      and (b.client_id = auth.uid() or b.barber_id = my_barber_id())
  )
);
-- payout cards: card_number_enc is never selectable by the app
create policy payout_cards_select on barber_payout_cards for select using (barber_id = my_barber_id() or is_admin());
revoke all on barber_payout_cards from authenticated, anon;
grant select (id, barber_id, card_last4, card_brand, holder_name, is_active, verified_at, created_at, updated_at)
  on barber_payout_cards to authenticated;

create policy client_notes_rw on client_notes for all
  using (is_admin() or auth_role() = 'barber') with check (author_id = auth.uid());

create policy reviews_read on reviews for select using (true);
create policy reviews_insert on reviews for insert with check (
  exists (select 1 from bookings b where b.id = booking_id and b.client_id = auth.uid() and b.status = 'completed')
);

create policy settings_read on settings for select using (true);
create policy settings_admin on settings for update using (is_admin());
