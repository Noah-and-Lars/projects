// Player-adjustable settings. These will move into a settings menu later.
export const settings = {
  // Mouse sensitivity. 1.0 turns 0.022° per mouse count, so a value of 2
  // means about 26 cm of mouse travel for a full turn at 800 DPI.
  sensitivity: 2.0,
  // Horizontal field of view in degrees, measured on a 16:9 screen.
  // Wider screens see more at the sides; taller ones see the same width.
  fov: 90,
  // Hold the gun with the soldier's own arms (sleeves and gloves) in first
  // person, as the body you see looking down; false uses the separate
  // gloves model (it's also used if the soldier model can't be loaded).
  soldierArms: true,
};
