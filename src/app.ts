import * as THREE from 'three';
import { Sounds } from './audio/sounds';
import { CONFIG } from './config';
import { loadSetting, saveSetting } from './core/persist';
import { currentLanguage, horseName, horseNames, LANGUAGE_SETTING_KEY, matchLanguage, setLanguage, t } from './i18n';
import { DebugPanel } from './debug/debugPanel';
import { applyCourseOptions, DEFAULT_COURSE_OPTIONS, type CourseInfo, type CourseOptions } from './game/courseFormat';
import { COURSES } from './game/courses';
import { GameFlow, type Phase } from './game/gameFlow';
import { Lobby } from './game/lobby';
import { Track } from './game/track';
import { KeyboardInput } from './input/keyboardInput';
import { mergeInputs, NEUTRAL_INPUT, type PlayerInput } from './input/playerInput';
import { startCamera } from './pose/camera';
import { PlayerTracker, type TrackerMode } from './pose/playerTracker';
import { PoseService } from './pose/poseService';
import { OverviewCamera } from './render/cameras';
import { splitLayout } from './render/layout';
import { buildStaticObstacles } from './render/obstacleViews';
import { RaceView } from './render/raceView';
import { SplitRenderer, type View } from './render/splitRenderer';
import { buildCourseScenery, disposeTree, setupEnvironment } from './render/world';
import { CameraView } from './ui/cameraView';
import { Hud, type HudState } from './ui/hud';
import { Screens } from './ui/screens';

export interface AppElements {
  canvas: HTMLCanvasElement;
  video: HTMLVideoElement;
  hud: HTMLElement;
  overlay: HTMLElement;
  debug: HTMLElement;
}

const now = () => performance.now() / 1000;

const COURSE_SETTING_KEY = 'giddyhop.course';

/** Voice pitch per player number, so every horse sounds a bit different. */
const HORSE_VOICES = [1, 0.85, 1.15, 0.95];

/** ?course=<id> in the URL, else the remembered course, else the first visible one. */
function initialCourse(): CourseInfo {
  if (COURSES.length === 0) throw new Error('No valid course found in courses/*.yaml');
  const fromUrl = new URLSearchParams(location.search).get('course');
  const saved = loadSetting(COURSE_SETTING_KEY);
  const visible = COURSES.filter((c) => !c.hidden);
  return (
    COURSES.find((c) => c.id === fromUrl) ??
    visible.find((c) => c.id === saved) ??
    visible[0] ??
    COURSES[0]
  );
}

/** Start-screen toggles (cones, carrots) and their localStorage keys. */
const OPTION_KEYS: Record<keyof CourseOptions, string> = {
  cones: 'giddyhop.cones',
  carrots: 'giddyhop.carrots',
};

function initialOptions(): CourseOptions {
  const read = (k: keyof CourseOptions) => loadSetting(OPTION_KEYS[k]) !== 'off' && DEFAULT_COURSE_OPTIONS[k];
  return { cones: read('cones'), carrots: read('carrots') };
}

const isOptionKey = (v: string | undefined): v is keyof CourseOptions => !!v && v in OPTION_KEYS;

const TRACKER_MODE: Record<Phase, TrackerMode> = {
  startup: 'register',
  register: 'register',
  loading: 'loading',
  countdown: 'race',
  race: 'race',
  results: 'race',
};

/**
 * Wires everything together and owns the main loop:
 * pose frames → tracker/gestures → lobby / inputs → game flow → rendering + UI.
 *
 * Race player index i corresponds to tracker.slots[i] (sorted by player number);
 * names, colors and keyboard bindings follow the player number.
 */
export class App {
  private course: CourseInfo = initialCourse();
  private options: CourseOptions = initialOptions();
  private readonly flow = new GameFlow(this.makeTrack(), CONFIG);
  private readonly tracker = new PlayerTracker();
  private readonly lobby = new Lobby(this.tracker);
  private readonly keyboard = new KeyboardInput();
  private readonly poses: PoseService;
  private readonly scene = new THREE.Scene();
  private readonly renderer: SplitRenderer;
  private readonly overview: OverviewCamera;
  private readonly cameraView: CameraView;
  private readonly hud: Hud;
  private readonly screens: Screens;
  private readonly debug: DebugPanel;
  private readonly sounds = new Sounds(() => CONFIG.audio.volume);

