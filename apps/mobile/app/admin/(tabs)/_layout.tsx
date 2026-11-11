import { RoleTabs } from '../../../src/components/RoleTabs';

export default function AdminLayout() {
  return (
    <RoleTabs
      tabs={[
        { name: 'dashboard', label: 'tabs.dashboard', icon: 'grid' },
        { name: 'schedule', label: 'tabs.schedule', icon: 'calendar' },
        { name: 'manage', label: 'tabs.manage', icon: 'settings' },
        { name: 'reports', label: 'tabs.reports', icon: 'chart' },
      ]}
    />
  );
}
