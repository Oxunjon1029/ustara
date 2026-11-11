import { useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatUzs } from '@ustara/shared';
import { Card, Placeholder, Screen } from '../../../src/components';
import { useAdminReport } from '../../../src/features/admin/api';
import { BarRow, Kpi, PeriodNav } from '../../../src/features/admin/components';
import { Segmented } from '../../../src/features/booking/components';
import { currentLocale } from '../../../src/i18n';
import { addDays, addMonths, dayMonth, monthStart, monthYear, rangeLabel, todayLocal, weekdayShort, weekStart } from '../../../src/lib/dates';
import { isDemo } from '../../../src/lib/supabase';
import { colors, fonts, type } from '../../../src/theme';

type Period = 'week' | 'month';

/** Shop report for a week or month: money, visit outcomes, per-barber and per-service results, daily trend. */
export default function Reports() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const today = todayLocal();
  const [period, setPeriod] = useState<Period>('month');
  const [anchor, setAnchor] = useState(today);
  const from = period === 'week' ? weekStart(anchor) : monthStart(anchor);
  const to = period === 'week' ? addDays(from, 6) : addDays(addMonths(from, 1), -1);
  const q = useAdminReport(from, to);
  if (isDemo) return <Placeholder title={t('tabs.reports')} />;

  const r = q.data;
  const x = r?.totals;
  const step = (dir: 1 | -1) => setAnchor((a) => (period === 'week' ? addDays(a, 7 * dir) : addMonths(a, dir)));
  const money = (v: number) => formatUzs(v, locale);
  const maxBarber = Math.max(1, ...(r?.barbers ?? []).map((b) => b.revenue));
  const maxService = Math.max(1, ...(r?.services ?? []).map((s) => s.completed));
  const maxDay = Math.max(1, ...(r?.days ?? []).map((d) => d.revenue));
  const activeDays = (r?.days ?? []).filter((d) => d.bookings > 0 || d.revenue > 0);

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
      >
        <Text style={type.h1}>{t('tabs.reports')}</Text>
        <Segmented
          options={[{ value: 'week', label: t('earnings.week') }, { value: 'month', label: t('earnings.month') }]}
          value={period}
          onChange={(p) => { setPeriod(p); setAnchor(today); }}
        />
        <PeriodNav
          label={period === 'week' ? rangeLabel(from, to, locale) : monthYear(from, locale)}
          onPrev={() => step(-1)}
          onNext={() => step(1)}
          canNext={to < today}
        />

        {!x ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              <Kpi tone="primary" label={t('earnings.gross')} value={formatUzs(x.revenue, locale, false)} />
              <Kpi label={t('admin.platformIncome')} value={formatUzs(x.fees, locale, false)} />
              <Kpi label={t('admin.barbersShare')} value={formatUzs(x.net, locale, false)} />
              <Kpi label={t('admin.expected')} value={formatUzs(x.expected, locale, false)} />
            </View>

            <Card style={{ gap: 10 }}>
              <Line label={t('barber.bookings')} value={String(x.bookings)} />
              <Line label={t('barber.completed')} value={String(x.completed)} />
              <Line label={t('barber.noShow')} value={String(x.no_show)} />
              <Line label={t('booking.status.cancelled')} value={String(x.cancelled)} />
              <Line label={t('admin.walkins')} value={String(x.walkins)} />
              <Line label={t('admin.newClients')} value={String(x.new_clients)} />
              <Line label={t('admin.rating')} value={x.rating ? `★ ${Number(x.rating).toFixed(1)} · ${t('barberProfile.reviews', { count: x.reviews })}` : '—'} />
            </Card>

            <Text style={type.h2}>{t('admin.byBarber')}</Text>
            <Card style={{ gap: 14 }}>
              {r!.barbers.map((b) => (
                <View key={b.barber_id} style={{ gap: 4 }}>
                  <BarRow label={b.name} value={money(b.revenue)} share={b.revenue / maxBarber} />
                  <Text style={type.small}>
                    {t('admin.barberLine', { completed: b.completed, noShow: b.no_show, fee: money(b.fees) })}
                  </Text>
                </View>
              ))}
            </Card>

            <Text style={type.h2}>{t('admin.byService')}</Text>
            <Card style={{ gap: 14 }}>
              {r!.services.map((sv) => (
                <BarRow
                  key={sv.service_id}
                  label={`${locale === 'ru' ? sv.name_ru : sv.name_uz} · ${sv.completed}`}
                  value={money(sv.revenue)}
                  share={sv.completed / maxService}
                />
              ))}
            </Card>

            <Text style={type.h2}>{t('earnings.byDay')}</Text>
            <Card style={{ gap: 12 }}>
              {activeDays.length === 0 && <Text style={type.small}>{t('earnings.none')}</Text>}
              {activeDays.map((d) => (
                <BarRow
                  key={d.date}
                  label={`${weekdayShort(d.date, locale)}, ${dayMonth(d.date, locale)} · ${d.bookings}`}
                  value={money(d.revenue)}
                  share={d.revenue / maxDay}
                />
              ))}
            </Card>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 14, color: colors.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{value}</Text>
    </View>
  );
}
