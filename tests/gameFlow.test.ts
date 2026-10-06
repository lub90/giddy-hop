import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GameFlow } from '../src/game/gameFlow';
import { Track } from '../src/game/track';
import { splitLayout } from '../src/render/layout';

const shortTrack = new Track({ halfWidth: 3.5, shoulder: 1.5, segments: [{ kind: 'straight', length: 20 }] });
const full = [{ drive: 1, steer: 0, jump: false }];
const R = CONFIG.race;

function advance(flow: GameFlow, seconds: number, inputs = full) {
  for (let i = 0; i < Math.round(seconds * 60); i++) flow.update(1 / 60, inputs);
}

/** Registration done, loading started. */
function loading(players = 1) {
  const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
  flow.ready();
  flow.startLoading(players);
  return flow;
}

describe('GameFlow – phases', () => {
  it('startup → registration → loading (10 s) → countdown 3-2-1 → race with "Los!" → results', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    expect(flow.phase).toBe('startup');
    flow.ready();
    expect(flow.phase).toBe('register');
    expect(flow.startLoading(1)).toBe(true);
    expect(flow.phase).toBe('loading');
    advance(flow, R.loadingSeconds - 0.5);
    expect(flow.phase).toBe('loading');
    expect(flow.loadingProgress).toBeGreaterThan(0.9);
    advance(flow, 0.6);
    expect(flow.phase).toBe('countdown');
    const shown = new Set<number>();
    while (flow.phase === 'countdown') {
      shown.add(flow.countdownValue);
      advance(flow, 1 / 60);
    }
    expect([...shown]).toEqual([3, 2, 1]);
    expect(flow.phase).toBe('race');
    expect(flow.showGo).toBe(true);
    advance(flow, R.goSeconds + 0.1);
    expect(flow.showGo).toBe(false);
    advance(flow, 10 + R.resultsDelaySeconds);
    expect(flow.phase).toBe('results');
  });

  it('horses cannot move before "Los!" (loading and countdown)', () => {
    const flow = loading();
    advance(flow, R.loadingSeconds + R.countdownSeconds - 0.1);
    expect(flow.phase).toBe('countdown');
    expect(flow.race!.horses[0].s).toBe(0);
    advance(flow, 0.5);
    expect(flow.race!.horses[0].s).toBeGreaterThan(0);
  });

  it('loading can be cancelled back to the registration', () => {
    const flow = loading();
    advance(flow, 5);
    flow.cancelLoading();
    expect(flow.phase).toBe('register');
    expect(flow.race).toBeNull();
  });

  it('loading can be skipped (keyboard shortcut)', () => {
    const flow = loading();
    flow.skipLoading();
    expect(flow.phase).toBe('countdown');
  });

  it('cannot start without players', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    flow.ready();
    expect(flow.startLoading(0)).toBe(false);
    expect(flow.phase).toBe('register');
  });

  it('the award ceremony ends by itself and goes back to registration', () => {
    const flow = loading(2);
    for (let i = 0; i < 60 * 60 && flow.phase !== 'results'; i++) flow.update(1 / 60, [full[0], full[0]]);
    expect(flow.phase).toBe('results');
    advance(flow, R.resultsSeconds * 0.5, [full[0], full[0]]);
    expect(flow.phase).toBe('results');
    expect(flow.resultsProgress).toBeCloseTo(0.5, 1);
    advance(flow, R.resultsSeconds * 0.5 + 0.1, [full[0], full[0]]);
    expect(flow.phase).toBe('register');
    expect(flow.race).toBeNull();
  });

  it('can go back to registration at any time', () => {
    const flow = loading(2);
    advance(flow, R.loadingSeconds + 5, [full[0], full[0]]);
    flow.toRegistration();
    expect(flow.phase).toBe('register');
    expect(flow.race).toBeNull();
  });
});

describe('GameFlow – pause, abort and end during the race', () => {
  const two = [full[0], full[0]];
  function racing() {
    const flow = loading(2);
    flow.skipLoading();
    advance(flow, R.countdownSeconds + 1, two);
    expect(flow.phase).toBe('race');
    return flow;
  }

  it('pause freezes horses and race clock, Space again rides on', () => {
    const flow = racing();
    expect(flow.togglePause()).toBe(true);
    const time = flow.race!.time;
    const s = flow.race!.horses[0].s;
    advance(flow, 3, two);
    expect(flow.race!.time).toBe(time);
    expect(flow.race!.horses[0].s).toBe(s);
    expect(flow.togglePause()).toBe(true);
    advance(flow, 0.5, two);
    expect(flow.race!.horses[0].s).toBeGreaterThan(s);
  });

  it('the countdown can be paused too, but not the registration', () => {
    const flow = loading(1);
    expect(flow.togglePause()).toBe(false);
    flow.skipLoading();
    flow.togglePause();
    advance(flow, R.countdownSeconds + 1);
    expect(flow.phase).toBe('countdown');
  });

  it('ending the race ranks unfinished horses by position and shows the results', () => {
    const flow = racing();
    // Player 2 rides on, player 1 stops.
    advance(flow, 2, [{ drive: 0, steer: 0, jump: false }, full[0]]);
    flow.togglePause();
    expect(flow.endRace()).toBe(true);
    expect(flow.phase).toBe('results');
    expect(flow.paused).toBe(false);
    const results = flow.race!.results();
    expect(results.every((r) => !r.finished)).toBe(true);
    expect(results[1].rank).toBe(1);
    expect(results[0].rank).toBe(2);
  });

  it('aborting goes back to registration without results', () => {
    const flow = racing();
    flow.togglePause();
    flow.toRegistration();
    expect(flow.phase).toBe('register');
    expect(flow.paused).toBe(false);
    expect(flow.race).toBeNull();
  });
});

describe('splitLayout – split screen', () => {
  it('uses the full screen for one player', () => {
    expect(splitLayout(1, 1920, 1080).players).toEqual([{ x: 0, y: 0, w: 1920, h: 1080 }]);
  });

  it('splits side by side for two players', () => {
    const { players } = splitLayout(2, 1920, 1080, 4);
    expect(players).toHaveLength(2);
    expect(players[1].x).toBe(players[0].w + 4);
    expect(players[0].h).toBe(1080);
  });

  it('uses four quadrants for four players, player 1 top left', () => {
    const { players, spare } = splitLayout(4, 1920, 1080, 4);
    expect(players).toHaveLength(4);
    expect(players[0]).toMatchObject({ x: 0, y: 0 });
    expect(players[3].x).toBeGreaterThan(0);
    expect(players[3].y).toBeGreaterThan(0);
    expect(spare).toBeNull();
  });

  it('leaves the fourth quadrant for the overview with three players', () => {
    const { players, spare } = splitLayout(3, 1920, 1080, 4);
    expect(players).toHaveLength(3);
    expect(spare).toMatchObject({ x: 962, y: 542 });
  });
});
