-- Faster password login: one round trip returns the account, its auth email and both failure counts
-- (previously four separate calls from the Edge Function).
create or replace function login_lookup(p_login text, p_ip_key text, p_window_min int)
returns table (user_id uuid, email text, locked_until timestamptz, failed_logins int, ip_fails int, acct_fails int)
language sql stable security definer set search_path = public as $$
  with acct as (
    select p.user_id, p.locked_until, p.failed_logins from profiles p
    where lower(p.username) = lower(p_login) or p.phone = regexp_replace(p_login, '[\s()-]', '', 'g')
    limit 1
  )
  select a.user_id, u.email::text, a.locked_until, a.failed_logins,
         (select count(*)::int from auth_attempts x
           where x.key = p_ip_key and x.at >= now() - make_interval(mins => p_window_min)),
         (select count(*)::int from auth_attempts x
           where a.user_id is not null and x.key = 'acct:' || a.user_id and x.at >= now() - make_interval(mins => p_window_min))
  from (select 1) one
  left join acct a on true
  left join auth.users u on u.id = a.user_id
$$;
revoke execute on function login_lookup from public, anon, authenticated;
grant execute on function login_lookup to service_role;
