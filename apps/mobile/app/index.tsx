import { Redirect } from 'expo-router';
import { useAuth } from '../src/features/auth/AuthProvider';

const HOME = { client: '/client/home', barber: '/barber/today', admin: '/admin/dashboard' } as const;

export default function Index() {
  const { state } = useAuth();
  if (state.status !== 'signedIn') return <Redirect href="/welcome" />;
  return <Redirect href={HOME[state.profile.role]} />;
}
