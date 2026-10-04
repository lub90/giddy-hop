import { describe, expect, it } from 'vitest';
import { COURSES } from '../src/game/courses';
import { currentLanguage, detectLanguage, LANGUAGES, localized, matchLanguage, RESOURCES, setLanguage, t } from '../src/i18n';
import { courseInfoText, slotStatus } from '../src/ui/screens';
import { hintFor, toastFor } from '../src/ui/hud';

/** All leaf keys of a nested translation object, e.g. "hud.finish". */
function keys(obj: object, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

describe('Language detection', () => {
  it('uses the browser language when it is supported', () => {
    expect(detectLanguage({ browser: ['de-DE', 'en'] })).toBe('de');
    expect(detectLanguage({ browser: ['en-GB'] })).toBe('en');
    expect(detectLanguage({ browser: ['de-AT'] })).toBe('de');
  });

  it('takes the first supported language from the browser list', () => {
    expect(detectLanguage({ browser: ['fr-FR', 'de-CH', 'en'] })).toBe('de');
  });

  it('falls back to English for unsupported or missing browser languages', () => {
    expect(detectLanguage({ browser: ['fr-FR', 'it'] })).toBe('en');
    expect(detectLanguage({ browser: [] })).toBe('en');
    expect(detectLanguage({})).toBe('en');
  });

  it('a remembered choice beats the browser, the URL parameter beats both', () => {
    expect(detectLanguage({ saved: 'en', browser: ['de-DE'] })).toBe('en');
    expect(detectLanguage({ urlParam: 'de', saved: 'en', browser: ['en'] })).toBe('de');
    expect(detectLanguage({ urlParam: 'xx', saved: 'de', browser: ['en'] })).toBe('de');
  });

  it('normalizes language tags', () => {
    expect(matchLanguage('DE_de')).toBe('de');
    expect(matchLanguage('en-US')).toBe('en');
    expect(matchLanguage('fr')).toBeNull();
    expect(matchLanguage(null)).toBeNull();
  });
});

describe('Translations', () => {
  it('German and English contain exactly the same texts (no key missing in either)', () => {
    const de = keys(RESOURCES.de).sort();
    const en = keys(RESOURCES.en).sort();
    expect(en).toEqual(de);
  });

  it('no translation is empty', () => {
    for (const lang of LANGUAGES) {
      for (const key of keys(RESOURCES[lang])) expect(t(key, { lng: lang, count: 2, message: 'x' }), `${lang}:${key}`).not.toBe('');
    }
  });

  it('switches the whole UI between German and English', () => {
    setLanguage('en');
    expect(currentLanguage()).toBe('en');
    expect(t('hud.finish')).toContain('FINISH');
    expect(toastFor({ type: 'jump-fault', obstacle: 'water' })).toContain('Splash');
    expect(hintFor({ position: 1, riders: 1, carrots: 0, faults: 0, time: 0, progress: 0, speed: 0, slowdown: 'grass', jumpZone: false, lostTracking: false, steerHint: -1, finished: false }).text).toBe('🌱 Grass! ⬅️ lean left');
    expect(slotStatus(undefined).text).toBe('free');
    setLanguage('de');
    expect(t('hud.finish')).toContain('ZIEL');
    expect(slotStatus(undefined).text).toBe('frei');
  });

  it('uses singular and plural forms in the course facts', () => {
    setLanguage('en');
    expect(t('course.jumps', { count: 1 })).toBe('1 jump');
    expect(t('course.jumps', { count: 6 })).toBe('6 jumps');
    setLanguage('de');
    expect(t('course.jumps', { count: 1 })).toBe('1 Sprung');
    expect(t('course.curves', { count: 3 })).toBe('3 Kurven');
  });

  it('shows course names and descriptions in the current language', () => {
    const grand = COURSES.find((c) => c.id === 'grand-parcours')!;
    setLanguage('en');
    expect(localized(grand.name)).toBe('Grand Parcours');
    expect(courseInfoText(grand)).toMatch(/jumps/);
    setLanguage('de');
    expect(localized(grand.name)).toBe('Großer Parcours');
    expect(courseInfoText(grand)).toMatch(/Sprünge/);
  });
});
