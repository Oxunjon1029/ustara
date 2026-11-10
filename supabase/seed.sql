-- Demo data for local development (supabase db reset). Password for every demo account: password12
-- Accounts: admin / jasur / bekzod / sardor (barbers) / aziz (client)

-- Safe to re-run: every insert skips rows that already exist.
insert into fee_tiers (min_price_uzs, max_price_uzs, fee_uzs)
select * from (values (0::bigint, 30000::bigint, 1000::bigint), (30001, 60000, 2000), (60001, null, 3000)) v
where not exists (select 1 from fee_tiers);

do $$
declare
  acc record;
  uid uuid;
begin
  for acc in select * from (values
    ('admin',  'Admin',  '+998900000001', 'admin'),
    ('jasur',  'Jasur',  '+998900000002', 'barber'),
    ('bekzod', 'Bekzod', '+998900000003', 'barber'),
    ('sardor', 'Sardor', '+998900000004', 'barber'),
    ('aziz',   'Aziz',   '+998901234567', 'client')
  ) as t(username, full_name, phone, role)
  loop
    continue when exists (select 1 from profiles p where p.username = acc.username);
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                            confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
            acc.username || '@users.ustara.local', extensions.crypt('password12', extensions.gen_salt('bf')), now(),
            jsonb_build_object('provider', 'email', 'providers', array['email'], 'role', acc.role),
            jsonb_build_object('full_name', acc.full_name, 'phone', acc.phone, 'username', acc.username),
            now(), now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text,
            jsonb_build_object('sub', uid::text, 'email', acc.username || '@users.ustara.local'),
            'email', now(), now(), now());
    if acc.role = 'barber' then
      insert into barbers (user_id, bio_uz, bio_ru, rating_avg, rating_count)
      values (uid, 'Tajribali sartarosh', 'Опытный барбер', 4.8, 12);
    end if;
  end loop;
end $$;

insert into services (name_uz, name_ru, duration_min, price_uzs, buffer_min, sort)
select * from (values
  ('Soch olish',   'Стрижка',           45, 50000::bigint, 0, 1),
  ('Soqol olish',  'Стрижка бороды',    30, 30000, 0, 2),
  ('Soch + soqol', 'Стрижка + борода',  75, 75000, 0, 3)) v
where not exists (select 1 from services);

-- every barber offers every service
insert into barber_services (barber_id, service_id)
select b.id, s.id from barbers b cross join services s
on conflict (barber_id, service_id) do nothing;

-- Mon–Sat 10:00–19:00, Sunday off; daily lunch handled as time_off by the app later
insert into working_hours (barber_id, weekday, start_local, end_local)
select b.id, d, '10:00', '19:00' from barbers b cross join generate_series(1, 6) d
where not exists (select 1 from working_hours w where w.barber_id = b.id);

-- demo accounts can book without Telegram
update profiles set phone_verified = true
where username in ('admin', 'jasur', 'bekzod', 'sardor', 'aziz') and not phone_verified;
