-- Milestone 3: booking and scheduling rules, enforced in the database.
-- All writes to bookings go through these functions; direct client/barber writes are closed.

alter table bookings add column paid_method text check (paid_method in ('cash', 'card'));

drop policy bookings_insert on bookings;
drop policy bookings_update on bookings;
create policy bookings_admin_write on bookings for insert with check (is_admin());
create policy bookings_admin_update on bookings for update using (is_admin());

-- Raise a client-readable error: the app maps the message (e.g. 'slot_taken') to a translation.
create or replace function booking_error(code text) returns void language plpgsql as $$
begin raise exception using message = code, errcode = 'P0001'; end $$;

/** Validates a slot and returns its end time (service + buffer). */
create or replace function check_slot(p_barber uuid, p_service uuid, p_starts_at timestamptz, p_ignore_booking uuid default null)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_dur int; v_buf int; v_ends timestamptz;
  v_local timestamp := p_starts_at at time zone 'Asia/Tashkent';
begin
  select s.duration_min, s.buffer_min into v_dur, v_buf
  from services s join barber_services bs on bs.service_id = s.id and bs.barber_id = p_barber
  join barbers b on b.id = p_barber and b.is_active
  where s.id = p_service and s.is_active;
  if v_dur is null then perform booking_error('service_unavailable'); end if;

  if p_starts_at < now() then perform booking_error('slot_in_past'); end if;
  if p_starts_at > now() + interval '15 days' then perform booking_error('too_far_ahead'); end if;

  -- Service must fit inside one working-hours block on that local weekday.
  if not exists (
    select 1 from working_hours w
    where w.barber_id = p_barber and w.weekday = extract(dow from v_local)
      and v_local::time >= w.start_local
      and (v_local + make_interval(mins => v_dur))::time <= w.end_local
      and (v_local + make_interval(mins => v_dur))::date = v_local::date
  ) then perform booking_error('outside_hours'); end if;

  v_ends := p_starts_at + make_interval(mins => v_dur + v_buf);
  if exists (
    select 1 from time_off t
    where t.barber_id = p_barber and tstzrange(t.starts_at, t.ends_at) && tstzrange(p_starts_at, v_ends)
  ) then perform booking_error('barber_off'); end if;

  -- Friendly early check; the exclusion constraint is the real guarantee under concurrency.
  if exists (
    select 1 from bookings k
    where k.barber_id = p_barber and k.status in ('held', 'confirmed')
      and k.id is distinct from p_ignore_booking
      and tstzrange(k.starts_at, k.ends_at) && tstzrange(p_starts_at, v_ends)
  ) then perform booking_error('slot_taken'); end if;
  return v_ends;
end $$;

/** Client books a slot. Pilot (payment_mode = in_shop): confirmed straight away. */
create or replace function create_booking(p_barber uuid, p_service uuid, p_starts_at timestamptz)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_profile profiles; v_mode payment_mode; v_hold int; v_id uuid;
begin
  select * into v_profile from profiles where user_id = auth.uid();
  if v_profile is null then perform booking_error('unauthorized'); end if;
  if v_profile.booking_blocked then perform booking_error('booking_blocked'); end if;
  if not v_profile.phone_verified then perform booking_error('phone_not_verified'); end if;

  perform check_slot(p_barber, p_service, p_starts_at);
  select payment_mode, hold_minutes into v_mode, v_hold from settings;

  insert into bookings (client_id, barber_id, service_id, starts_at, ends_at, status, hold_expires_at, source,
                        price_uzs, fee_uzs, client_total_uzs, barber_net_uzs)
  values (auth.uid(), p_barber, p_service, p_starts_at, p_starts_at, -- ends_at and money set by trigger
          case when v_mode = 'in_shop' then 'confirmed'::booking_status else 'held' end,
          case when v_mode = 'in_shop' then null else now() + make_interval(mins => v_hold) end,
          'app', 0, 0, 0, 0)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  perform booking_error('slot_taken');
end $$;