  private raceView: RaceView | null = null;
  private scenery: THREE.Group | null = null;
  private lastPoseId = 0;
  private lastTime = now();
  private lastPhase: Phase = 'startup';
  /** Why camera/detection failed (technical message), or null. */
  private cameraError: string | null = null;
  private fps = 60;
  private fullscreenChangedAt = Number.NEGATIVE_INFINITY;

  constructor(private readonly el: AppElements) {
    this.poses = new PoseService(el.video);
    this.renderer = new SplitRenderer(el.canvas, CONFIG.render);
    this.overview = new OverviewCamera(this.flow.currentTrack, CONFIG.render.viewDistance);
    this.cameraView = new CameraView(el.video);
    this.hud = new Hud(el.hud, CONFIG.hud.gaitThresholds);
    this.screens = new Screens(el.overlay);
    this.debug = new DebugPanel(el.debug, this.cameraView, () => this.renderer.setPixelRatio(CONFIG.render.pixelRatio));

    setupEnvironment(this.scene, CONFIG.render.viewDistance);
    this.buildScenery();
  }

  /** (Re)builds everything that depends on the course. */
  private buildScenery(): void {
    if (this.scenery) {
      this.scene.remove(this.scenery);
      disposeTree(this.scenery);
    }
    const track = this.flow.currentTrack;
    this.scenery = buildCourseScenery(track, CONFIG.render.treeCount);
    this.scenery.add(buildStaticObstacles(track));
    this.scene.add(this.scenery);
    this.overview.setTrack(track);
  }

  /** Course selection on the start screen. */
  private selectCourse(id: string): void {
    const course = COURSES.find((c) => c.id === id);
    if (!course || course.id === this.course.id) return;
    const previous = this.course;
    this.course = course;
    if (!this.flow.setTrack(this.makeTrack())) {
      this.course = previous;
      return;
    }
    saveSetting(COURSE_SETTING_KEY, course.id);
    this.buildScenery();
    this.screens.updateCourseInfo(course);
  }

  /** Language selection on the start screen: switch and redraw the screen. */
  private selectLanguage(value: string): void {
    const lang = matchLanguage(value);
    if (!lang || lang === currentLanguage()) return;
    setLanguage(lang);
    saveSetting(LANGUAGE_SETTING_KEY, lang);
    // Start/finish banners are part of the scenery.
    this.buildScenery();
    if (this.flow.phase === 'register') this.showRegistration();
  }

  /** Cone / carrot toggles on the start screen. */
  private setOption(key: keyof CourseOptions, on: boolean): void {
    if (this.options[key] === on) return;
    const previous = this.options;
    this.options = { ...this.options, [key]: on };
    if (!this.flow.setTrack(this.makeTrack())) {
      this.options = previous;
      return;
    }
    saveSetting(OPTION_KEYS[key], on ? 'on' : 'off');
    this.buildScenery();
  }

  /** Track for the selected course with the start-screen options applied. */
  private makeTrack(): Track {
    return new Track(applyCourseOptions(this.course.def, this.options));
  }

  private showRegistration(): void {
    const problem = this.cameraError ? t('startup.cameraProblem', { message: this.cameraError }) : null;
    this.screens.registration(problem, COURSES, this.course, this.options);
    this.mountCameraPreview();
  }

  async start(): Promise<void> {
    window.addEventListener('resize', () => this.renderer.resize());
    window.addEventListener('keydown', (e) => this.onKey(e));
    // Browsers allow audio only after a user interaction.
    for (const type of ['keydown', 'pointerdown'] as const) window.addEventListener(type, () => this.sounds.unlock());
    // Buttons inside the overlays (re-rendered often, so use event delegation).
    this.el.overlay.addEventListener('click', (e) => {
      const button = (e.target as HTMLElement).closest<HTMLElement>('[data-action="fullscreen"]');
      if (!button) return;
      // Drop focus so a later Space press (start) does not click the button again.
      button.blur();
      this.toggleFullscreen();
    });
    this.el.overlay.addEventListener('change', (e) => {
      const control = (e.target as HTMLElement).closest<HTMLInputElement | HTMLSelectElement>('[data-action]');
      if (!control) return;
      const action = control.dataset.action;
      if (action === 'course') this.selectCourse(control.value);
      else if (action === 'language') this.selectLanguage(control.value);
      else if (isOptionKey(action) && control instanceof HTMLInputElement) this.setOption(action, control.checked);
      // Arrow keys and Space are game keys – give the focus back to the page.
      control.blur();
    });
    document.addEventListener('fullscreenchange', () => {
      document.body.classList.toggle('is-fullscreen', !!document.fullscreenElement);
      this.fullscreenChangedAt = now();
    });
    this.keyboard.attach(window);
    requestAnimationFrame(() => this.frame());

    this.screens.startup(t('startup.camera'));
    try {
      await startCamera(this.el.video, CONFIG.camera.width, CONFIG.camera.height);
      this.screens.startup(t('startup.model'));
      await this.poses.init();
      this.poses.start();
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : String(err);
      this.cameraError = msg;
    }
    this.flow.ready();
  }

