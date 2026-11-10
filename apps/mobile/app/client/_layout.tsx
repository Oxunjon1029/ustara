import { Stack } from 'expo-router';

/** Tabs at the bottom of the stack; full-screen flows (booking, walk-in, …) are pushed on top. */
export default function Layout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
