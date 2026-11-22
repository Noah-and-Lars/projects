// Pacejka-lite tyre curves and suspension spring (pure functions).
const B = 9, C = 1.6, E = 0.4;

/** Normalised magic-formula curve: input slip, output 0..~1 force fraction. */
export function magic(x: number, b = B, c = C, e = E): number {
  const bx = b * x;
  return Math.sin(c * Math.atan(bx - e * (bx - Math.atan(bx))));
}

/** Longitudinal force fraction from slip ratio. */
export const longCurve = (slip: number) => magic(slip, 10, 1.65, 0.3);
/** Lateral force fraction from slip angle (radians). */
export const latCurve = (alpha: number) => magic(alpha, 8, 1.45, 0.2);

/** Spring-damper suspension force; never pulls the wheel down. */
export function suspensionForce(compression: number, compressionVel: number, k: number, c: number): number {
  return Math.max(0, k * compression + c * compressionVel);
}
