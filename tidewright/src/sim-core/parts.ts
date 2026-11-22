// Data-driven part catalogue (original names, see design brief §6).
// Sizes are in 0.25 m cells in the part's local frame. Forward is -Z, up is +Y, right is +X.
import { REFLECT, type Mat3i } from './rotations';

export const CELL = 0.25; // metres per grid cell

export type Category = 'structure' | 'control' | 'motion' | 'drive' | 'power' | 'marine' | 'light';
export type Shape =
  | 'cube' | 'slab' | 'ramp' | 'corner' | 'frame' | 'pane'
  | 'wheel' | 'engine' | 'seat' | 'tank' | 'battery' | 'gear' | 'diff' | 'lamp' | 'float' | 'screw' | 'rudder';

export interface PropDef {
  key: string;
  label: string;
  kind: 'number' | 'choice' | 'bool';
  default: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
}

export interface WheelSim { kind: 'wheel'; radius: number; width: number; travel: number; suspension: boolean; grip: number }
export interface EngineSim { kind: 'engine'; peakTorque: number; idleRps: number; peakRps: number; maxRps: number; inertia: number; burn: number }
export interface TankSim { kind: 'tank'; litres: number }
export interface BatterySim { kind: 'battery'; capacity: number }
export interface SeatSim { kind: 'seat' }
export interface GearSim { kind: 'gear' }
export interface DiffSim { kind: 'diff' }
export interface LampSim { kind: 'lamp' }
export interface ScrewSim { kind: 'screw'; diameter: number; pitchSpeed: number }
export interface RudderSim { kind: 'rudder'; area: number }
export type PartSim = WheelSim | EngineSim | TankSim | BatterySim | SeatSim | GearSim | DiffSim | LampSim | ScrewSim | RudderSim;

export interface PartDef {
  id: string;
  name: string;
  category: Category;
  shape: Shape;
  size: [number, number, number];
  mass: number; // kg (dry)
  cost: number; // credits
  solid: boolean; // contributes a collision box
  /** Fraction of the part's cell volume that displaces water (0..1). */
  displace: number;
  /** Water and air pass through (lattice, open parts). */
  porous?: boolean;
  /** Local reflection that maps the part's shape onto itself (used by mirror tool). */
  symmetry: Mat3i;
  desc: string;
  props?: PropDef[];
  sim?: PartSim;
}

const SYM_X = REFLECT.x;

const wheelProps = (susp: boolean): PropDef[] => [
  { key: 'steer', label: 'Steering', kind: 'choice', default: 'auto', options: ['auto', 'yes', 'no'] },
  { key: 'driven', label: 'Driven', kind: 'bool', default: true },
  ...(susp
    ? [
        { key: 'stiffness', label: 'Spring stiffness', kind: 'number', default: 1, min: 0.4, max: 2.5, step: 0.05 } as PropDef,
        { key: 'damping', label: 'Damping', kind: 'number', default: 1, min: 0.3, max: 2.5, step: 0.05 } as PropDef,
      ]
    : []),
];

function wheel(id: string, name: string, d: number, w: number, susp: boolean, mass: number, cost: number): RawPart {
  const r = (d * CELL) / 2;
  return {
    id, name, category: 'motion', shape: 'wheel', size: [w, d, d], mass, cost, solid: false, symmetry: SYM_X,
    desc: susp
      ? `Wheel with a built-in sprung suspension. ${(r * 2).toFixed(2)} m tyre.`
      : `Rigid wheel with only tyre flex. ${(r * 2).toFixed(2)} m tyre.`,
    props: wheelProps(susp),
    sim: { kind: 'wheel', radius: r, width: w * CELL, travel: susp ? r * 0.9 : r * 0.25, suspension: susp, grip: 1.05 },
  };
}

function engine(id: string, name: string, size: [number, number, number], mass: number, cost: number, torque: number, maxRps: number): RawPart {
  return {
    id, name, category: 'drive', shape: 'engine', size, mass, cost, solid: true, symmetry: SYM_X,
    desc: `Combustion engine. ${torque} N·m peak, ${maxRps} rev/s red line. Burns fuel in proportion to its speed.`,
    sim: { kind: 'engine', peakTorque: torque, idleRps: 3, peakRps: maxRps * 0.55, maxRps, inertia: mass * 0.0025, burn: mass * 0.00004 },
  };
}

