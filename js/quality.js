// Adaptive render scale: drops when frames run slow, recovers after sustained speed.
const MAX_DT = 250; // longer gaps are a hidden tab or a stall, not load
const COOLDOWN = 1000;
const RECOVER_AFTER = 3000;
const round = v => Math.round(v * 100) / 100;

export function createQuality({ min = 0.5, max = 1, targetMs = 20, step = 0.1 } = {}) {
  let scale = max;
  let ema = targetMs;
  let cooldown = 0;
  let fastTime = 0;

  return {
    get scale() {
      return scale;
    },
    update(dtMs) {
      if (!(dtMs > 0) || dtMs > MAX_DT) return scale;
      ema += (dtMs - ema) * 0.1;
      cooldown = Math.max(0, cooldown - dtMs);
      fastTime = ema < targetMs * 0.8 ? fastTime + dtMs : 0;

      if (cooldown === 0 && ema > targetMs * 1.3 && scale > min) {
        scale = round(Math.max(min, scale - step));
        cooldown = COOLDOWN;
        fastTime = 0;
      } else if (cooldown === 0 && fastTime >= RECOVER_AFTER && scale < max) {
        scale = round(Math.min(max, scale + step));
        cooldown = COOLDOWN;
        fastTime = 0;
      }
      return scale;
    },
  };
}
