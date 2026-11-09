import { useTranslation } from 'react-i18next';
import { Placeholder } from '../../src/components';

export default function Screen() {
  const { t } = useTranslation();
  return <Placeholder title={t('tabs.today')} />;
}
