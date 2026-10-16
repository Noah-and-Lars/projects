// Procedural cyberpunk street. Everything here is boxes and quads with
// material flags; the shader does the puddles, grime and window patterns.
//
// Layout: x across the street (road centre at 0), y up, z along the street.
// Road |x| < 4, sidewalks 4 < |x| < 7.5, buildings beyond |x| > 7.5.

import { type Vec3, add, cross, dot, makeRng, scale } from '../core/math';
import { Face, MatFlag, MatKind, SceneBuilder, type SceneData } from './geometry';

export const STREET = {
  roadHalfWidth: 4,
  sidewalkOuter: 7.5,
  sidewalkHeight: 0.16,
  zStart: -20,
  zEnd: 128,
  /** Where the player may walk. */
  walkMinZ: -14,
  walkMaxZ: 122,
  spawn: [-0.9, 0, -6] as Vec3,
};

const NEON_COLORS: Vec3[] = [
  [16, 1.2, 8],    // hot pink
  [0.8, 8, 16],    // cyan
  [16, 4, 0.6],    // orange
  [4, 16, 6],      // green
  [12, 1, 16],     // purple
  [16, 12, 2],     // yellow
];

const WINDOW_COLORS: Vec3[] = [
  [1.0, 0.72, 0.42], // warm bulb
  [0.55, 0.75, 1.0], // cool white / screen
  [0.9, 0.5, 1.0],   // purple
  [1.0, 0.45, 0.5],  // pinkish
  [0.5, 1.0, 0.8],   // mint
];

/** Facade looks: texture plus a tint; tints darken the scans to fit a night street. */
const FACADES: { tex: string; tint: Vec3; metallic?: number; rough?: number }[] = [
  { tex: 'brick', tint: [0.85, 0.8, 0.8] },
  { tex: 'brick', tint: [0.55, 0.5, 0.52] },
  { tex: 'brick2', tint: [0.6, 0.6, 0.62] },
  { tex: 'concrete', tint: [0.7, 0.7, 0.72] },
  { tex: 'concrete2', tint: [0.55, 0.57, 0.62] },
  { tex: 'corrugated', tint: [0.3, 0.34, 0.38], metallic: 0.5, rough: 0.9 },
  { tex: 'metal', tint: [0.8, 0.8, 0.82], metallic: 0.7 },
];

