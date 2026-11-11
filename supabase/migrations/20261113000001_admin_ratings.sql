-- Milestone 5: visit ratings, admin tools (barbers, services, fee tiers, reports), barber photos.

-- Ratings -------------------------------------------------------------------

/** Recompute a barber's average and count from their reviews. */
create or replace function refresh_barber_rating(p_barber uuid) returns void
language sql security definer set search_path = public as $$
  update barbers br set
    rating_avg   = coalesce((select round(avg(r.rating)::numeric, 2) from reviews r join bookings b on b.id = r.booking_id where b.barber_id = p_barber), 0),
    rating_count = (select count(*) from reviews r join bookings b on b.id = r.booking_id where b.barber_id = p_barber)
  where br.id = p_barber
$$;

/** Client rates a completed visit (1–5, optional comment). Rating again replaces the earlier one. */
create or replace function rate_booking(p_booking uuid, p_rating int, p_comment text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  if p_rating is null or p_rating not between 1 and 5 then perform booking_error('bad_request'); end if;
  select * into b from bookings where id = p_booking;
  if b.id is null or b.client_id is distinct from auth.uid() then perform booking_error('not_found'); end if;
  if b.status <> 'completed' then perform booking_error('not_completed'); end if;
  insert into reviews (booking_id, rating, comment)
  values (p_booking, p_rating, nullif(left(btrim(coalesce(p_comment, '')), 500), ''))
  on conflict (booking_id) do update set rating = excluded.rating, comment = excluded.comment;
  perform refresh_barber_rating(b.barber_id);
end $$;

-- Reviews go through rate_booking so the barber's average stays in sync.
drop policy if exists reviews_insert on reviews;

/** Recent reviews of a barber for their public profile (client first name only). */
create or replace function barber_reviews(p_barber uuid, p_limit int default 20)
returns table (rating smallint, comment text, created_at timestamptz, client_name text)
language sql stable security definer set search_path = public as $$
  select r.rating, r.comment, r.created_at, split_part(coalesce(p.full_name, ''), ' ', 1)
  from reviews r
  join bookings b on b.id = r.booking_id
  left join profiles p on p.user_id = b.client_id
  where b.barber_id = p_barber
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 50)
$$;

-- Seeded demo ratings were placeholders: start everyone from their real reviews.
select refresh_barber_rating(id) from barbers;

-- "Rate your visit" notification when a visit is marked completed ------------

create or replace function notify_booking(p_user uuid, p_kind text, b bookings)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_loc app_locale; v_is_barber boolean; v_svc text; v_barber text; v_client text; v_when text;
  v_title text; v_body text; v_with text;
begin
  if p_user is null then return; end if;
  select locale, role = 'barber' into v_loc, v_is_barber from profiles where user_id = p_user;
  if v_loc is null then return; end if;

  select case when v_loc = 'ru' then name_ru else name_uz end into v_svc from services where id = b.service_id;
  select p.full_name into v_barber from barbers br join profiles p on p.user_id = br.user_id where br.id = b.barber_id;
  v_client := coalesce((select full_name from profiles where user_id = b.client_id), b.walkin_name, '');
  v_when := to_char(b.starts_at at time zone 'Asia/Tashkent', 'DD.MM HH24:MI');
  v_with := case when v_is_barber then v_client else v_barber end;  -- the other party

  select t.title, t.body into v_title, v_body from (values
    ('confirmed',    'uz', 'Bron tasdiqlandi',        'Toʻlov salonda.'),
    ('confirmed',    'ru', 'Запись подтверждена',     'Оплата в салоне.'),
    ('new_booking',  'uz', 'Yangi bron',              ''),
    ('new_booking',  'ru', 'Новая запись',            ''),
    ('cancelled',    'uz', 'Bron bekor qilindi',      ''),
    ('cancelled',    'ru', 'Запись отменена',         ''),
    ('rescheduled',  'uz', 'Bron vaqti oʻzgardi',     'Yangi vaqt.'),
    ('rescheduled',  'ru', 'Время записи изменено',   'Новое время.'),
    ('reminder_24h', 'uz', 'Eslatma: tashrif yaqin',  'Rejangiz oʻzgarsa, bronni oldindan bekor qiling.'),
    ('reminder_24h', 'ru', 'Напоминание о визите',    'Если планы изменились, отмените запись заранее.'),
    ('reminder_2h',  'uz', 'Tashrifga 2 soat qoldi',  'Sizni kutamiz!'),
    ('reminder_2h',  'ru', 'До визита 2 часа',        'Ждём вас!'),
    ('no_show',      'uz', 'Tashrif qoldirildi',      'Sartarosh sizni kelmadi deb belgiladi.'),
    ('no_show',      'ru', 'Визит пропущен',          'Барбер отметил, что вы не пришли.'),
    ('rate_visit',   'uz', 'Tashrif qanday oʻtdi?',   'Ilovada sartaroshni baholang — bu boshqa mijozlarga yordam beradi.'),
    ('rate_visit',   'ru', 'Как прошёл визит?',       'Оцените барбера в приложении — это поможет другим клиентам.')
  ) as t(kind, loc, title, body)
  where t.kind = p_kind and t.loc = v_loc::text;

  insert into notifications (user_id, kind, title, body, booking_id, url)
  values (
    p_user, p_kind, v_title,
    concat_ws(E'\n', concat_ws(' · ', v_when, v_svc, nullif(v_with, '')), nullif(v_body, '')),
    b.id,
    case when v_is_barber then '/barber/today'
         when p_kind = 'rate_visit' then '/client/bookings?rate=' || b.id
         else '/client/bookings' end
  );