/** Barber adds a walk-in (now or later today). */
create or replace function add_walkin(p_service uuid, p_starts_at timestamptz, p_name text, p_phone text, p_paid_method text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_barber uuid := my_barber_id(); v_id uuid; v_client uuid;
begin
  if v_barber is null then perform booking_error('unauthorized'); end if;
  -- Allow "started a few minutes ago" for walk-ins.
  perform check_slot(v_barber, p_service, greatest(p_starts_at, now() + interval '1 second'));
  if p_phone is not null then select user_id into v_client from profiles where phone = p_phone; end if;

  insert into bookings (client_id, walkin_name, walkin_phone, barber_id, service_id, starts_at, ends_at, status, source,
                        paid_method, price_uzs, fee_uzs, client_total_uzs, barber_net_uzs)
  values (v_client, nullif(trim(p_name), ''), p_phone, v_barber, p_service, p_starts_at, p_starts_at, 'confirmed', 'walkin',
          p_paid_method, 0, 0, 0, 0)
  returning id into v_id;
  return v_id;
exception when exclusion_violation then
  perform booking_error('slot_taken');
end $$;

/** Who may act on a booking: 'client', 'barber', 'admin' or null. */
create or replace function booking_actor(b bookings) returns text
language sql stable security definer set search_path = public as $$
  select case
    when is_admin() then 'admin'
    when b.barber_id = my_barber_id() then 'barber'
    when b.client_id = auth.uid() then 'client'
  end
$$;

create or replace function cancel_booking(p_booking uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; v_actor text;
begin
  select * into b from bookings where id = p_booking for update;
  v_actor := booking_actor(b);
  if b.id is null or v_actor is null then perform booking_error('not_found'); end if;
  if b.status not in ('held', 'confirmed') then perform booking_error('not_cancellable'); end if;
  if v_actor = 'client' and b.starts_at <= now() then perform booking_error('not_cancellable'); end if;
  -- Refund rules (cancel < 2h = no refund) apply once online payments are on (Milestone 6).
  update bookings set status = 'cancelled', cancelled_by = auth.uid(), cancelled_at = now() where id = p_booking;
end $$;

create or replace function reschedule_booking(p_booking uuid, p_starts_at timestamptz)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; v_actor text; v_window int; v_ends timestamptz;
begin
  select * into b from bookings where id = p_booking for update;
  v_actor := booking_actor(b);
  if b.id is null or v_actor is null then perform booking_error('not_found'); end if;
  if b.status <> 'confirmed' then perform booking_error('not_reschedulable'); end if;
  if v_actor = 'client' then
    select reschedule_window_minutes into v_window from settings;
    if b.reschedule_count >= 1 then perform booking_error('reschedule_used'); end if;
    if b.starts_at < now() + make_interval(mins => v_window) then perform booking_error('reschedule_too_late'); end if;
  end if;
  v_ends := check_slot(b.barber_id, b.service_id, p_starts_at, b.id);
  update bookings
     set starts_at = p_starts_at, ends_at = v_ends,
         reschedule_count = reschedule_count + case when v_actor = 'client' then 1 else 0 end
   where id = p_booking;
exception when exclusion_violation then
  perform booking_error('slot_taken');
end $$;

/** Barber/admin marks the visit completed or no-show; repeated no-shows block online booking. */
create or replace function set_booking_outcome(p_booking uuid, p_status booking_status)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings; v_limit int;
begin
  if p_status not in ('completed', 'no_show') then perform booking_error('bad_request'); end if;
  select * into b from bookings where id = p_booking for update;
  if b.id is null or booking_actor(b) not in ('barber', 'admin') then perform booking_error('not_found'); end if;
  if b.status <> 'confirmed' then perform booking_error('not_confirmed'); end if;
  if b.starts_at > now() then perform booking_error('not_started'); end if;

  update bookings set status = p_status where id = p_booking;
  if p_status = 'no_show' and b.client_id is not null then
    select no_show_limit into v_limit from settings;
    update profiles set no_show_count = no_show_count + 1,
                        booking_blocked = booking_blocked or no_show_count + 1 >= v_limit
     where user_id = b.client_id;
  end if;
end $$;

-- Helper functions are internal; only the actions are callable by signed-in users.
revoke execute on function check_slot, booking_error, booking_actor from public, anon, authenticated;
revoke execute on function create_booking, add_walkin, cancel_booking, reschedule_booking, set_booking_outcome from public, anon;
grant execute on function create_booking, add_walkin, cancel_booking, reschedule_booking, set_booking_outcome to authenticated;
