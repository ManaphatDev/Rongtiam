// Shared by the simulation and everything that replays it, without importing Rapier itself.
export const TRAY = { w: 22, d: 13, h: 9 };
export const STEP = 1 / 120;
export const MAX_STEPS = 960;
/** Keyframe every 4 steps = 30 per second. */
export const EVERY = 4;
export const FPS = 1 / (STEP * EVERY);
/** Keyframes are integers: position in thousandths, rotation in ten-thousandths. */
export const POS_Q = 1000, ROT_Q = 10000;
