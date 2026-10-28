// Ring buffer of touch/pointer ripples, flattened for a vec4[] shader uniform.
export const RIPPLE_LIFETIME = 2.5; // seconds

export function createRipples(max = 8) {
  const slots = new Array(max).fill(null);
  let head = 0;

  return {
    add(x, y, t) {
      slots[head] = { x, y, t0: t };
      head = (head + 1) % max;
    },
    // [x, y, age, strength] per slot; expired or empty slots are all zeros
    data(t) {
      const out = new Float32Array(max * 4);
      slots.forEach((s, i) => {
        if (!s) return;
        const age = Math.max(0, t - s.t0);
        if (age >= RIPPLE_LIFETIME) return;
        const life = 1 - age / RIPPLE_LIFETIME;
        out.set([s.x, s.y, age, life * life], i * 4);
      });
      return out;
    },
  };
}
