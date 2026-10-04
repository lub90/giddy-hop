import i18next from 'i18next';
import { LANGUAGES, type Language, type Localized } from '../game/courseFormat';
import de from './de.json';
import en from './en.json';

/**
 * Translations (i18next). All kid-facing texts live in de.json / en.json;
 * code calls t('section.key').
 */

export { LANGUAGES, type Language };
export const DEFAULT_LANGUAGE: Language = 'en';
/** localStorage key of the language chosen in the start screen. */
export const LANGUAGE_SETTING_KEY = 'giddyhop.language';
export const LANGUAGE_NAMES: Record<Language, string> = { de: 'Deutsch', en: 'English' };
export const RESOURCES = { de, en } as const;

/** Maps a language tag like "de-AT" or "en_US" to a supported language, or null. */
export function matchLanguage(tag: string | null | undefined): Language | null {
  if (!tag) return null;
  const base = tag.toLowerCase().split(/[-_]/)[0];
  return (LANGUAGES as readonly string[]).includes(base) ? (base as Language) : null;
}

export interface LanguageSources {
  /** ?lang=… in the URL – explicit override, e.g. for testing. */
  urlParam?: string | null;
  /** The choice remembered from the language dropdown. */
  saved?: string | null;
  /** navigator.languages – the browser's preferred languages in order. */
  browser?: readonly string[];
}

/** URL parameter, then remembered choice, then the first supported browser language, else English. */
export function detectLanguage(sources: LanguageSources): Language {
  const fromBrowser = (sources.browser ?? []).map(matchLanguage).find((l): l is Language => l !== null);
  return matchLanguage(sources.urlParam) ?? matchLanguage(sources.saved) ?? fromBrowser ?? DEFAULT_LANGUAGE;
}

void i18next.init({
  lng: DEFAULT_LANGUAGE,
  fallbackLng: DEFAULT_LANGUAGE,
  supportedLngs: [...LANGUAGES],
  resources: { de: { translation: de }, en: { translation: en } },
  // Texts are our own and may contain <b> tags; values are escaped where they are inserted.
  interpolation: { escapeValue: false },
  initAsync: false,
});

export function setLanguage(lang: Language): void {
  void i18next.changeLanguage(lang);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.title = `${t('title')} – ${t('subtitle')}`;
  }
}

export function currentLanguage(): Language {
  return matchLanguage(i18next.language) ?? DEFAULT_LANGUAGE;
}

export function t(key: string, options?: Record<string, unknown>): string {
  return i18next.t(key, options) as string;
}

/** Horse name for a player number (0..3) in the current language. */
export function horseName(playerNumber: number): string {
  const names = i18next.t('horses', { returnObjects: true }) as unknown as string[];
  return names[playerNumber] ?? `#${playerNumber + 1}`;
}

/** Horse names for all player numbers in the current language. */
export function horseNames(count: number): string[] {
  return Array.from({ length: count }, (_, n) => horseName(n));
}

/** Picks the current language from a text given per language (e.g. course names). */
export function localized(text: Localized): string {
  return text[currentLanguage()];
}
