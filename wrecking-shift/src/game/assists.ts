/**
 * Assist / difficulty options (Settings -> Assists). Pure helpers, no DOM: unit-tested in tests/unit/ux.test.ts.
 *
 * - alarm time: 'normal' | '+15' | '+30' | '+60' | '-10' | 'off'. 'off' = the alarm still goes off (security,
 *   helicopter, quicksave lock) but its clock never runs out; the HUD says "no time limit".
 * - ammo: x1 / x1.5 / x2 on every finite max ammo in missions (rounded up).
 * - toughness: damage the player takes x0.5 / x1 / x1.5.
 * - unlock all jobs: every job on the board can be taken.
 * A run with any option away from normal is recorded with its assist labels (result + saved record: "assisted"),
 * scoring is unchanged except that the time bonus never counts more seconds than the job's normal alarm.
 */
import type { MissionAssist } from '../sim/mission';

export type AlarmAssist = 'normal' | '+15' | '+30' | '+60' | '-10' | 'off';
export const ALARM_OPTIONS: AlarmAssist[] = ['off', '+60', '+30', '+15', 'normal', '-10'];
export const AMMO_OPTIONS = [1, 1.5, 2];
export const TOUGHNESS_OPTIONS = [0.5, 1, 1.5];

export interface AssistSettings {
  assistAlarm: AlarmAssist;
  assistAmmo: number;
  assistToughness: number;
  assistJobs: boolean;
}

export function isAlarmAssist(v: any): v is AlarmAssist { return ALARM_OPTIONS.includes(v); }

/** what the mission sim needs: seconds added to the alarm clock / clock frozen + labels for the result */
export function missionAssist(s: AssistSettings, jobUnlockedByAssist = false): MissionAssist {
  const a = s.assistAlarm;
  const tags = assistTags(s, jobUnlockedByAssist);
  return {
    alarmDelta: a === 'off' || a === 'normal' ? 0 : Number(a),
    alarmUnlimited: a === 'off',
    tags,
  };
}

/** labels of the options that are away from normal (empty = an unassisted run) */
export function assistTags(s: AssistSettings, jobUnlockedByAssist = false): string[] {
  const t: string[] = [];
  if (s.assistAlarm === 'off') t.push('no alarm time limit');
  else if (s.assistAlarm !== 'normal') t.push(`alarm ${s.assistAlarm} s`);
  if (s.assistAmmo !== 1) t.push(`ammo ×${s.assistAmmo}`);
  if (s.assistToughness !== 1) t.push(`damage ×${s.assistToughness}`);
  if (jobUnlockedByAssist) t.push('job unlocked early');
  return t;
}

/** max ammo with the ammo assist (Infinity stays Infinity) */
export function scaleAmmo(max: number, mult: number): number {
  return max === Infinity || mult === 1 ? max : Math.ceil(max * mult);
}

/** the nearest allowed option (settings sanitiser; also accepts numeric strings from the menu buttons) */
export function pickOption(v: any, options: number[], d: number): number {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && options.includes(n) ? n : d;
}
