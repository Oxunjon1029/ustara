import { Linking, Platform } from 'react-native';

/** The part of Telegram.WebApp (https://core.telegram.org/bots/webapps) the app uses. */
export interface TelegramWebApp {
  initData: string;
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  close(): void;
  openTelegramLink(url: string): void;
  openLink(url: string): void;
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  setBottomBarColor?(color: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  isVersionAtLeast?(v: string): boolean;
  isExpanded?: boolean;
  onEvent?(event: 'viewportChanged' | 'activated', cb: () => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback?: { selectionChanged(): void };
}

/** Telegram.WebApp when the app runs as a Telegram Mini App, otherwise null (native app, plain browser). */
export const telegram: TelegramWebApp | null = (() => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  const w = (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
  return w?.initData ? w : null;
})();

export const isTelegramMiniApp = !!telegram;

/** One-time Mini App setup: full height, app colours, no swipe-to-close while scrolling lists. */
export function initTelegram() {
  if (!telegram) return;
  document.documentElement.classList.add('tg');
  telegram.ready();
  telegram.expand();
  // Coming back from the bot chat: open full height again.
  const reExpand = () => { if (!telegram!.isExpanded) telegram!.expand(); };
  telegram.onEvent?.('activated', reExpand);
  const ok = (v: string) => telegram!.isVersionAtLeast?.(v) ?? false;
  if (ok('6.1')) {
    telegram.setHeaderColor?.('#F5F3EF');
    telegram.setBackgroundColor?.('#F5F3EF');
  }
  if (ok('7.10')) telegram.setBottomBarColor?.('#FFFFFF');
  if (ok('7.7')) telegram.disableVerticalSwipes?.();
}

/** Open a link: t.me links stay inside Telegram when running as a Mini App. */
export function openUrl(url: string) {
  if (telegram) {
    if (/^https:\/\/t\.me\//.test(url)) return telegram.openTelegramLink(url);
    if (/^https?:/.test(url)) return telegram.openLink(url);
  }
  return Linking.openURL(url).catch(() => {});
}