  private frame(): void {
    const t = now();
    const dt = Math.min(0.05, t - this.lastTime);
    this.lastTime = t;
    this.fps += (1 / Math.max(dt, 1e-3) - this.fps) * 0.05;

    this.processPoses();
    this.flow.update(dt, this.readInputs());
    if (this.flow.phase !== this.lastPhase) this.enterPhase(this.flow.phase, this.lastPhase);
    this.lastPhase = this.flow.phase;

    this.render(t);
    this.updateUi(t);
    requestAnimationFrame(() => this.frame());
  }

  /** New pose frame → tracker → lobby rules (registration and loading only). */
  private processPoses(): void {
    const frame = this.poses.latest;
    if (frame.id === this.lastPoseId) return;
    this.lastPoseId = frame.id;
    const phase = this.flow.phase;
    const events = this.tracker.update(frame, TRACKER_MODE[phase]);
    if (phase !== 'register' && phase !== 'loading') return;

    const command = this.lobby.handle(events, phase);
    if (command === 'startLoading') this.flow.startLoading(this.tracker.slots.length);
    else if (command === 'cancelLoading') this.flow.cancelLoading();
  }

  private readInputs(): PlayerInput[] {
    return this.tracker.slots.map((slot) =>
      mergeInputs(slot.kind === 'pose' ? slot.gestures.read() : NEUTRAL_INPUT, this.keyboard.read(slot.number)),
    );
  }

  /** Horse names / colors in race order (by player number). */
  private playerNames(): string[] {
    return this.tracker.slots.map((s) => horseName(s.number));
  }
  private playerColors(): string[] {
    return this.tracker.slots.map((s) => CONFIG.playerColors[s.number]);
  }

  private enterPhase(phase: Phase, previous: Phase): void {
    switch (phase) {
      case 'register':
        this.disposeRace();
        this.hud.clear();
        // After a race everyone confirms again; after a cancelled loading the others stay ready.
        if (previous !== 'loading') this.lobby.resetReady();
        this.showRegistration();
        break;
      case 'loading':
        this.screens.loading();
        break;
      case 'countdown': {
        this.disposeRace();
        for (const s of this.tracker.slots) s.gestures.reset();
        const race = this.flow.race!;
        this.raceView = new RaceView(
          this.scene,
          race,
          this.playerColors(),
          CONFIG.render.fov,
          CONFIG.render.viewDistance,
          { delay: CONFIG.race.celebrationDelaySeconds, cycle: CONFIG.race.celebrationCycleSeconds },
          (player) => this.sounds.whinny(HORSE_VOICES[this.tracker.slots[player]?.number ?? 0]),
        );
        this.hud.setup(this.playerNames(), this.playerColors());
        this.screens.countdown();
        break;
      }
      case 'race':
        this.screens.go();
        break;
      case 'results':
        // The award ceremony replaces the race HUD; the celebrating horses stay visible behind it.
        this.hud.clear();
        this.screens.results(this.flow.race!.results(), this.playerNames(), this.playerColors());
        break;
      case 'startup':
        break;
    }
    this.mountCameraPreview();
  }

  /** The single camera preview lives in the registration screen, otherwise in the debug panel. */
  private mountCameraPreview(): void {
    if (this.flow.phase === 'register' && !this.cameraError) this.screens.mountCamera(this.cameraView.canvas);
    else if (this.debug.visible) this.debug.mountCamera();
  }

