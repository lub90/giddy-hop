import { describe, expect, it } from 'vitest';
import { CONFIG } from '../src/config';
import { GameFlow } from '../src/game/gameFlow';
import { Track } from '../src/game/track';
import { splitLayout } from '../src/render/layout';

const shortTrack = new Track({ halfWidth: 3.5, shoulder: 1.5, segments: [{ kind: 'straight', length: 20 }] });
const full = [{ drive: 1, steer: 0, jump: false }];

function advance(flow: GameFlow, seconds: number, inputs = full) {
  for (let i = 0; i < seconds * 60; i++) flow.update(1 / 60, inputs);
}

describe('GameFlow – phases', () => {
  it('goes from loading to registration, then countdown, race and results', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    expect(flow.phase).toBe('loading');
    flow.ready();
    expect(flow.phase).toBe('register');
    expect(flow.start(1)).toBe(true);
    expect(flow.phase).toBe('countdown');
    expect(flow.countdownValue).toBe(3);
    advance(flow, CONFIG.race.countdownSeconds + 0.1);
    expect(flow.phase).toBe('race');
    advance(flow, 10 + CONFIG.race.resultsDelaySeconds);
    expect(flow.phase).toBe('results');
  });

  it('horses do not move during the countdown', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    flow.ready();
    flow.start(1);
    advance(flow, 2);
    expect(flow.race!.horses[0].s).toBe(0);
  });

  it('cannot start without players', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    flow.ready();
    expect(flow.start(0)).toBe(false);
    expect(flow.phase).toBe('register');
  });

  it('supports a rematch and going back to registration', () => {
    const flow = new GameFlow(shortTrack, structuredClone(CONFIG));
    flow.ready();
    flow.start(2);
    advance(flow, 20, [full[0], full[0]]);
    expect(flow.rematch()).toBe(true);
    expect(flow.phase).toBe('countdown');
    expect(flow.race!.horses).toHaveLength(2);
    expect(flow.race!.horses[0].s).toBe(0);
    flow.toRegistration();
    expect(flow.phase).toBe('register');
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
