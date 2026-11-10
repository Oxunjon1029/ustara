import { RoleTabs } from '../../../src/components/RoleTabs';

export default function ClientLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'home', label: 'tabs.home', icon: 'home' },
        { name: 'bookings', label: 'tabs.bookings', icon: 'calendar' },
        { name: 'profile', label: 'tabs.profile', icon: 'user' },
      ]}
    />
  );
}
