/**
 * UI module: HUD, menus, map view, mission visuals (helicopter, alarm wires) and head-bob.
 *
 * Publishes:
 *   game.ext.hud  { setPrompt(text | null, priority = 0, source = 'default'), toast(html, kind?) }
 *   game.ext.ui   UiApi (also `window.__game.ui`): boot, startMission, startSandbox, openMenu, closeMenus,
 *                 back, toggleMap, state
 * Reads: game.ext.mission / progress / settings (MissionModule), game.ext.vehicles?.current
 *        ({ name, speedKmh, health }), game.ext.quicksave?.{save, load, has}.
 */
import './ui/ui.css';
import type { Game, GameModule } from './game';
import type { SimEvent } from '../sim/sim';
import type { MissionApi } from './missionModule';
import type { Progress } from './progress';
import { el } from './ui/dom';
import { Hud } from './ui/hud';
import { MissionVisuals } from './ui/heli';
import { MapView } from './ui/mapView';
import { Menus, type MenuHost, type MenuName } from './ui/menus';
import { money } from './ui/dom';
import { esc } from './ui/dom';

/** frames between the mission ending and the end screen (fixed ticks) */
const END_DELAY = 45;

export interface UiState {
  session: 'menu' | 'play';
  menu: MenuName | null;
  mapOpen: boolean;
  missionId: string | null;
  phase: string | null;
  timeLeft: number | null;
  escapeOpen: boolean;
  objectives: { id: string; title: string; required: boolean; done: boolean; detail: string }[];
  score: number;
  cash: number;
  prompt: string | null;
  sandbox: boolean;
  result: any;
}

export class UiModule implements GameModule, MenuHost {
  game!: Game;
  progress!: Progress;
  api!: MissionApi;
  session: 'menu' | 'play' = 'play';
  private root = el('div', 'ws');
  private hud = new Hud();
  private map = new MapView();
  private menus!: Menus;
  private visuals = new MissionVisuals();
  private stack: { name: MenuName; arg: string }[] = [];
  private endTimer = -1;
  private endKind: 'success' | 'fail' = 'success';
  private orbit = 0.6;
  private prevStride = 0;
  private bobAmp = 0;

  init(game: Game): void {
    this.game = game;
    this.progress = game.ext.progress;
    this.api = game.ext.mission;
    this.menus = new Menus(this);
    (document.getElementById('ui') ?? document.body).append(this.root);
    this.root.append(this.hud.root, this.map.root, this.menus.root);
    game.renderer.scene.add(this.visuals.root);
    const hud = this.hud;
    game.ext.hud = {
      setPrompt: (text: string | null, priority = 0, source = 'default') => hud.setPrompt(text, priority, source),
      toast: (html: string, kind?: any) => hud.toast(html, kind),
      get prompt() { return hud.currentPrompt(); },
    };
    game.ext.ui = this.uiApi();
    this.api?.onEnd((r) => {
      this.endKind = r.success ? 'success' : 'fail';
      this.endTimer = END_DELAY;
      game.controlsEnabled = false;
      if (this.map.open) this.map.setOpen(game, false);
    });
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    document.addEventListener('pointerlockchange', () => {
      if (document.pointerLockElement || game.testMode) return;
      if (this.session === 'play' && !this.menus.name && this.endTimer < 0 && !this.api?.current?.ended) this.open('pause');
    });
  }

  private uiApi() {
    return {
      boot: (params: URLSearchParams) => this.boot(params),
      startMission: (id: string) => this.startMission(id),
      startSandbox: (levelId: string) => this.startSandbox(levelId),
      openMenu: (name: MenuName, arg = '') => this.open(name, arg),
      closeMenus: () => this.close(),
      back: () => this.back(),
      toggleMap: (on?: boolean) => { this.map.setOpen(this.game, on ?? !this.map.open); return this.map.open; },
      toggleDebug: (on?: boolean) => { this.hud.debug = on ?? !this.hud.debug; return this.hud.debug; },
      state: () => this.state(),
    };
  }

  /** called by main.ts after the first level load */
  boot(params: URLSearchParams): void {
    const mission = params.get('mission');
    const sandbox = params.get('sandbox');
    if (mission && this.api.byId(mission)) this.startMission(mission);
    else if (sandbox != null) this.startSandbox(sandbox);
    else if (!this.game.testMode && !params.has('level')) { this.session = 'menu'; this.open('main'); }
  }

  // ---------------------------------------------------------------- menu stack

  open(name: MenuName, arg = ''): void {
    if (this.map.open) this.map.setOpen(this.game, false);
    if (name === 'main') { this.stack = []; this.session = 'menu'; }
    if (name === 'success' || name === 'fail') this.stack = [];
    this.stack.push({ name, arg });
    this.menus.render(name, arg);
    this.applyMenuState(true);
  }
  back(): void {
    this.stack.pop();
    const top = this.stack[this.stack.length - 1];
    if (top) this.menus.render(top.name, top.arg);
    else if (this.session === 'menu') this.open('main');
    else this.close();
  }
  close(): void {
    this.stack = [];
    this.menus.render(null);
    if (this.session === 'menu') { this.session = 'play'; this.game.cameraOverride = null; }
    this.applyMenuState(false);
  }
  private applyMenuState(open: boolean): void {
    const g = this.game, inp = g.input;
    g.paused = open;
    g.controlsEnabled = !open;
    inp.allowLock = !open;
    if (open) inp.exitLock();
    else if (!g.testMode) inp.requestLock();
  }

