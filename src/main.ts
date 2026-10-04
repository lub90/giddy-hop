import './styles.css';
import { App } from './app';
import { CONFIG } from './config';
import { loadOverrides, loadSetting } from './core/persist';
import { detectLanguage, LANGUAGE_SETTING_KEY, setLanguage } from './i18n';
import { CONFIG_STORAGE_KEY, LEGACY_CONFIG_STORAGE_KEY } from './debug/debugPanel';

// UI language: ?lang=… in the URL, else the remembered choice, else the browser language, else English.
setLanguage(
  detectLanguage({
    urlParam: new URLSearchParams(location.search).get('lang'),
    saved: loadSetting(LANGUAGE_SETTING_KEY),
    browser: navigator.languages,
  }),
);

// Apply values tuned in the debug panel before anything reads the config
// (legacy key first, so newer values win).
loadOverrides(LEGACY_CONFIG_STORAGE_KEY, CONFIG as unknown as Record<string, unknown>);
loadOverrides(CONFIG_STORAGE_KEY, CONFIG as unknown as Record<string, unknown>);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

void new App({
  canvas: $<HTMLCanvasElement>('scene'),
  video: $<HTMLVideoElement>('webcam'),
  hud: $('hud'),
  overlay: $('overlay'),
  debug: $('debug-host'),
}).start();
