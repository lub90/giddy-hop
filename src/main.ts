import './styles.css';
import { App } from './app';
import { CONFIG } from './config';
import { loadOverrides } from './core/persist';
import { CONFIG_STORAGE_KEY } from './debug/debugPanel';

// Apply values tuned in the debug panel before anything reads the config.
loadOverrides(CONFIG_STORAGE_KEY, CONFIG as unknown as Record<string, unknown>);

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

void new App({
  canvas: $<HTMLCanvasElement>('scene'),
  video: $<HTMLVideoElement>('webcam'),
  hud: $('hud'),
  overlay: $('overlay'),
  debug: $('debug-host'),
}).start();