export function buildStreet(seed = 1337): SceneData {
  const rng = makeRng(seed);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rng() * arr.length) % arr.length];
  const b = new SceneBuilder();
  const S = STREET;

  // ---- shared materials -------------------------------------------------
  const mRoad = b.material({ base: [0.55, 0.55, 0.58], roughness: 1.0, flags: MatFlag.Road, tex: 'asphalt' });
  const mSidewalk = b.material({ base: [0.6, 0.6, 0.63], roughness: 1.0, flags: MatFlag.Sidewalk, tex: 'paving' });
  const mPole = b.material({ base: [0.30, 0.30, 0.32], metallic: 1, roughness: 0.35 });
  const mBollard = b.material({ base: [0.62, 0.62, 0.64], metallic: 1, roughness: 0.22 });
  const mLampHousing = b.material({ base: [0.05, 0.05, 0.055], metallic: 0.6, roughness: 0.4 });
  const mLampLed = b.material({ emission: [22, 24, 30], kind: MatKind.Emitter });
  const mSignBacking = b.material({ base: [0.015, 0.015, 0.02], roughness: 0.08 });
  const mAwning = b.material({ base: [0.09, 0.03, 0.045], roughness: 0.75 });
  const mCable = b.material({ base: [0.02, 0.02, 0.022], roughness: 0.6 });
  const mAcUnit = b.material({ base: [0.36, 0.36, 0.37], metallic: 0.7, roughness: 0.5 });
  const mPipe = b.material({ base: [0.12, 0.11, 0.10], metallic: 0.8, roughness: 0.45 });
  const mVending = b.material({ base: [0.5, 0.5, 0.55], metallic: 0.6, roughness: 0.6, tex: 'metal', texScale: 1.2 });
  const mVendingPanel = b.material({ emission: [0.7, 1.4, 1.8], kind: MatKind.Emitter });
  const mCrate = [
    b.material({ base: [0.05, 0.12, 0.07], roughness: 0.35 }),
    b.material({ base: [0.05, 0.07, 0.14], roughness: 0.35 }),
    b.material({ base: [0.14, 0.06, 0.04], roughness: 0.5 }),
  ];
  const mDarkGlass = b.material({ base: [0, 0, 0], roughness: 0.04 });

  // ---- ground -------------------------------------------------------------
  // The road is a single big quad; the shader paints puddles and lane lines.
  b.quad([-45, 0, S.zStart - 40], [45, 0, S.zStart - 40], [45, 0, S.zEnd + 60], [-45, 0, S.zEnd + 60], mRoad);
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? S.roadHalfWidth : -S.sidewalkOuter - 0.5;
    const x1 = side > 0 ? S.sidewalkOuter + 0.5 : -S.roadHalfWidth;
    const min: Vec3 = [x0, 0, S.zStart - 20];
    const max: Vec3 = [x1, S.sidewalkHeight, S.zEnd + 40];
    // Bottom face is never visible.
    b.box(min, max, mSidewalk, Face.All & ~Face.NY);
    b.walkSurfaces.push({ min, max, height: S.sidewalkHeight });
  }

  // ---- buildings ------------------------------------------------------------
  const blade: { z: number; side: number }[] = [];
  for (const side of [-1, 1]) {
    let z = S.zStart - 6;
    let i = 0;
    while (z < S.zEnd + 4) {
      const w = 9 + rng() * 9;
      const h = 10 + rng() * 22;
      const facadeX = side * S.sidewalkOuter;
      const backX = side * (S.sidewalkOuter + 14);
      const min: Vec3 = [Math.min(facadeX, backX), 0, z];
      const max: Vec3 = [Math.max(facadeX, backX), h, z + w - 0.3];
      const look = pick(FACADES);
      const mFacade = b.material({
        base: look.tint,
        roughness: look.rough ?? 1.0,
        metallic: look.metallic ?? 0,
        flags: MatFlag.Grime,
        tex: look.tex,
      });
      // Skip the face pointing away from the street and the bottom.
      const hidden = (side > 0 ? Face.PX : Face.NX) | Face.NY;
      b.box(min, max, mFacade, Face.All & ~hidden, true);

      const inward = -side; // normal of the street-facing wall
      const u: Vec3 = [0, 0, 1];
      const v: Vec3 = [0, 1, 0];
      const origin: Vec3 = [facadeX, 0, z];

      // Upper-floor window grid.
      for (let y = 4.0; y + 1.6 < h - 0.8; y += 3.0) {
        for (let zz = 0.9; zz + 1.4 < w - 0.3 - 0.9; zz += 2.4) {
          const lit = rng() < 0.36;
          let mat = mDarkGlass;
          if (lit) {
            const col = pick(WINDOW_COLORS);
            const inten = 0.15 + rng() * 0.4;
            // extra: window bottom, height, room left edge (along the wall), shop flag
            // aux: seed, variant, room width, room depth
            mat = b.material({
              base: [0, 0, 0],
              roughness: 0.04,
              emission: scale(col, inten),
              flags: MatFlag.Window,
              extra: [y, 1.6, z + zz - 0.5, 0],
              aux: [rng() * 100, 0, 2.4, 4.0],
            });
          }
          addWindow(b, origin, u, v, inward, zz, y, 1.4, 1.6, mat);
          // Balconies on some windows: slab plus railing.
          if (rng() < 0.12 && y > 4.5) {
            const bx0 = facadeX, bx1 = facadeX + inward * 1.0;
            b.box([Math.min(bx0, bx1), y - 0.18, z + zz - 0.3], [Math.max(bx0, bx1), y - 0.06, z + zz + 1.7], mSignBacking, Face.All & ~(side > 0 ? Face.PX : Face.NX));
            const rx0 = facadeX + inward * 0.96, rx1 = facadeX + inward * 1.0;
            b.box([Math.min(rx0, rx1), y - 0.06, z + zz - 0.3], [Math.max(rx0, rx1), y + 0.95, z + zz + 1.7], mPole, Face.All);
            continue;
          }
          // Air-conditioning units under some windows.
          if (rng() < 0.14) {
            const ax0 = facadeX + inward * 0.02;
            const ax1 = facadeX + inward * 0.5;
            b.box(
              [Math.min(ax0, ax1), y - 0.75, z + zz + 0.3],
              [Math.max(ax0, ax1), y - 0.15, z + zz + 1.1],
              mAcUnit,
              Face.All & ~(side > 0 ? Face.PX : Face.NX),
            );
          }
        }
      }

      // Ground floor: glowing shopfront window, sign band, maybe an awning.
      const shopCol = pick(WINDOW_COLORS);
      const shopW = w - 0.3 - 1.45;
      const mShop = b.material({
        base: [0, 0, 0],
        roughness: 0.03,
        emission: scale(shopCol, 0.1 + rng() * 0.18),
        flags: MatFlag.Window,
        extra: [0.35, 2.65, z + 0.6, 1],
        aux: [rng() * 100, 0, shopW, 6.0],
      });
      addWindow(b, origin, u, v, inward, 0.6, 0.35, shopW, 2.65, mShop, 0.05);

      // Advertising screen high up on taller buildings.
      if (h > 15 && rng() < 0.4) {
        const bw = Math.min(7, w - 2.3);
        const mBoard = b.material({
          emission: [1, 1, 1].map((c) => c * (1.6 + rng() * 1.2)) as Vec3,
          kind: MatKind.Emitter,
          flags: MatFlag.Billboard,
          extra: [z + 1.0, 10.6, bw, 3.6],
          aux: [rng() * 100, 0, 0, 0],
        });
        addWindow(b, origin, u, v, inward, 1.0, 10.6, bw, 3.6, mBoard, 0.1);
        // Frame around the screen.
        const fx0 = facadeX, fx1 = facadeX + inward * 0.12;
        b.box([Math.min(fx0, fx1), 10.45, z + 0.85], [Math.max(fx0, fx1), 14.35, z + 1.0 + bw + 0.15], mSignBacking, Face.All & ~(side > 0 ? Face.PX : Face.NX));
      }

      const bandX0 = facadeX, bandX1 = facadeX + inward * 0.15;
      b.box(
        [Math.min(bandX0, bandX1), 3.05, z + 0.2],
        [Math.max(bandX0, bandX1), 3.85, z + w - 0.5],
        mSignBacking,
        Face.All & ~(side > 0 ? Face.PX : Face.NX),
      );
      const signRoll = rng();
      if (signRoll < 0.4) {
        // Plain neon tube along the sign band.
        const mNeon = b.material({ emission: scale(pick(NEON_COLORS), 0.9), kind: MatKind.Emitter });
        const nx0 = facadeX + inward * 0.15, nx1 = facadeX + inward * 0.22;
        b.box(
          [Math.min(nx0, nx1), 3.42, z + 0.6],
          [Math.max(nx0, nx1), 3.5, z + w - 0.9],
          mNeon,
          Face.All & ~(side > 0 ? Face.PX : Face.NX),
        );
      } else if (signRoll < 0.8) {
        // Row of neon glyphs on the sign band.
        const len = Math.min(w - 2.0, 2 + Math.floor(rng() * 6) * 0.6);
        const mGlyph = b.material({
          emission: scale(pick(NEON_COLORS), 0.7),
          kind: MatKind.Emitter,
          flags: MatFlag.Glyph,
          extra: [z + 0.8, 3.15, len, 0.6],
          aux: [rng() * 100, 1, 0.6, 0],
        });
        addWindow(b, origin, u, v, inward, 0.8, 3.15, len, 0.6, mGlyph, 0.16);
        b.soundSpots.push({ pos: [facadeX + inward * 0.2, 3.45, z + 0.8 + len * 0.5], kind: 0 });
      }
      if (rng() < 0.4) {
        const aw0 = facadeX, aw1 = facadeX + inward * 1.3;
        b.box([Math.min(aw0, aw1), 2.95, z + 0.5], [Math.max(aw0, aw1), 3.07, z + w - 0.8], mAwning);
        // Rain runs off the awning's front edge; underneath it the rain sounds muffled.
        b.dripEdges.push([[aw1, 2.93, z + 0.5], [aw1, 2.93, z + w - 0.8]]);
        b.covers.push({ min: [Math.min(aw0, aw1), 2.9, z + 0.5], max: [Math.max(aw0, aw1), 3.1, z + w - 0.8] });
      }
      // A drain pipe running down the facade edge.
      if (rng() < 0.5) {
        const px0 = facadeX, px1 = facadeX + inward * 0.12;
        b.box([Math.min(px0, px1), 0.16, z + w - 0.45], [Math.max(px0, px1), h - 0.5, z + w - 0.33], mPipe);
      }
      if (i % 3 === 1) blade.push({ z: z + 2.5, side });
      z += w;
      i++;
    }
  }

  // Buildings closing off both ends of the street.
  for (const [zWall, inward] of [[S.zEnd + 3, -1], [S.zStart - 4, 1]] as const) {
    const mFacade = b.material({ base: [0.5, 0.52, 0.56], roughness: 1.0, flags: MatFlag.Grime, tex: 'concrete2' });
    const min: Vec3 = [-45, 0, inward > 0 ? zWall - 16 : zWall];
    const max: Vec3 = [45, 34, inward > 0 ? zWall : zWall + 16];
    b.box(min, max, mFacade, inward > 0 ? Face.PZ | Face.PY : Face.NZ | Face.PY, true);
    const origin: Vec3 = [-45, 0, zWall];
    const u: Vec3 = [1, 0, 0];
    const v: Vec3 = [0, 1, 0];
    for (let y = 3; y + 1.6 < 33; y += 3.0) {
      for (let xx = 1; xx + 1.4 < 89; xx += 2.4) {
        const lit = rng() < 0.3;
        const mat = lit
          ? b.material({ base: [0, 0, 0], roughness: 0.04, emission: scale(pick(WINDOW_COLORS), 0.12 + rng() * 0.35), flags: MatFlag.Window, extra: [y, 1.6, -45 + xx - 0.5, 0], aux: [rng() * 100, 0, 2.4, 4.0] })
          : mDarkGlass;
        addWindowZ(b, origin, u, v, inward, xx, y, 1.4, 1.6, mat);
      }
    }
  }

  // ---- neon blade signs: a column of glyphs on both faces -------------------
  for (const { z, side } of blade) {
    const col = pick(NEON_COLORS);
    const fx = side * S.sidewalkOuter;
    const inward = -side;
    const bx0 = fx, bx1 = fx + inward * 1.35;
    b.box([Math.min(bx0, bx1), 4.4, z], [Math.max(bx0, bx1), 9.6, z + 0.25], mSignBacking, Face.All & ~(side > 0 ? Face.PX : Face.NX));
    const sx0 = fx + inward * 0.18, sx1 = fx + inward * 1.2;
    const mGlyph = b.material({
      emission: col,
      kind: MatKind.Emitter,
      flags: MatFlag.Glyph,
      extra: [Math.min(sx0, sx1), 4.6, 1.02, 4.8],
      aux: [rng() * 100, 0, 0.95, 0],
    });
    b.box([Math.min(sx0, sx1), 4.6, z - 0.04], [Math.max(sx0, sx1), 9.4, z + 0.29], mGlyph, Face.NZ | Face.PZ);
    b.soundSpots.push({ pos: [fx + inward * 0.7, 7.0, z + 0.12], kind: 0 });
    // Bracket.
    b.box([Math.min(fx, fx + inward * 1.35), 9.55, z + 0.08], [Math.max(fx, fx + inward * 1.35), 9.62, z + 0.17], mPole);
  }

  // ---- overhead walkway across the street ---------------------------------------
  {
    const z = 64;
    const mDeck = b.material({ base: [0.45, 0.45, 0.48], metallic: 0.6, roughness: 1.0, tex: 'metal', texScale: 1.5 });
    const mRail = b.material({ base: [0.25, 0.25, 0.27], metallic: 1, roughness: 0.4 });
    const mStrip = b.material({ emission: [3, 3.6, 4.5], kind: MatKind.Emitter });
    b.box([-S.sidewalkOuter, 7.0, z], [S.sidewalkOuter, 7.4, z + 3.0], mDeck);
    b.covers.push({ min: [-S.sidewalkOuter, 6.9, z], max: [S.sidewalkOuter, 7.5, z + 3.0] });
    b.dripEdges.push([[-S.sidewalkOuter, 6.98, z], [S.sidewalkOuter, 6.98, z]], [[-S.sidewalkOuter, 6.98, z + 3.0], [S.sidewalkOuter, 6.98, z + 3.0]]);
    for (const zz of [z + 0.05, z + 2.85]) {
      b.box([-S.sidewalkOuter, 7.4, zz], [S.sidewalkOuter, 8.5, zz + 0.1], mRail, Face.All & ~Face.NY);
    }
    // Light strip under the deck and support columns on the sidewalks.
    b.box([-S.sidewalkOuter + 0.5, 6.94, z + 1.4], [S.sidewalkOuter - 0.5, 7.0, z + 1.6], mStrip, Face.All & ~Face.PY);
    for (const x of [-4.9, 4.9]) {
      b.box([x - 0.25, S.sidewalkHeight, z + 0.3], [x + 0.25, 7.0, z + 2.7], mDeck, Face.All & ~Face.NY, true);
    }
  }

  // ---- drains, manholes, banners ------------------------------------------------
  const mIron = b.material({ base: [0.12, 0.12, 0.13], metallic: 1, roughness: 0.55 });
  for (let i = 0; i < 7; i++) {
    const z = 6 + i * 18;
    for (const side of [-1, 1]) {
      b.box([side * 3.72 - 0.2, 0.0, z], [side * 3.72 + 0.2, 0.018, z + 0.7], mIron, Face.All & ~Face.NY);
    }
  }
  for (let i = 0; i < 5; i++) {
    const z = 14 + i * 23 + rng() * 6;
    const x = -1.5 + rng() * 3;
    b.box([x - 0.38, 0.0, z - 0.38], [x + 0.38, 0.012, z + 0.38], mIron, Face.All & ~Face.NY);
  }
  const mBanner = [
    b.material({ base: [0.55, 0.08, 0.1], roughness: 0.8 }),
    b.material({ base: [0.06, 0.25, 0.3], roughness: 0.8 }),
    b.material({ base: [0.5, 0.35, 0.05], roughness: 0.8 }),
  ];
  for (let i = 0; i < 6; i++) {
    const z = 12 + i * 19 + rng() * 8;
    const x = (rng() < 0.5 ? -1 : 1) * (1.5 + rng() * 1.5);
    const y = 7.5 + rng() * 2;
    b.box([x - 0.45, y - 1.9, z], [x + 0.45, y, z + 0.03], pick(mBanner));
    b.box([-S.sidewalkOuter, y, z], [S.sidewalkOuter, y + 0.03, z + 0.03], mCable, Face.All & ~Face.PY);
  }

  // ---- distant towers beyond the far end -------------------------------------------
  {
    const mTower = b.material({ base: [0.35, 0.37, 0.42], roughness: 1.0, flags: MatFlag.Grime, tex: 'concrete2', texScale: 6 });
    const mBeacon = b.material({ emission: [40, 2, 1], kind: MatKind.Emitter });
    const towers: [number, number, number, number][] = [[-30, 150, 22, 75], [-2, 162, 26, 95], [26, 152, 18, 60], [48, 170, 30, 82], [-58, 168, 28, 70]];
    for (const [x0, z0, w, h] of towers) {
      b.box([x0, 0, z0], [x0 + w, h, z0 + 22], mTower, Face.NZ | Face.PY | Face.NX | Face.PX);
      for (let y = 36; y + 2 < h - 2; y += 4.5) {
        for (let xx = 1.5; xx + 1.6 < w - 1; xx += 3.2) {
          if (rng() > 0.28) continue;
          const mat = b.material({ base: [0, 0, 0], roughness: 0.04, emission: scale(pick(WINDOW_COLORS), 0.3 + rng() * 0.5), flags: MatFlag.Window, extra: [y, 2.0, x0 + xx - 0.8, 0], aux: [rng() * 100, 0, 3.2, 5.0] });
          addWindowZ(b, [x0, 0, z0], [1, 0, 0], [0, 1, 0], -1, xx, y, 1.6, 2.0, mat);
        }
      }
      b.box([x0 + w * 0.5 - 0.15, h, z0 + 11], [x0 + w * 0.5 + 0.15, h + 0.3, z0 + 11.3], mBeacon);
    }
  }

  // ---- floating holographic ads over the sidewalks -----------------------------
  for (let i = 0; i < 7; i++) {
    const side = i % 2 === 0 ? 1 : -1;
    const z = 10 + i * 16 + rng() * 6;
    const hw = 2.2 + rng() * 0.8;
    const hh = hw * 1.25;
    const x0 = side * 5.6 - hw * 0.5;
    const y0 = 5.5 + rng() * 2.5;
    const mHolo = b.material({
      kind: MatKind.Hologram,
      extra: [x0, y0, hw, hh],
      aux: [rng() * 100, 2.0 + rng() * 1.5, 0, 0],
    });
    // Faces down the street so you see it head-on while walking; two-sided anyway.
    quadFacing(b, [x0, y0, z], [1, 0, 0], [0, 1, 0], hw, hh, [0, 0, -1], mHolo);
    b.soundSpots.push({ pos: [x0 + hw * 0.5, y0 + hh * 0.5, z], kind: 1 });
    // Projector pole and emitter underneath.
    const px = side * 5.6;
    b.box([px - 0.05, S.sidewalkHeight, z - 0.05], [px + 0.05, y0 - 0.3, z + 0.05], mPole, Face.All & ~Face.NY, true);
    b.box([px - 0.2, y0 - 0.3, z - 0.2], [px + 0.2, y0 - 0.1, z + 0.2], mLampHousing);
  }

  // ---- streetlights ---------------------------------------------------------
  for (let i = 0; i < 9; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = 4 + i * 14;
    const x = side * 4.55;
    b.box([x - 0.08, 0, z - 0.08], [x + 0.08, 6.3, z + 0.08], mPole, Face.All & ~Face.NY, true);
    const armEnd = x - side * 1.7;
    b.box([Math.min(x, armEnd), 6.12, z - 0.05], [Math.max(x, armEnd), 6.22, z + 0.05], mPole);
    b.box([armEnd - 0.4, 6.06, z - 0.22], [armEnd + 0.4, 6.3, z + 0.22], mLampHousing);
    b.box([armEnd - 0.32, 5.99, z - 0.16], [armEnd + 0.32, 6.06, z + 0.16], mLampLed, Face.All & ~Face.PY);
  }

  // ---- bollards, cables, vending machines, crates -----------------------
  for (let i = 0; i < 17; i++) {
    const z = 1 + i * 7.5;
    for (const side of [-1, 1]) {
      const x = side * 4.3;
      b.box([x - 0.07, S.sidewalkHeight, z - 0.07], [x + 0.07, 1.05, z + 0.07], mBollard, Face.All & ~Face.NY, true);
    }
  }
  for (let i = 0; i < 9; i++) {
    const z = 2 + rng() * (S.zEnd - 10);
    const y = 7 + rng() * 3;
    b.box([-S.sidewalkOuter, y, z], [S.sidewalkOuter, y + 0.035, z + 0.035], mCable, Face.All & ~Face.PY);
  }
  for (let i = 0; i < 6; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = 5 + rng() * (S.zEnd - 20);
    const inner = side * (S.sidewalkOuter - 0.85);
    const outer = side * S.sidewalkOuter;
    b.box([Math.min(inner, outer), S.sidewalkHeight, z], [Math.max(inner, outer), 2.0, z + 1.0], mVending, Face.All & ~Face.NY, true);
    const p0 = inner, p1 = inner - side * 0.02;
    b.box([Math.min(p0, p1), 0.6, z + 0.12], [Math.max(p0, p1), 1.7, z + 0.88], mVendingPanel, side > 0 ? Face.NX : Face.PX);
  }
  for (let i = 0; i < 7; i++) {
    const side = rng() < 0.5 ? -1 : 1;
    const z = 8 + rng() * (S.zEnd - 24);
    const inner = side * (S.sidewalkOuter - 1.0 - rng() * 0.6);
    const outer = side * (S.sidewalkOuter - 0.1);
    const hgt = 0.8 + rng() * 0.6;
    b.box([Math.min(inner, outer), S.sidewalkHeight, z], [Math.max(inner, outer), S.sidewalkHeight + hgt, z + 1.1 + rng()], pick(mCrate), Face.All & ~Face.NY, true);
  }

  return b.finish();
}

