-- Milestone 4: notifications.
-- Booking events and reminders create rows in `notifications` (text rendered in the recipient's language).
-- The notify-dispatch Edge Function delivers them by Expo push (Android + iOS) and Telegram.
-- It is woken right after each insert (pg_net) and every minute by pg_cron (reminders + retries).

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

create table notifications (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,
  title         text not null,
  body          text not null,
  booking_id    uuid references bookings(id) on delete cascade,
  url           text,                       -- app route opened on tap
  read_at       timestamptz,
  dispatched_at timestamptz,
  push_result   text,
  tg_result     text,
  created_at    timestamptz not null default now()
);
create index notifications_user_idx on notifications (user_id, created_at desc);
create index notifications_pending_idx on notifications (created_at) where dispatched_at is null;

alter table notifications enable row level security;
create policy notifications_own on notifications for select using (user_id = auth.uid());

alter table bookings add column reminded_24h_at timestamptz, add column reminded_2h_at timestamptz;

-- Where the dispatcher lives and the shared secret it checks. Not exposed through the API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
create table private.dispatch (
  id     int primary key default 1 check (id = 1),
  url    text not null,
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex')
);
insert into private.dispatch (url) values ('https://guufqpkykxayvrpjycij.supabase.co/functions/v1/notify-dispatch')
on conflict (id) do nothing;

-- Message text ------------------------------------------------------------

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
    ('no_show',      'ru', 'Визит пропущен',          'Барбер отметил, что вы не пришли.')
  ) as t(kind, loc, title, body)
  where t.kind = p_kind and t.loc = v_loc::text;

  insert into notifications (user_id, kind, title, body, booking_id, url)
  values (
    p_user, p_kind, v_title,
    concat_ws(E'\n', concat_ws(' · ', v_when, v_svc, nullif(v_with, '')), nullif(v_body, '')),
    b.id,
    case when v_is_barber then '/barber/today' else '/client/bookings' end
  );
end $$;

-- Booking events → notifications -----------------------------------------

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
  elsif new.starts_at <> old.starts_at and new.status = 'confirmed' then
    if new.client_id is distinct from v_actor then perform notify_booking(new.client_id, 'rescheduled', new); end if;
    if v_barber_user is distinct from v_actor then perform notify_booking(v_barber_user, 'rescheduled', new); end if;
  end if;
  return null;
end $$;

create trigger bookings_notify after insert or update on bookings
for each row execute function bookings_notify();

-- A new time gets fresh reminders.
create or replace function bookings_reset_reminders() returns trigger
language plpgsql as $$
begin
  if new.starts_at <> old.starts_at then
    new.reminded_24h_at := null;
    new.reminded_2h_at := null;
  end if;
  return new;
end $$;
create trigger bookings_reset_reminders before update on bookings
for each row execute function bookings_reset_reminders();

-- Reminders: 24 h and 2 h before, only if the booking was made earlier than that.
create or replace function enqueue_reminders() returns void
language plpgsql security definer set search_path = public as $$
declare b bookings;
begin
  for b in
    select * from bookings
    where status = 'confirmed' and client_id is not null and reminded_24h_at is null
      and starts_at > now() and starts_at <= now() + interval '24 hours'
      and created_at < starts_at - interval '24 hours'
    for update skip locked
  loop
    perform notify_booking(b.client_id, 'reminder_24h', b);
    update bookings set reminded_24h_at = now() where id = b.id;
  end loop;

  for b in
    select * from bookings
    where status = 'confirmed' and client_id is not null and reminded_2h_at is null
      and starts_at > now() and starts_at <= now() + interval '2 hours'
      and created_at < starts_at - interval '2 hours'
    for update skip locked
  loop
    perform notify_booking(b.client_id, 'reminder_2h', b);
    update bookings set reminded_2h_at = now() where id = b.id;
  end loop;
end $$;

-- Delivery -----------------------------------------------------------------

/** Wake the dispatcher. Never lets a network problem fail the caller's transaction. */
create or replace function dispatch_kick() returns void
language plpgsql security definer set search_path = public, private as $$
declare d private.dispatch;
begin
  select * into d from private.dispatch where id = 1;
  perform net.http_post(
    url := d.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-dispatch-secret', d.secret),
    body := '{}'::jsonb
  );
exception when others then
  raise warning 'dispatch_kick: %', sqlerrm;
end $$;

create or replace function notifications_kick() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform dispatch_kick();
  return null;
end $$;
create trigger notifications_kick after insert on notifications
for each statement execute function notifications_kick();

/** Dispatcher only: is this the shared secret? */
create or replace function dispatch_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = public, private as $$
  select exists (select 1 from private.dispatch where secret = p_secret)
$$;

/** Dispatcher only: take up to p_limit pending notifications with where to send them. */
create or replace function claim_notifications(p_limit int default 100)
returns table (id uuid, title text, body text, url text, chat_id bigint, tokens text[])
language sql security definer set search_path = public as $$
  with c as (
    update notifications n set dispatched_at = now()
    where n.id in (
      select x.id from notifications x
      where x.dispatched_at is null and x.created_at > now() - interval '1 day'
      order by x.created_at limit p_limit
      for update skip locked
    )
    returning n.*
  )
  select c.id, c.title, c.body, c.url,
         (select tl.chat_id from telegram_links tl where tl.user_id = c.user_id),
         (select array_agg(pt.expo_token) from push_tokens pt where pt.user_id = c.user_id)
  from c
$$;

revoke execute on function notify_booking, enqueue_reminders, dispatch_kick, dispatch_secret_ok, claim_notifications
  from public, anon, authenticated;
grant execute on function dispatch_secret_ok, claim_notifications to service_role;

-- App-facing RPCs ------------------------------------------------------------

/** Register this device for push. A token moves to whoever signed in last on that phone. */
create or replace function register_push_token(p_token text, p_platform text)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then perform booking_error('not_signed_in'); end if;
  if p_platform not in ('ios', 'android') or p_token !~ '^Expo(nent)?PushToken\[.+\]$' then perform booking_error('bad_request'); end if;
  delete from push_tokens where expo_token = p_token and user_id <> auth.uid();
  insert into push_tokens (user_id, expo_token, platform) values (auth.uid(), p_token, p_platform)
  on conflict (expo_token) do update set updated_at = now();
end $$;

create or replace function unregister_push_token(p_token text)
returns void
language sql security definer set search_path = public as $$
  delete from push_tokens where expo_token = p_token and user_id = auth.uid()
$$;

/** Mark the caller's notifications read (all, or the given ids). */
create or replace function mark_notifications_read(p_ids uuid[] default null)
returns void
language sql security definer set search_path = public as $$
  update notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids))
$$;

revoke execute on function register_push_token, unregister_push_token, mark_notifications_read from public, anon;
grant execute on function register_push_token, unregister_push_token, mark_notifications_read to authenticated;

-- Every minute: queue due reminders, then deliver anything pending (also retries a missed kick).
select cron.schedule('ustara-notifications', '* * * * *', $$
  select public.enqueue_reminders();
  select public.dispatch_kick() where exists (
    select 1 from public.notifications where dispatched_at is null and created_at > now() - interval '1 day'
  );
$$);
