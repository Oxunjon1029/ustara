import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { formatUzs } from '@ustara/shared';
import { Card, Icon, Placeholder, Screen } from '../../../src/components';
import { useAuth } from '../../../src/features/auth/AuthProvider';
import { dayBounds, useMyBarberId } from '../../../src/features/booking/api';
import { Segmented } from '../../../src/features/booking/components';
import { currentLocale } from '../../../src/i18n';
import {
  addDays, addMonths, dayMonth, localDate, localTime, longDate, monthStart, monthYear, rangeLabel, todayLocal, weekdayShort, weekStart,
} from '../../../src/lib/dates';
import { isDemo, supabase } from '../../../src/lib/supabase';
import { colors, fonts, radius, type } from '../../../src/theme';

type Period = 'day' | 'week' | 'month';

interface Row {
  id: string; starts_at: string; status: string; source: 'app' | 'walkin';
  price_uzs: number; fee_uzs: number; barber_net_uzs: number;
  service: { name_uz: string; name_ru: string } | null;
}

/** First and last local date of the period containing `anchor`. */
function bounds(period: Period, anchor: string) {
  if (period === 'day') return { from: anchor, to: anchor };
  if (period === 'week') { const from = weekStart(anchor); return { from, to: addDays(from, 6) }; }
  const from = monthStart(anchor);
  return { from, to: addDays(addMonths(from, 1), -1) };
}

const useEarnings = (barberId: string | null, from: string, to: string) =>
  useQuery({
    queryKey: ['earnings', barberId, from, to],
    enabled: !!barberId,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, starts_at, status, source, price_uzs, fee_uzs, barber_net_uzs, service:services(name_uz, name_ru)')
        .eq('barber_id', barberId!)
        .gte('starts_at', dayBounds(from).from.toISOString())
        .lt('starts_at', dayBounds(to).to.toISOString())
        .in('status', ['confirmed', 'completed'])
        .order('starts_at')
        .limit(1000);
      if (error) throw error;
      return data as unknown as Row[];
    },
  });

const sum = (rows: Row[], k: 'price_uzs' | 'fee_uzs' | 'barber_net_uzs') => rows.reduce((a, r) => a + r[k], 0);