/** Window quad on a wall whose normal is along +/-x (street-side facades). */
function addWindow(
  b: SceneBuilder, origin: Vec3, u: Vec3, v: Vec3, inward: number,
  du: number, dv: number, w: number, h: number, mat: number, offset = 0.03,
): void {
  const o = add(add(origin, scale(u, du)), scale(v, dv));
  const n: Vec3 = [inward, 0, 0];
  quadFacing(b, add(o, scale(n, offset)), u, v, w, h, n, mat);
}

/** Window quad on a wall whose normal is along +/-z (end walls). */
function addWindowZ(
  b: SceneBuilder, origin: Vec3, u: Vec3, v: Vec3, inward: number,
  du: number, dv: number, w: number, h: number, mat: number, offset = 0.03,
): void {
  const o = add(add(origin, scale(u, du)), scale(v, dv));
  const n: Vec3 = [0, 0, inward];
  quadFacing(b, add(o, scale(n, offset)), u, v, w, h, n, mat);
}

function quadFacing(b: SceneBuilder, o: Vec3, u: Vec3, v: Vec3, w: number, h: number, n: Vec3, mat: number): void {
  const a = o;
  const bb = add(o, scale(u, w));
  const c = add(bb, scale(v, h));
  const d = add(o, scale(v, h));
  // Flip the winding when the natural normal points away from the street.
  if (dot(cross(u, v), n) >= 0) b.quad(a, bb, c, d, mat);
  else b.quad(a, d, c, bb, mat);
}