end $$;

create or replace function bookings_notify() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_barber_user uuid; v_actor uuid := auth.uid();
begin
  select user_id into v_barber_user from barbers where id = new.barber_id;

  if tg_op = 'INSERT' then
    if new.source = 'app' and new.status = 'confirmed' then
      perform notify_booking(new.client_id, 'confirmed', new);
      perform notify_booking(v_barber_user, 'new_booking', new);
    end if;
    return null;
  end if;

  if new.status = 'cancelled' and old.status <> 'cancelled' then
    if new.client_id is distinct from new.cancelled_by then perform notify_booking(new.client_id, 'cancelled', new); end if;
    if v_barber_user is distinct from new.cancelled_by then perform notify_booking(v_barber_user, 'cancelled', new); end if;
  elsif new.status = 'no_show' and old.status <> 'no_show' then
    perform notify_booking(new.client_id, 'no_show', new);
  elsif new.status = 'completed' and old.status <> 'completed' then
    perform notify_booking(new.client_id, 'rate_visit', new);
  elsif new.starts_at <> old.starts_at and new.status = 'confirmed' then
    if new.client_id is distinct from v_actor then perform notify_booking(new.client_id, 'rescheduled', new); end if;
    if v_barber_user is distinct from v_actor then perform notify_booking(v_barber_user, 'rescheduled', new); end if;
  end if;
  return null;
end $$;

-- Admin: barbers ------------------------------------------------------------

/**
 * Make an existing account a barber (offers every active service, Mon–Sat 10–19),
 * or deactivate one (hidden from booking; keeps history). Returns the barber's upcoming bookings count.
 */
create or replace function admin_set_barber(p_user uuid, p_active boolean)
returns int
language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_role user_role; v_upcoming int;
begin
  if not is_admin() then perform booking_error('forbidden'); end if;
  select role into v_role from profiles where user_id = p_user;
  if v_role is null then perform booking_error('not_found'); end if;
  if v_role = 'admin' then perform booking_error('bad_request'); end if;

  if p_active then
    update profiles set role = 'barber' where user_id = p_user;
    insert into barbers (user_id) values (p_user)
    on conflict (user_id) do update set is_active = true
    returning id into v_id;
    insert into barber_services (barber_id, service_id)
    select v_id, s.id from services s where s.is_active
    on conflict (barber_id, service_id) do nothing;
    insert into working_hours (barber_id, weekday, start_local, end_local)
    select v_id, d, '10:00', '19:00' from generate_series(1, 6) d
    where not exists (select 1 from working_hours w where w.barber_id = v_id);
  else
    update barbers set is_active = false where user_id = p_user returning id into v_id;
  end if;

  select count(*) into v_upcoming from bookings
  where barber_id = v_id and status in ('held', 'confirmed') and starts_at > now();
  return v_upcoming;
end $$;

-- A new service is offered by every barber (they can change price/duration later).
create or replace function services_offer_all() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into barber_services (barber_id, service_id)
  select b.id, new.id from barbers b
  on conflict (barber_id, service_id) do nothing;
  return null;
end $$;
create trigger services_offer_all after insert on services
for each row execute function services_offer_all();

-- Admin: fee tiers ----------------------------------------------------------

/**
 * Replace the active fee tiers with a new set, effective now. Old tiers are closed (kept for history),
 * so past bookings still point at the tier that priced them.
 * p_tiers: [{ "min": 0, "max": 30000, "fee": 1000 }, …, { "min": 60001, "max": null, "fee": 3000 }]
 */
