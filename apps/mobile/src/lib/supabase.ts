import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

/** Without env vars the app runs in demo mode with local sample data. */
export const isDemo = !url || !anonKey;

export const supabase = createClient(url ?? 'http://localhost', anonKey ?? 'demo', {
  auth: { storage: AsyncStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});

/** Public URL of a photo in the avatars bucket (null when there is none). */
export const photoUrl = (path: string | null | undefined) =>
  path && !isDemo ? supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl : null;

/** Seeded accounts use a synthetic email per username; Milestone 2 replaces this with the auth-password function. */
export const usernameToEmail = (username: string) => `${username.trim().toLowerCase()}@users.ustara.local`;