type RawPart = Omit<PartDef, 'displace'> & { displace?: number };
const RAW: RawPart[] = [
  // Structure
  { id: 'plate', name: 'Plate', category: 'structure', shape: 'cube', size: [1, 1, 1], mass: 3, cost: 4, solid: true, symmetry: SYM_X, desc: 'A full 0.25 m structural block.' },
  { id: 'slab', name: 'Slab', category: 'structure', shape: 'slab', size: [1, 1, 1], mass: 1.6, cost: 3, solid: true, symmetry: SYM_X, desc: 'A half-height block. Good for floors and trims.' },
  { id: 'ramp', name: 'Ramp', category: 'structure', shape: 'ramp', size: [1, 1, 1], mass: 1.8, cost: 4, solid: true, symmetry: SYM_X, desc: 'A wedge for noses, tails and fairings.' },
  { id: 'corner', name: 'Corner', category: 'structure', shape: 'corner', size: [1, 1, 1], mass: 1, cost: 4, solid: true, symmetry: [0, 0, 1, 0, 1, 0, 1, 0, 0], desc: 'A three-sided corner piece for rounding off ramps.' },
  { id: 'frame', name: 'Frame', category: 'structure', shape: 'frame', size: [1, 1, 1], mass: 1.2, cost: 3, solid: true, symmetry: SYM_X, desc: 'An open lattice beam. Light, but lets wind and water through.' },
  { id: 'pane', name: 'Pane', category: 'structure', shape: 'pane', size: [1, 1, 1], mass: 1.5, cost: 6, solid: true, symmetry: SYM_X, desc: 'A clear glazed block for cabs and canopies.' },
  // Control
  {
    id: 'helm', name: 'Helm seat', category: 'control', shape: 'seat', size: [3, 3, 3], mass: 25, cost: 120, solid: true, symmetry: SYM_X,
    desc: 'Driver seat. Gives throttle, steer and two aux axes. Faces the vehicle bow (−Z).', sim: { kind: 'seat' },
  },
  // Motion
  wheel('roller_s', 'Roller wheel S', 2, 1, false, 8, 30),
  wheel('roller_m', 'Roller wheel M', 3, 1, false, 16, 50),
  wheel('roller_l', 'Roller wheel L', 5, 2, false, 40, 110),
  wheel('spring_s', 'Spring roller S', 2, 1, true, 11, 55),
  wheel('spring_m', 'Spring roller M', 3, 2, true, 22, 90),
  wheel('spring_l', 'Spring roller L', 5, 2, true, 50, 180),
  // Drive
  engine('burner_s', 'Burner engine S', [2, 2, 3], 110, 600, 560, 18),
  engine('burner_m', 'Burner engine M', [3, 3, 4], 240, 1400, 1700, 16),
  engine('burner_l', 'Burner engine L', [4, 4, 6], 520, 3200, 4200, 14),
  {
    id: 'gearstack', name: 'Gear stack', category: 'drive', shape: 'gear', size: [2, 2, 2], mass: 30, cost: 300, solid: true, symmetry: SYM_X,
    desc: 'Five forward gears and a reverse. Without one, the drivetrain has a single low ratio.',
    props: [{ key: 'mode', label: 'Shifting', kind: 'choice', default: 'auto', options: ['auto', 'manual'] }],
    sim: { kind: 'gear' },
  },
  {
    id: 'differential', name: 'Differential', category: 'drive', shape: 'diff', size: [2, 2, 2], mass: 22, cost: 250, solid: true, symmetry: SYM_X,
    desc: 'Lets driven wheels turn at different speeds in corners. Without one, the driven wheels are locked together.',
    props: [{ key: 'mode', label: 'Mode', kind: 'choice', default: 'open', options: ['open', 'limited', 'locked'] }],
    sim: { kind: 'diff' },
  },
  // Power
  { id: 'tank_s', name: 'Fuel tank S', category: 'power', shape: 'tank', size: [2, 2, 2], mass: 6, cost: 80, solid: true, symmetry: SYM_X, desc: 'Holds 12 L of fuel.', sim: { kind: 'tank', litres: 12 } },
  { id: 'tank_m', name: 'Fuel tank M', category: 'power', shape: 'tank', size: [3, 3, 3], mass: 14, cost: 160, solid: true, symmetry: SYM_X, desc: 'Holds 45 L of fuel.', sim: { kind: 'tank', litres: 45 } },
  { id: 'tank_l', name: 'Fuel tank L', category: 'power', shape: 'tank', size: [4, 4, 4], mass: 28, cost: 320, solid: true, symmetry: SYM_X, desc: 'Holds 110 L of fuel.', sim: { kind: 'tank', litres: 110 } },
  { id: 'cell_s', name: 'Cell battery S', category: 'power', shape: 'battery', size: [1, 1, 1], mass: 8, cost: 90, solid: true, symmetry: SYM_X, desc: 'Starts engines and runs lamps. Recharged by running engines.', sim: { kind: 'battery', capacity: 1 } },
  { id: 'cell_m', name: 'Cell battery M', category: 'power', shape: 'battery', size: [2, 1, 2], mass: 24, cost: 220, solid: true, symmetry: SYM_X, desc: 'A larger battery bank.', sim: { kind: 'battery', capacity: 4 } },
  // Marine
  { id: 'float', name: 'Float block', category: 'marine', shape: 'float', size: [1, 1, 1], mass: 0.6, cost: 8, solid: true, symmetry: SYM_X, desc: 'Closed-cell foam block. Very light; adds buoyancy anywhere.' },
  {
    id: 'screw_s', name: 'Screw S', category: 'marine', shape: 'screw', size: [2, 2, 1], mass: 9, cost: 140, solid: false, symmetry: SYM_X,
    desc: 'Small propeller, 0.5 m. Pushes toward the bow (−Z) when submerged. Driven by the engines.', sim: { kind: 'screw', diameter: 0.5, pitchSpeed: 17 },
  },
  {
    id: 'screw_m', name: 'Screw M', category: 'marine', shape: 'screw', size: [3, 3, 1], mass: 20, cost: 320, solid: false, symmetry: SYM_X,
    desc: 'Medium propeller, 0.75 m. More grip on the water, lower top speed.', sim: { kind: 'screw', diameter: 0.75, pitchSpeed: 15 },
  },
  {
    id: 'rudder', name: 'Rudder', category: 'marine', shape: 'rudder', size: [1, 3, 2], mass: 6, cost: 90, solid: false, symmetry: SYM_X,
    desc: 'Steers in water. Follows the helm steering. Place it behind a screw at the stern.', sim: { kind: 'rudder', area: 0.375 },
  },
  // Light
  { id: 'lamp', name: 'Lamp', category: 'light', shape: 'lamp', size: [1, 1, 1], mass: 1, cost: 25, solid: true, symmetry: SYM_X, desc: 'A glowing lamp block. Turn on with L while driving.', sim: { kind: 'lamp' } },
];

