import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { supabase } from './supabase';

/**
 * Let the user pick a photo, crop it square, resize to 512px and upload it under `<userId>/` in the avatars bucket.
 * Returns the storage path, or null if the user cancelled.
 */
export async function pickAndUploadPhoto(userId: string): Promise<string | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const ctx = ImageManipulator.manipulate(res.assets[0].uri);
  ctx.resize({ width: 512 });
  const img = await (await ctx.renderAsync()).saveAsync({ compress: 0.8, format: SaveFormat.JPEG, base64: true });
  // fetch(file://).arrayBuffer() is unreliable on React Native, so decode the base64 the manipulator returns.
  if (!img.base64) throw new Error('no image data');
  const body = Uint8Array.from(atob(img.base64), (c) => c.charCodeAt(0));
  if (body.length < 1000) throw new Error('image too small');
  const path = `${userId}/${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg' });
  if (error) throw error;
  return path;
}

/**
 * Upload a new photo and store it on the account: barbers keep theirs on `barbers` (shown to clients),
 * everyone else on `profiles`. The previous file is deleted. Returns false if cancelled.
 */
export async function changePhoto(userId: string, isBarber: boolean, oldPath: string | null): Promise<boolean> {
  const path = await pickAndUploadPhoto(userId);
  if (!path) return false;
  const { error } = isBarber
    ? await supabase.from('barbers').update({ photo_path: path }).eq('user_id', userId)
    : await supabase.from('profiles').update({ photo_path: path }).eq('user_id', userId);
  if (error) {
    await supabase.storage.from('avatars').remove([path]);
    throw error;
  }
  if (oldPath) await supabase.storage.from('avatars').remove([oldPath]);
  return true;
}
