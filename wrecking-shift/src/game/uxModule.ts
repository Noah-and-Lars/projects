/**
 * UX helpers: key bindings, target highlight, look-at descriptions, comfort / assist settings that act on the
 * running game, and the one-time quicksave hint on the first heist.
 *
 * Publishes:
 *   game.ext.keys  KeyMap (src/game/keymap.ts): canon(code), label(action), codes(action), bind(action, code)
 *   game.ext.ux    { lookText, lookBodyId, highlightCount, strengthOf(bodyId) } (tests / debugging)
 * Reads: game.ext.settings (keys, brightness, assistToughness), game.ext.mission / progress, game.ext.hud.root.
 */
import './ui/ux.css';
import { TargetHighlight, type HighlightItem, type HighlightKind } from '../render/highlight';
import type { VoxelBody } from '../sim/body';
import type { Mission, MissionItem } from '../sim/mission';
import type { Game, GameModule } from './game';
import { KeyMap, keyOf } from './keymap';
import { lookInfo } from './lookNames';
import type { Settings } from './progress';
import { el, esc, money, setHtml, show } from './ui/dom';

/** outline mission items within this distance (m) */
export const HIGHLIGHT_RANGE = 8;
/** look-at text for bodies within this distance (m) */
export const LOOK_RANGE = 4;
/** the crosshair must rest this long on a body before its description shows (s) */
export const LOOK_DELAY = 0.3;
/** highlight strength change per second (linear, so it settles to an exact value) */
const FADE = 3;
/** first heist: quicksave hint after this many fixed ticks */
const HINT_TICKS = 150;

/** outline strength for an item `d` metres away (aimed = under the crosshair) */
export function highlightStrength(d: number, aimed: boolean): number {
  if (d > HIGHLIGHT_RANGE) return 0;
  return aimed ? 1 : 0.15 + 0.5 * (1 - d / HIGHLIGHT_RANGE);
}

/** text shown under the crosshair for a body (null = nothing to say) */
export function lookLine(body: VoxelBody, mission: Mission | null): { html: string; text: string } | null {
  if (body.kind === 'debris') return null;
  const item: MissionItem | null = mission && !mission.ended ? mission.itemFor(body) : null;
  const info = item ? { name: item.name, line: undefined as string | undefined } : lookInfo(body.name);
  if (!info) return null;
  const tags: [string, string][] = [];
  if (item?.kind === 'required') tags.push(['req', 'Required target']);
  else if (item?.kind === 'bonus') tags.push(['bonus', 'Bonus']);
  if (item?.kind === 'valuable') tags.push(['val', money(item.amount ?? 0)]);
  if (!item && mission && !mission.ended) {
    for (const o of mission.def.objectives) {
      if (o.kind !== 'destroy' && o.kind !== 'demolish') continue;
      const id = o.target ?? o.id;
      if (body.tags.has('destroy:' + id) || body.tags.has('target:' + id)) { tags.push([o.required === false ? 'bonus' : 'req', o.required === false ? 'Bonus: knock it down' : 'Job: knock it down']); break; }
    }
    if (body.tags.has('escape')) tags.push(['val', 'Getaway van']);
  }
  const text = [info.name, ...tags.map((t) => t[1]), info.line ?? ''].filter(Boolean).join(' · ');
  const html = `<b>${esc(info.name)}</b>${tags.map(([c, t]) => `<span class="t ${c}">${esc(t)}</span>`).join('')}` +
    (info.line ? `<span class="ln">${esc(info.line)}</span>` : '');
  return { html, text };
}

