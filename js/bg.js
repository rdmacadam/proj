// WebGL background: the Chladni screenshot melted live by a fragment shader.
import { VERT, FRAG } from "./shader.js";
import { coverScale } from "./cover.js";
import { createQuality } from "./quality.js";
import { createRipples } from "./ripples.js";

const MAX_DPR = 1.5;
const MAX_FRAME_S = 0.1; // clamp animation time per frame (hidden tab, stalls)
const SAMPLE = 32;

export function createBackground(canvas, image, opts = {}) {
  const grain = opts.grain ?? 1;
  const quality = createQuality();
  const ripples = createRipples(8);

  let gl = null;
  let prog = null;
  let tex = null;
  let buf = null;
  let u = {};
  let running = false;
  let rafId = 0;
  let lastNow = null;
  let elapsed = 0;
  let tilt = [0, 0];
  let tiltTarget = [0, 0];
  let lastPointer = null;
  let lastRippleAt = -1;
  let wasDown = false;

  const getContext = () => {
    const attrs = { antialias: false, alpha: false, powerPreference: "high-performance" };
    return canvas.getContext("webgl2", attrs) || canvas.getContext("webgl", attrs);
  };

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.error(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  }

  // (Re)build every GL resource; also used after a context restore.
  function build() {
    gl = gl || getContext();
    if (!gl) return false;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error(gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);

    buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    tex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    // CLAMP + LINEAR with no mipmaps keeps NPOT textures valid on WebGL1
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    u = {};
    for (const n of ["uTex", "uRes", "uCover", "uTilt", "uTime", "uGrain", "uRipples"]) {
      u[n] = gl.getUniformLocation(prog, n);
    }
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uGrain, grain);
    resize();
    return true;
  }

  function resize() {
    if (!gl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr * quality.scale));
    const h = Math.max(1, Math.round(canvas.clientHeight * dpr * quality.scale));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(u.uRes, w, h);
    const [sx, sy] = coverScale(w, h, image.naturalWidth, image.naturalHeight);
    gl.uniform2f(u.uCover, sx, sy);
  }

  function draw() {
    tilt = [tilt[0] + (tiltTarget[0] - tilt[0]) * 0.08, tilt[1] + (tiltTarget[1] - tilt[1]) * 0.08];
    gl.uniform1f(u.uTime, elapsed);
    gl.uniform2f(u.uTilt, tilt[0], tilt[1]);
    gl.uniform4fv(u.uRipples, ripples.data(elapsed));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function frame(now) {
    rafId = requestAnimationFrame(frame);
    const rawMs = lastNow === null ? 0 : now - lastNow;
    lastNow = now;
    elapsed += Math.min(rawMs / 1000, MAX_FRAME_S);
    const before = quality.scale;
    if (rawMs > 0) quality.update(rawMs);
    if (quality.scale !== before) resize();
    draw();
  }

  const onLost = e => {
    e.preventDefault();
    pause();
    opts.onContextLost?.();
  };
  const onRestored = () => {
    gl = getContext();
    if (build()) {
      opts.onContextRestored?.();
      resume();
    }
  };

  function pause() {
    running = false;
    cancelAnimationFrame(rafId);
  }

  function resume() {
    if (running || !gl || gl.isContextLost()) return;
    running = true;
    lastNow = null;
    rafId = requestAnimationFrame(frame);
  }

  if (!build()) return null;

  canvas.addEventListener("webglcontextlost", onLost);
  canvas.addEventListener("webglcontextrestored", onRestored);
  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resume();

  return {
    // x, y normalized 0..1 (y up). Spawns a ripple on press and as the pointer travels.
    setPointer(x, y, down = false) {
      const moved = lastPointer ? Math.hypot(x - lastPointer[0], y - lastPointer[1]) : Infinity;
      const pressed = down && !wasDown;
      if (pressed || (moved > 0.02 && elapsed - lastRippleAt > 0.06)) {
        ripples.add(x, y, elapsed);
        lastPointer = [x, y];
        lastRippleAt = elapsed;
      }
      wasDown = down;
    },
    // tx, ty in -1..1
    setTilt(tx, ty) {
      tiltTarget = [tx, ty];
    },
    pause,
    resume,
    resize,
    // Renders one frame and reads back a centre block (RGBA bytes).
    sample() {
      draw();
      const w = Math.min(SAMPLE, canvas.width);
      const h = Math.min(SAMPLE, canvas.height);
      const out = new Uint8Array(w * h * 4);
      gl.readPixels(Math.floor((canvas.width - w) / 2), Math.floor((canvas.height - h) / 2), w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
      return out;
    },
    destroy() {
      pause();
      observer.disconnect();
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      if (gl && !gl.isContextLost()) {
        gl.deleteTexture(tex);
        gl.deleteBuffer(buf);
        gl.deleteProgram(prog);
      }
    },
  };
}
