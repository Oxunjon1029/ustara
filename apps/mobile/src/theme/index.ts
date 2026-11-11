// Tokens taken from the Ustara UI canvas.
export const colors = {
  ground: '#F5F3EF',
  surface: '#FFFFFF',
  ink: '#15171A',
  inkMuted: '#4A4E55',
  inkOnDark: '#F5F3EF',
  inkOnDarkMuted: '#C9C5BC',
  border: '#D6D1C7',
  divider: '#EEEAE3',
  chrome: '#E4E0D8',
  segment: '#E9E5DD',
  disabled: '#ECE8E1',
  disabledInk: '#6B6F76',
  primary: '#1F5F4A',
  primaryDark: '#15453A',
  primarySoft: '#E3EFEA',
  confirmed: '#2E6B57',
  telegram: '#176FA8',
  telegramSoft: '#DCEBF5',
  warnSoft: '#FDF1E3',
  warnInk: '#6B3A0C',
  danger: '#A12C1E',
  dangerBorder: '#E7C2BC',
  star: '#C98A12',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;
export const radius = { sm: 10, md: 12, lg: 14, xl: 16, card: 18, pill: 999 } as const;

export const fonts = {
  body: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  display: 'SpaceGrotesk_700Bold',
  displaySemibold: 'SpaceGrotesk_600SemiBold',
} as const;

export const type = {
  h1: { fontFamily: fonts.display, fontSize: 26, color: colors.ink },
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 37, letterSpacing: -0.5, color: colors.ink },
  h2: { fontFamily: fonts.displaySemibold, fontSize: 18, color: colors.ink },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.ink },
  label: { fontFamily: fonts.medium, fontSize: 13, color: colors.ink },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.inkMuted },
} as const;