/** Barber's income: what clients paid, the platform's fee per visit, and what the barber keeps. */
export default function Earnings() {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { state } = useAuth();
  const barberId = useMyBarberId(state.status === 'signedIn' && !isDemo ? state.profile.user_id : '');
  const today = todayLocal();
  const [period, setPeriod] = useState<Period>('week');
  const [anchor, setAnchor] = useState(today);
  const { from, to } = bounds(period, anchor);
  const q = useEarnings(barberId.data ?? null, from, to);
  if (isDemo) return <Placeholder title={t('tabs.earnings')} />;

  const rows = q.data ?? [];
  const now = Date.now();
  const done = rows.filter((r) => r.status === 'completed');
  const unmarked = rows.filter((r) => r.status === 'confirmed' && Date.parse(r.starts_at) <= now);
  const expected = rows.filter((r) => r.status === 'confirmed' && Date.parse(r.starts_at) > now);
  const net = sum(done, 'barber_net_uzs');

  const step = (dir: 1 | -1) =>
    setAnchor((a) => (period === 'day' ? addDays(a, dir) : period === 'week' ? addDays(a, 7 * dir) : addMonths(a, dir)));
  const canNext = to < today;
  const label =
    period === 'day' ? (anchor === today ? t('tabs.today') : longDate(anchor, locale))
    : period === 'week' ? rangeLabel(from, to, locale)
    : monthYear(from, locale);

  // Per-day totals for week/month views (only days with visits).
  const byDay = new Map<string, { count: number; net: number }>();
  for (const r of done) {
    const d = localDate(r.starts_at);
    const x = byDay.get(d) ?? { count: 0, net: 0 };
    byDay.set(d, { count: x.count + 1, net: x.net + r.barber_net_uzs });
  }
  const maxDay = Math.max(1, ...[...byDay.values()].map((x) => x.net));

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingTop: 8, gap: 16 }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} />}
      >
        <Text style={type.h1}>{t('tabs.earnings')}</Text>
        <Segmented
          options={[
            { value: 'day', label: t('earnings.day') },
            { value: 'week', label: t('earnings.week') },
            { value: 'month', label: t('earnings.month') },
          ]}
          value={period}
          onChange={(p) => { setPeriod(p); setAnchor(today); }}
        />

        <View style={s.nav}>
          <Pressable accessibilityRole="button" accessibilityLabel={t('earnings.prev')} onPress={() => step(-1)} style={s.navBtn}>
            <Icon name="back" size={18} />
          </Pressable>
          <Text style={[type.h2, { flex: 1, textAlign: 'center' }]} numberOfLines={1}>{label}</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('earnings.next')}
            accessibilityState={{ disabled: !canNext }}
            disabled={!canNext}
            onPress={() => step(1)}
            style={[s.navBtn, !canNext && { opacity: 0.35 }]}
          >
            <View style={{ transform: [{ rotate: '180deg' }] }}><Icon name="back" size={18} /></View>
          </Pressable>
        </View>

        <View style={s.hero}>
          <Text style={{ fontFamily: fonts.medium, fontSize: 13, color: colors.inkOnDarkMuted }}>{t('earnings.net')}</Text>
          {q.isLoading || barberId.isLoading ? (
            <ActivityIndicator color="#fff" style={{ alignSelf: 'flex-start', marginVertical: 10 }} />
          ) : (
            <Text style={s.heroValue} numberOfLines={1} adjustsFontSizeToFit>{formatUzs(net, locale)}</Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <HeroStat label={t('earnings.gross')} value={formatUzs(sum(done, 'price_uzs'), locale, false)} />
            <HeroStat label={t('earnings.fee')} value={`−${formatUzs(sum(done, 'fee_uzs'), locale, false)}`} />
            <HeroStat label={t('earnings.visits')} value={String(done.length)} />
          </View>
        </View>

        {unmarked.length > 0 && (
          <View style={s.warn}>
            <Text style={{ fontFamily: fonts.medium, fontSize: 14, lineHeight: 20, color: colors.warnInk }}>
              {t('earnings.unmarked', { count: unmarked.length })}
            </Text>
          </View>
        )}
        {expected.length > 0 && (
          <Card style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
            <Text style={[type.small, { fontSize: 14, flex: 1 }]}>{t('earnings.expected', { count: expected.length })}</Text>
            <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{formatUzs(sum(expected, 'barber_net_uzs'), locale)}</Text>
          </Card>
        )}

        {period === 'day' ? (
          <View style={{ gap: 10 }}>
            <Text style={type.h2}>{t('earnings.visitsTitle')}</Text>
            {done.length === 0 && !q.isLoading && <Text style={type.small}>{t('earnings.none')}</Text>}
            {done.map((r) => (
              <Card key={r.id} style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.ink, flex: 1 }} numberOfLines={1}>
                    {localTime(r.starts_at)} · {r.service ? (locale === 'ru' ? r.service.name_ru : r.service.name_uz) : ''}
                    {r.source === 'walkin' ? ` · ${t('barber.walkinShort')}` : ''}
                  </Text>
                  <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.primary }}>{formatUzs(r.barber_net_uzs, locale)}</Text>
                </View>
                <Text style={type.small}>
                  {t('earnings.breakdown', { price: formatUzs(r.price_uzs, locale), fee: formatUzs(r.fee_uzs, locale) })}
                </Text>
              </Card>
            ))}
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            <Text style={type.h2}>{t('earnings.byDay')}</Text>
            {byDay.size === 0 && !q.isLoading && <Text style={type.small}>{t('earnings.none')}</Text>}
            {byDay.size > 0 && (
              <Card style={{ gap: 12 }}>
                {[...byDay.entries()].map(([d, x]) => (
                  <View key={d} style={{ gap: 6 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 8 }}>
                      <Text style={{ fontFamily: fonts.medium, fontSize: 14, color: colors.ink }}>
                        {weekdayShort(d, locale)}, {dayMonth(d, locale)} · <Text style={type.small}>{t('earnings.visitsCount', { count: x.count })}</Text>
                      </Text>
                      <Text style={{ fontFamily: fonts.semibold, fontSize: 14, color: colors.ink }}>{formatUzs(x.net, locale)}</Text>
                    </View>
                    <View style={s.track}>
                      <View style={[s.bar, { width: `${Math.max(4, (x.net / maxDay) * 100)}%` }]} />
                    </View>
                  </View>
                ))}
              </Card>
            )}
          </View>
        )}
        <Text style={[type.small, { fontSize: 12 }]}>{t('earnings.note')}</Text>
      </ScrollView>
    </Screen>
  );
}

function HeroStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={{ fontFamily: fonts.body, fontSize: 12, color: colors.inkOnDarkMuted }} numberOfLines={1}>{label}</Text>
      <Text style={{ fontFamily: fonts.semibold, fontSize: 15, color: colors.inkOnDark }} numberOfLines={1} adjustsFontSizeToFit>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  navBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  hero: { backgroundColor: colors.primary, borderRadius: radius.card, padding: 18, gap: 4 },
  heroValue: { fontFamily: fonts.display, fontSize: 34, color: '#fff', letterSpacing: -0.5 },
  warn: { backgroundColor: colors.warnSoft, borderRadius: radius.lg, padding: 14 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.divider, overflow: 'hidden' },
  bar: { height: 6, borderRadius: 3, backgroundColor: colors.primary },
});