export function createUxModule(): GameModule {
  const keymap = new KeyMap();
  const highlight = new TargetHighlight();
  const strength = new Map<number, number>();
  let lookEl: HTMLElement | null = null;
  let lookBody = -1, lookT = 0, lookText: string | null = null;
  let hintTicks = -1;

  const applySettings = (game: Game, s: Settings, key: string | null) => {
    if (key === null || key === 'keys') { keymap.set(s.keys); game.input.keys.clear(); }
    if (key === null || key === 'brightness') game.renderer.brightness = s.brightness;
    if ((key === null || key === 'assistToughness') && game.player) game.player.damageScale = s.assistToughness;
  };

  const setLook = (html: string | null, text: string | null, promptShown: boolean) => {
    lookText = text;
    if (!lookEl) return;
    show(lookEl, !!html);
    if (html) setHtml(lookEl, html);
    lookEl.classList.toggle('below', promptShown);
  };

  return {
    init(game) {
      game.ext.keys = keymap;
      game.input.remap = (code) => keymap.canon(code);
      const s: Settings | undefined = game.ext.settings;
      if (s) { applySettings(game, s, null); s.onChange((st, k) => applySettings(game, st, k)); }
      game.renderer.scene.add(highlight.root);
      game.ext.ux = {
        get lookText() { return lookText; },
        get lookBodyId() { return lookBody; },
        get highlightCount() { return highlight.count; },
        strengthOf: (id: number) => highlight.strengthOf(id),
      };
    },

    onLevelLoaded(game) {
      highlight.clear(); strength.clear();
      lookBody = -1; lookT = 0; setLook(null, null, false);
      const s: Settings | undefined = game.ext.settings;
      if (s) game.player.damageScale = s.assistToughness;
      // first heist ever: remind the player that planning can be saved
      const prog = game.ext.progress;
      hintTicks = game.ext.mission?.current && prog && Object.keys(prog.data.missions).length === 0 ? HINT_TICKS : -1;
    },

    fixedUpdate(game) {
      if (hintTicks < 0 || --hintTicks > 0) return;
      hintTicks = -1;
      const m: Mission | null = game.ext.mission?.current ?? null;
      if (!m || !m.canQuicksave() || !game.ext.progress?.takeHint('quicksave')) return;
      game.ext.hud?.toast?.(`Tip: <b>${esc(keyOf(game, 'quicksave'))}</b> saves your plan while the alarm is quiet — <b>${esc(keyOf(game, 'quickload'))}</b> puts you back if it goes wrong`, 'info', 7);
    },

    frameUpdate(game, dt) {
      if (!lookEl && game.ext.hud?.root) { lookEl = el('div', 'ws-look hide'); game.ext.hud.root.append(lookEl); }
      if (game.paused || game.loading) return; // menus: keep the picture as it is
      const p = game.player;
      const active = game.controlsEnabled && !p.dead && !p.seated && !game.cameraOverride && !game.ext.photo?.active;
      const mission: Mission | null = game.ext.mission?.current ?? null;
      const hit = active ? game.sim.raycast(p.eye, p.forward, HIGHLIGHT_RANGE) : null;
      const aimedId = hit ? hit.body.id : -1;

      // ---- target highlight
      const items: HighlightItem[] = [];
      if (active && mission && !mission.ended) {
        const eye = p.eye;
        let list = mission.items().map((it) => {
          const b = game.sim.bodies.get(it.bodyId);
          const c = b ? b.center() : null;
          return { it, b, d: c ? Math.hypot(c.x - eye.x, c.y - eye.y, c.z - eye.z) : Infinity };
        }).filter((x) => x.b && x.d <= HIGHLIGHT_RANGE + 1);
        if (game.renderer.performanceMode && list.length > 3) list = list.sort((a, b) => a.d - b.d).slice(0, 3);
        const keep = new Set<number>();
        for (const { it, b, d } of list) {
          const target = highlightStrength(d, it.bodyId === aimedId);
          const cur = strength.get(it.bodyId) ?? 0;
          const next = cur < target ? Math.min(target, cur + FADE * dt) : Math.max(target, cur - FADE * dt);
          if (next <= 0) { strength.delete(it.bodyId); continue; }
          strength.set(it.bodyId, next);
          keep.add(it.bodyId);
          const g = b!.grid;
          items.push({ bodyId: it.bodyId, kind: it.kind as HighlightKind, strength: next, center: { x: g.sx * 0.05, y: g.sy * 0.05, z: g.sz * 0.05 } });
        }
        for (const id of [...strength.keys()]) if (!keep.has(id)) strength.delete(id);
      } else strength.clear();
      highlight.update(items, game.renderer.bodies);

      // ---- look-at description
      const near = hit && hit.dist <= LOOK_RANGE ? hit.body : null;
      if (!near || near.id !== lookBody) { lookBody = near ? near.id : -1; lookT = 0; }
      else lookT += dt;
      const promptShown = !!game.ext.hud?.prompt;
      if (near && lookT >= LOOK_DELAY) {
        const l = lookLine(near, mission);
        setLook(l?.html ?? null, l?.text ?? null, promptShown);
      } else setLook(null, null, promptShown);
    },
  };
}