create or replace function admin_save_fee_tiers(p_tiers jsonb)
returns void
language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := clock_timestamp();
begin
  if not is_admin() then perform booking_error('forbidden'); end if;
  if jsonb_typeof(p_tiers) <> 'array' or jsonb_array_length(p_tiers) = 0 then perform booking_error('bad_request'); end if;
  begin
    update fee_tiers set active_to = v_now where active_to is null or active_to > v_now;
    insert into fee_tiers (min_price_uzs, max_price_uzs, fee_uzs, active_from)
    select (t->>'min')::bigint, nullif(t->>'max', '')::bigint, (t->>'fee')::bigint, v_now
    from jsonb_array_elements(p_tiers) t;
  exception
    when exclusion_violation then perform booking_error('tiers_overlap');
    when check_violation or not_null_violation or invalid_text_representation then perform booking_error('bad_request');
  end;
end $$;

-- Admin: reports ------------------------------------------------------------

/** Totals, per-barber, per-service and per-day figures for bookings starting in [p_from, p_to). */
create or replace function admin_report(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not is_admin() then perform booking_error('forbidden'); end if;
  if p_to <= p_from or p_to - p_from > interval '400 days' then perform booking_error('bad_request'); end if;

  with b as (
    select * from bookings
    where starts_at >= p_from and starts_at < p_to and status not in ('held', 'expired')
  )
  select jsonb_build_object(
    'totals', (
      select jsonb_build_object(
        'bookings',    count(*) filter (where status <> 'cancelled'),
        'completed',   count(*) filter (where status = 'completed'),
        'no_show',     count(*) filter (where status = 'no_show'),
        'cancelled',   count(*) filter (where status = 'cancelled'),
        'upcoming',    count(*) filter (where status = 'confirmed'),
        'walkins',     count(*) filter (where source = 'walkin' and status <> 'cancelled'),
        'revenue',     coalesce(sum(price_uzs) filter (where status = 'completed'), 0),
        'fees',        coalesce(sum(fee_uzs) filter (where status = 'completed'), 0),
        'net',         coalesce(sum(barber_net_uzs) filter (where status = 'completed'), 0),
        'expected',    coalesce(sum(price_uzs) filter (where status = 'confirmed'), 0),
        'new_clients', (select count(*) from profiles where role = 'client' and created_at >= p_from and created_at < p_to),
        'reviews',     (select count(*) from reviews rv join b on b.id = rv.booking_id),
        'rating',      (select round(avg(rv.rating)::numeric, 2) from reviews rv join b on b.id = rv.booking_id)
      ) from b
    ),
    'barbers', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.revenue desc, x.name)
      from (
        select br.id as barber_id, p.full_name as name, br.is_active as active, br.rating_avg as rating,
               count(b.id) filter (where b.status <> 'cancelled') as bookings,
               count(b.id) filter (where b.status = 'completed') as completed,
               count(b.id) filter (where b.status = 'no_show') as no_show,
               coalesce(sum(b.price_uzs) filter (where b.status = 'completed'), 0) as revenue,
               coalesce(sum(b.fee_uzs) filter (where b.status = 'completed'), 0) as fees
        from barbers br
        join profiles p on p.user_id = br.user_id
        left join b on b.barber_id = br.id
        group by br.id, p.full_name, br.is_active, br.rating_avg
        having br.is_active or count(b.id) > 0
      ) x
    ), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.completed desc, x.sort)
      from (
        select s.id as service_id, s.name_uz, s.name_ru, s.sort,
               count(b.id) filter (where b.status = 'completed') as completed,
               coalesce(sum(b.price_uzs) filter (where b.status = 'completed'), 0) as revenue
        from services s
        left join b on b.service_id = s.id
        group by s.id
        having s.is_active or count(b.id) > 0
      ) x
    ), '[]'::jsonb),
    'days', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day::date, 'bookings', coalesce(x.bookings, 0), 'revenue', coalesce(x.revenue, 0)) order by d.day)
      from generate_series((p_from at time zone 'Asia/Tashkent')::date::timestamp, ((p_to - interval '1 second') at time zone 'Asia/Tashkent')::date::timestamp, interval '1 day') d(day)
      left join (
        select (starts_at at time zone 'Asia/Tashkent')::date as day,
               count(*) filter (where status <> 'cancelled') as bookings,
               coalesce(sum(price_uzs) filter (where status = 'completed'), 0) as revenue
        from b group by 1
      ) x on x.day = d.day::date
    ), '[]'::jsonb)
  ) into r;
  return r;
end $$;

revoke execute on function refresh_barber_rating, services_offer_all from public, anon, authenticated;
revoke execute on function rate_booking, admin_set_barber, admin_save_fee_tiers, admin_report from public, anon;

-- Barber photos -------------------------------------------------------------
-- Public bucket; files live under <user_id>/…, writable by that user or an admin.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy avatars_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy avatars_update on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
create policy avatars_delete on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
