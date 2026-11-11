# Ustara

Barbershop booking app for Uzbekistan (uz/ru, UZS, Asia/Tashkent). Expo + Supabase + Telegram bot.

```text
apps/mobile/        Expo app (Expo Router): client, barber, admin tab stacks behind a role gate
packages/shared/    Fee calculation, slot generation, validation (shared by app and Edge Functions)
supabase/           SQL migrations (tables, constraints, RLS), seed data, Edge Functions (from Milestone 2)
```

## Run

```sh
npm install
npm test                 # shared fee/slot/validation tests
npm run mobile           # Expo dev server
```

**Demo mode:** without `EXPO_PUBLIC_SUPABASE_*` env vars the app uses sample data and shows
"Sign in as Client / Barber / Admin" buttons.

**With Supabase (local):** requires Docker.

```sh
npx supabase init         # once: creates supabase/config.toml (keep existing migrations)
npx supabase start        # applies migrations + seed.sql
cp apps/mobile/.env.example apps/mobile/.env   # fill in the anon key printed by `supabase start`
```

Seeded accounts (password `password12`): `admin`, `jasur`, `bekzod`, `sardor` (barbers), `aziz` (client).
Sign in with the username or the phone number.

## Authentication (Milestone 2)

Sign-in is password (phone or username) or Telegram; recovery is via the Telegram bot. No SMS or email.

| Edge Function | Purpose |
| --- | --- |
| `auth-password` | Sign-up and login. 5 failures per 15 min per account or IP → 15-min lock, Telegram alert |
| `telegram-token` | One-time deep links (`login`, `link`, `reset`), polling, and setting the new password |
| `telegram-webhook` | The bot: `/start <token>`, share-contact phone check, Confirm/Cancel buttons |

One-time setup on the linked project:

```sh
npx supabase db push --remote          # new migrations
npx supabase functions deploy          # all three functions
node scripts/setup-telegram.mjs        # asks for the BotFather token; sets secrets + webhook
```

Then in the Supabase dashboard turn off **Authentication → Sign In / Providers → Allow new users to sign up**:
accounts are created only by the functions above.

## Booking (Milestone 3)

All booking writes go through Postgres functions (`create_booking`, `reschedule_booking`, `cancel_booking`,
`set_booking_outcome`, `add_walkin`); direct inserts/updates are closed by RLS. `check_slot` enforces working hours,
time off, the 14-day horizon and verified phones; the `bookings_no_overlap` exclusion constraint guarantees no
double-booking under concurrency. Pilot mode (`payment_mode = in_shop`) confirms bookings immediately.

```sh
node scripts/test-double-booking.mjs   # two sessions book the same slot at once → expect exactly one
```

## Notifications (Milestone 4)

Booking events (confirmed, new booking, cancelled, rescheduled, no-show) and reminders (24 h and 2 h before) create rows in
`notifications`, written in the recipient's language (`profiles.locale`, synced from the app). The `notify-dispatch`
Edge Function sends them through the **Telegram bot**. It is woken by `pg_net` after each insert and by a `pg_cron` job
every minute (reminders and retries). The app lists them under the bell, with an unread badge.

Every client who can book has linked Telegram (phone verification goes through the bot); barbers see a
"connect Telegram" card on Today until they link.

```sh
npx supabase db push --remote                              # notifications tables, triggers, cron job
npx supabase functions deploy notify-dispatch --remote=<ref>
```

**Phone push (off for the pilot).** The server already sends Expo push to any registered device. To turn it on: set
`PUSH_ENABLED = true` in `apps/mobile/src/features/notifications/push.ts`, add `google-services.json` and
`android.googleServicesFile` to `app.json`, upload the FCM V1 key and the iOS APNs key with `eas credentials`
(project already created with `eas init`), and ship a new build: Expo Go can't receive push on Android.

## Milestones

1. **Foundations** ✅ monorepo, i18n, theme, Sentry, schema + RLS + seed, shared logic with tests, role gate
2. **Authentication** ✅ password + Telegram bot sign-in, linking, phone verification, reset via bot
3. **Booking and scheduling** ✅ client booking flow, barber profiles, reschedule/cancel, barber Today/Calendar, walk-ins, time off, hours, no-show limit
4. **Notifications** ✅ Telegram bot messages for booking events and reminders; in-app bell list (phone push ready, off)
5. **Earnings, admin, pilot release** — done: barber earnings, visit ratings, admin dashboard/schedule/reports, admin-created barber logins, barbers/services/fee tiers/users/settings, profile photos. Left: account deletion, privacy/terms, production server, store builds
6. Payme and payouts (Phase 2)
7. Click and automation