  startMission(id: string): void {
    this.stack = [];
    this.menus.render(null);
    this.session = 'play';
    this.endTimer = -1;
    this.game.cameraOverride = null;
    this.api.start(id);
    this.applyMenuState(false);
  }
  startSandbox(levelId: string): void {
    this.stack = [];
    this.menus.render(null);
    this.session = 'play';
    this.endTimer = -1;
    this.game.cameraOverride = null;
    this.api.startSandbox(levelId);
    this.applyMenuState(false);
  }
  quitToMenu(): void {
    this.endTimer = -1;
    this.api.quit();
    this.open('main');
  }

  // ---------------------------------------------------------------- input

  private onKey(e: KeyboardEvent): void {
    if (e.repeat) return;
    if (e.code === 'F3') { e.preventDefault(); this.hud.debug = !this.hud.debug; return; }
    if (e.code === 'Tab') {
      e.preventDefault();
      if (this.session === 'play' && !this.menus.name && this.endTimer < 0) this.map.setOpen(this.game, !this.map.open);
      return;
    }
    if (e.code === 'Escape') {
      const n = this.menus.name;
      if (n) { if (n !== 'main' && n !== 'success' && n !== 'fail') this.back(); }
      else if (this.map.open) this.map.setOpen(this.game, false);
      else if (this.session === 'play' && this.endTimer < 0) this.open('pause');
    }
  }

  // ---------------------------------------------------------------- module hooks

  onLevelLoaded(game: Game): void {
    if (this.map.open) this.map.setOpen(game, false);
    this.endTimer = -1;
    this.prevStride = 0;
    this.hud.reset();
    game.viewBob.y = 0; game.viewBob.roll = 0;
  }

  fixedUpdate(_game: Game): void {
    if (this.endTimer > 0 && --this.endTimer === 0) {
      this.endTimer = -1;
      this.open(this.endKind);
    }
  }

  onEvents(game: Game, events: SimEvent[]): void {
    for (const e of events) {
      if (e.type !== 'custom') continue;
      const d = e.data ?? {};
      switch (e.name) {
        case 'mission:pickup': this.hud.toast(`<b>+${money(d.amount)}</b> ${esc(d.name)}`, 'cash'); break;
        case 'mission:target': this.hud.toast(`<b>${esc(d.title)}</b> secured${d.required ? '' : ' (bonus)'}`, 'good'); break;
        case 'mission:alarm': {
          const why = d.cause === 'fire' ? 'Fire alarm!' : d.cause === 'demolition' ? 'Sensors tripped!' : 'Alarm triggered!';
          this.hud.toast(`${why} Security in ${d.seconds} s`, 'alarm', 4.5);
          break;
        }
        case 'mission:objective': {
          const o = this.api.current?.def.objectives.find((x) => x.id === d.id);
          if (o && o.kind !== 'collect') this.hud.toast(`✔ ${esc(d.title)}`, 'good');
          break;
        }
        case 'mission:escapeOpen': this.hud.toast('Job done — <b>get to the van</b> and press E', 'good', 5); break;
        case 'mission:heli': this.hud.toast('Security helicopter inbound', 'alarm'); break;
        case 'player:hurt': this.hud.hurt(Number(d.amount) || 0.1); break;
      }
    }
    void game;
  }

  frameUpdate(game: Game, dt: number): void {
    const mission = this.api?.current ?? null;
    // title-screen backdrop: slow orbit over the level
    if (this.session === 'menu' && this.menus.name) {
      this.orbit += dt * 0.05;
      const b = game.level.bounds;
      const cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
      const r = Math.max(8, Math.min(60, Math.max(b.max.x - b.min.x, b.max.z - b.min.z) * 0.55));
      const h = Math.min(18, r * 0.45);
      const ex = cx + Math.sin(this.orbit) * r, ez = cz + Math.cos(this.orbit) * r;
      game.cameraOverride = { eye: { x: ex, y: h, z: ez }, yaw: this.orbit, pitch: -Math.atan2(h, r) * 0.75 };
    }
    this.map.update(game);
    this.visuals.update(mission, dt);
    this.headBob(game, dt);
    const m = this.menus.name;
    const hudVisible = this.session === 'play' && (!m || m === 'pause' || m === 'settings' || m === 'controls');
    this.hud.update(game, dt, { visible: hudVisible && !this.map.open, mapOpen: this.map.open });
  }

  private headBob(game: Game, dt: number): void {
    const p = game.player;
    const stride = p.stride;
    const on = !!game.ext.settings?.headBob && !game.cameraOverride && !p.seated && game.controlsEnabled;
    const speed = dt > 0 ? Math.abs(stride - this.prevStride) / dt : 0;
    this.prevStride = stride;
    const target = on && p.grounded ? Math.min(1.3, speed / 5.2) : 0;
    this.bobAmp += (target - this.bobAmp) * Math.min(1, dt * 8);
    const ph = stride * (Math.PI / 0.75);
    game.viewBob.y = this.bobAmp * 0.028 * Math.sin(ph * 2);
    game.viewBob.roll = this.bobAmp * 0.005 * Math.sin(ph);
  }

  state(): UiState {
    const m = this.api?.current ?? null;
    return {
      session: this.session,
      menu: this.menus.name,
      mapOpen: this.map.open,
      missionId: m?.def.id ?? null,
      phase: m?.phase ?? null,
      timeLeft: m ? (m.phase === 'alarm' || m.phase === 'failed' ? Math.round(m.timeLeft * 100) / 100 : null) : null,
      escapeOpen: !!m?.escapeOpen,
      objectives: m ? m.objectives().map((o) => ({ id: o.id, title: o.title, required: o.required, done: o.done, detail: o.detail })) : [],
      score: m?.result?.score ?? m?.score ?? 0,
      cash: m?.cash ?? 0,
      prompt: this.hud.currentPrompt(),
      sandbox: !!this.api?.sandbox,
      result: m?.result ?? null,
    };
  }
}