const DISPLACE: Partial<Record<Shape, number>> = {
  cube: 1, slab: 0.5, ramp: 0.5, corner: 0.17, frame: 0.1, pane: 1, wheel: 0.6, engine: 0.6, seat: 0.3, tank: 0.9,
  battery: 0.5, gear: 0.5, diff: 0.5, lamp: 0.5, float: 1, screw: 0.05, rudder: 0.1,
};
export const PARTS: PartDef[] = RAW.map((p) => ({
  ...p,
  displace: p.displace ?? DISPLACE[p.shape] ?? 0.5,
  porous: p.porous ?? (p.shape === 'frame' || p.shape === 'screw' || p.shape === 'rudder'),
}));

export const PART_BY_ID: ReadonlyMap<string, PartDef> = new Map(PARTS.map((p) => [p.id, p]));

export function partDef(id: string): PartDef {
  const p = PART_BY_ID.get(id);
  if (!p) throw new Error('unknown part ' + id);
  return p;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  structure: 'Structure',
  control: 'Control',
  motion: 'Motion',
  drive: 'Drive',
  power: 'Power & fuel',
  marine: 'Marine',
  light: 'Light',
};

export function defaultProps(def: PartDef): Record<string, number | string | boolean> {
  const o: Record<string, number | string | boolean> = {};
  for (const p of def.props ?? []) o[p.key] = p.default;
  return o;
}