  private render(t: number): void {
    const { width, height } = this.renderer;
    const views: View[] = [];
    const race = this.flow.race;
    if (this.raceView && race) {
      this.raceView.update(t);
      const layout = splitLayout(race.horses.length, width, height);
      layout.players.forEach((rect, i) => views.push({ camera: this.raceView!.cameras[i].camera, rect }));
      if (layout.spare) {
        this.overview.topDown();
        views.push({ camera: this.overview.camera, rect: layout.spare, noFog: true });
      }
      this.hud.layout(layout.players);
    } else {
      this.overview.orbit(t);
      views.push({ camera: this.overview.camera, rect: { x: 0, y: 0, w: width, h: height }, noFog: true });
    }
    this.renderer.render(this.scene, views);
  }

  private updateUi(t: number): void {
    const names = horseNames(CONFIG.maxPlayers);
    const colors = CONFIG.playerColors;
    const phase = this.flow.phase;
    const race = this.flow.race;

    if (phase === 'register' || phase === 'loading') {
      this.screens.updateSlots(this.tracker, CONFIG.maxPlayers, names, colors);
    }
    if (phase === 'loading') this.screens.updateLoading(this.flow.loadingProgress);
    if (phase === 'countdown') this.screens.updateCountdown(this.flow.countdownValue);
    if (phase === 'race' && !this.flow.showGo && this.screens.showing === 'go') this.screens.hide();
    if (phase === 'register' || this.debug.showsCamera) this.cameraView.draw(this.tracker, names, colors);

    if (race && (phase === 'countdown' || phase === 'race' || phase === 'results')) {
      for (const e of race.drainEvents()) this.hud.event(e, t);
      const positions = race.positions();
      this.hud.update(race.horses.map((_, i) => this.hudState(i, t, positions[i])), t);
    }

    this.debug.update(
      { renderFps: this.fps, poseFps: this.poses.fps, people: this.poses.latest.poses.length, slots: this.tracker.slots },
      t,
    );
  }

  private hudState(i: number, t: number, position: number): HudState {
    const race = this.flow.race!;
    const h = race.horses[i];
    const slot = this.tracker.slots[i];
    const edge = race.track.halfWidth * 0.75;
    return {
      position,
      riders: race.horses.length,
      carrots: h.carrots,
      faults: h.faults,
      time: h.finishTime ?? race.time,
      progress: Math.min(1, h.s / race.track.length),
      // "HOPP!" until the jump is triggered (then the horse takes off by itself).
      jumpZone: this.flow.phase === 'race' && race.inJumpZone(i) && !h.airborne && h.pendingJump === null,
      lostTracking: !!slot && slot.kind === 'pose' && t - slot.gestures.lastSeen > CONFIG.tracking.lostHintSeconds,
      steerHint: h.lateral > edge ? -1 : h.lateral < -edge ? 1 : 0,
      finished: h.finished,
      speed: h.speed / CONFIG.horse.maxSpeed,
      boosting: h.boost > 0,
      slowdown: race.slowdownReason(i),
    };
  }

  private onKey(e: KeyboardEvent): void {
    const dbg = CONFIG.keys.debugToggle;
    if (e.code === dbg.code && e.ctrlKey === dbg.ctrl && e.altKey === dbg.alt && e.shiftKey === dbg.shift) {
      e.preventDefault();
      this.debug.toggle();
      this.mountCameraPreview();
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey || e.repeat) return;
    const phase = this.flow.phase;
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (phase === 'register') {
          this.lobby.setAllReady();
          this.flow.startLoading(this.tracker.slots.length);
        } else if (phase === 'loading') {
          this.flow.skipLoading();
        } else if (phase === 'results') {
          this.flow.rematch();
        }
        break;
      case 'Escape':
        // Esc that leaves fullscreen must not also abort the game.
        if (document.fullscreenElement || now() - this.fullscreenChangedAt < 0.5) break;
        if (phase === 'loading') this.flow.cancelLoading();
        else this.flow.toRegistration();
        break;
      case 'Backspace':
        if (phase === 'register') this.tracker.clear();
        break;
      case 'KeyT':
        if (phase === 'register') this.tracker.addKeyboardPlayer();
        break;
      case 'KeyF':
        this.toggleFullscreen();
        break;
    }
  }

  /** Fullscreen for the whole page; leaving works with Esc (handled by the browser). */
  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen().catch((err) => console.warn('Fullscreen refused', err));
  }

  private disposeRace(): void {
    this.raceView?.dispose();
    this.raceView = null;
  }
}
