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
Milestone 1 signs in by username only; phone login, rate limiting and lockout come with the
`auth-password` function in Milestone 2.

## Milestones

1. **Foundations** ✅ monorepo, i18n, theme, Sentry, schema + RLS + seed, shared logic with tests, role gate
2. Authentication: password + Telegram bot sign-in, reset via bot
3. Booking and scheduling
4. Notifications
5. Earnings, admin, pilot release
6. Payme and payouts (Phase 2)
7. Click and automation
