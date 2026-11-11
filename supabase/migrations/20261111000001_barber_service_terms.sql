-- Barbers set their own duration and price per service.
-- barber_services.price_override_uzs already existed; add the duration override and use both everywhere.

alter table barber_services add column duration_override_min int
  check (duration_override_min between 5 and 240 and duration_override_min % 5 = 0);

-- Booking money + end time: the barber's own price and duration win over the shop defaults.
create or replace function bookings_fill_money() returns trigger
language plpgsql set search_path = public as $$
declare
  v_price bigint; v_dur int; v_buf int; f record;
begin
  select coalesce(bs.price_override_uzs, s.price_uzs), coalesce(bs.duration_override_min, s.duration_min), s.buffer_min
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

/** Validates a slot and returns its end time (service + buffer). */
create or replace function check_slot(p_barber uuid, p_service uuid, p_starts_at timestamptz, p_ignore_booking uuid default null)
returns timestamptz
language plpgsql stable security definer set search_path = public as $$
declare
  v_dur int; v_buf int; v_ends timestamptz;
  v_local timestamp := p_starts_at at time zone 'Asia/Tashkent';
begin
  select coalesce(bs.duration_override_min, s.duration_min), s.buffer_min into v_dur, v_buf
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
revoke execute on function check_slot from public, anon, authenticated;

/** Barber sets their own duration (minutes, step 5) and price (UZS) for a service; offering it if not yet. */
create or replace function set_my_service(p_service uuid, p_duration int, p_price bigint)
returns void
language plpgsql security definer set search_path = public as $$
declare v_barber uuid := my_barber_id();
begin
  if v_barber is null then perform booking_error('not_barber'); end if;
  if p_duration is null or p_duration < 5 or p_duration > 240 or p_duration % 5 <> 0 then perform booking_error('bad_duration'); end if;
  if p_price is null or p_price < 1000 or p_price > 10000000 then perform booking_error('bad_price'); end if;
  if not exists (select 1 from services where id = p_service and is_active) then perform booking_error('service_unavailable'); end if;

  insert into barber_services (barber_id, service_id, price_override_uzs, duration_override_min)
  values (v_barber, p_service, p_price, p_duration)
  on conflict (barber_id, service_id) do update
    set price_override_uzs = excluded.price_override_uzs,
        duration_override_min = excluded.duration_override_min,
        updated_at = now();
end $$;

revoke execute on function set_my_service from public, anon;
grant execute on function set_my_service to authenticated;
