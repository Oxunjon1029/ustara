-- Milestone 2: authentication support.

-- Failed login / signup / token attempts for rate limiting (written only by Edge Functions).
create table auth_attempts (
  id          bigint generated always as identity primary key,
  key         text not null,              -- e.g. 'ip:1.2.3.4', 'acct:<user_id>', 'signup:<ip>', 'tg:<ip>'
  at          timestamptz not null default now()
);
create index auth_attempts_key_at on auth_attempts (key, at desc);
alter table auth_attempts enable row level security; -- no policies: service role only

-- The bot message that asked for confirmation, so it can be edited after the tap.
alter table auth_tokens add column bot_chat_id bigint, add column bot_message_id bigint;
create index auth_tokens_tg_pending on auth_tokens (telegram_user_id, created_at desc) where status = 'pending';

-- Lookup used by the login function: phone or username → auth user id.
create or replace function find_login(p_login text)
returns table (user_id uuid, locked_until timestamptz, failed_logins int)
language sql stable security definer set search_path = public as $$
  select user_id, locked_until, failed_logins from profiles
  where lower(username) = lower(p_login)
     or phone = regexp_replace(p_login, '[\s()-]', '', 'g')
  limit 1
$$;
revoke execute on function find_login from public, anon, authenticated;

-- Usernames are unique regardless of case.
create unique index profiles_username_lower on profiles (lower(username));
