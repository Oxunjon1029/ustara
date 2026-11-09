import { RoleTabs } from '../../src/components/RoleTabs';

export default function BarberLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'today', label: 'tabs.today', icon: 'clock' },
        { name: 'calendar', label: 'tabs.calendar', icon: 'calendar' },
        { name: 'earnings', label: 'tabs.earnings', icon: 'wallet' },
        { name: 'profile', label: 'tabs.profile', icon: 'user' },
      ]}
    />
  );
}
