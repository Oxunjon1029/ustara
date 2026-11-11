import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '../../components';
import { BottomSheet } from '../../components/BottomSheet';
import { FormError } from '../../components/fields';
import { showDialog } from '../../components/Dialog';
import { isDemo, supabase } from '../../lib/supabase';
import { rpc } from '../booking/api';
import { bookingErrorText } from '../booking/components';
import { colors, fonts, radius, type } from '../../theme';

export interface MyReview { booking_id: string; rating: number; comment: string | null }
export interface BarberReview { rating: number; comment: string | null; created_at: string; client_name: string }

/** The signed-in client's reviews, by booking id. */
export const useMyReviews = (bookingIds: string[]) =>
  useQuery({
    queryKey: ['myReviews', bookingIds],
    enabled: bookingIds.length > 0 && !isDemo,
    queryFn: async () => {
      const { data, error } = await supabase.from('reviews').select('booking_id, rating, comment').in('booking_id', bookingIds);
      if (error) throw error;
      return new Map((data as MyReview[]).map((r) => [r.booking_id, r]));
    },
  });

export const useBarberReviews = (barberId: string) =>
  useQuery({
    queryKey: ['barberReviews', barberId],
    enabled: !!barberId && !isDemo,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('barber_reviews', { p_barber: barberId, p_limit: 20 });
      if (error) throw error;
      return data as BarberReview[];
    },
  });

/** Row of stars; interactive when `onChange` is given. */
export function Stars({ value, onChange, size = 18 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  const { t } = useTranslation();
  return (
    <View style={{ flexDirection: 'row', gap: onChange ? 6 : 1 }} accessibilityRole={onChange ? 'adjustable' : 'text'} accessibilityLabel={t('reviews.stars', { count: value })}>
      {[1, 2, 3, 4, 5].map((n) => {
        const star = <Text style={{ fontSize: size, lineHeight: size * 1.2, color: n <= value ? colors.star : colors.chrome }}>★</Text>;
        return onChange ? (
          <Pressable key={n} accessibilityRole="button" accessibilityLabel={t('reviews.stars', { count: n })} onPress={() => onChange(n)} hitSlop={4} style={s.starBtn}>
            {star}
          </Pressable>
        ) : (
          <View key={n}>{star}</View>
        );
      })}
    </View>
  );
}

/** Bottom sheet where a client rates a completed visit. */
export function RateSheet({ bookingId, title, initial, onDismiss }: {
  bookingId: string;
  title: string;
  initial?: MyReview;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [rating, setRating] = useState(initial?.rating ?? 0);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <BottomSheet onDismiss={onDismiss}>
      {(close) => {
        const submit = async () => {
          if (!rating) return setError(t('reviews.pickStars'));
          setBusy(true);
          const err = await rpc('rate_booking', { p_booking: bookingId, p_rating: rating, p_comment: comment });
          setBusy(false);
          if (err) return setError(bookingErrorText(t, err));
          for (const key of ['myReviews', 'barbers', 'barberProfile', 'barberReviews']) queryClient.invalidateQueries({ queryKey: [key] });
          close(() => { onDismiss(); showDialog(t('reviews.thanks')); });
        };
        return (
          <View style={{ gap: 16 }}>
            <View style={{ gap: 4 }}>
              <Text style={type.h2}>{t('reviews.title')}</Text>
              <Text style={type.small}>{title}</Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Stars value={rating} onChange={(v) => { setRating(v); setError(null); }} size={36} />
            </View>
            <TextInput
              accessibilityLabel={t('reviews.comment')}
              placeholder={t('reviews.comment')}
              placeholderTextColor={colors.disabledInk}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={500}
              style={s.input}
            />
            <FormError message={error} />
            <Button label={t('reviews.send')} onPress={submit} loading={busy} />
          </View>
        );
      }}
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  starBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  input: {
    minHeight: 88, maxHeight: 160, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface,
    paddingHorizontal: 14, paddingVertical: 12, fontFamily: fonts.body, fontSize: 15, color: colors.ink, textAlignVertical: 'top',
  },
});
