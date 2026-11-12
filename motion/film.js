// The Home film. Loose pieces of a company's work drift in the dark; the star lights; the pieces
// fall into orbit around it. Scrolling is the playhead: every position is worked out from how far
// the section has been scrolled, so scrolling back up rewinds it exactly.
//
// index.html mounts this only in a laptop-sized window with motion allowed. The words are real
// text in index.html; this file moves and fades them, draws the picture, and undoes everything it
// touched in destroy().
//
// How it is drawn: the scene goes into an off-screen picture with more range than a screen has,
// then one last pass adds what a camera adds (soft focus away from the subject, glow around bright
// things, a darker edge, a little grain) and maps it to the screen.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
const lerp = (a, b, t) => a + (b - a) * t;
const TAU = Math.PI * 2;

// The same "random" layout on every visit, so the film is one composed picture, not a dice roll.
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- The timeline, as shares of the scroll (0 = top of the page, 1 = the section is leaving) ----
const T = {
  rest: [.11, .19],          // the paragraph, buttons and availability line leave
  notes: [.15, .225],        // the five sentences leave
  ignite: [.25, .42],        // the star lights
  h1Out: [.43, .485],        // the headline leaves
  gather: [.46, .62, .16],   // tiles set off between the first two, each taking the third
  cap3: [.5, .55, .765, .81],
  cap4: [.84, .89],
  scenes: [.24, .46, .82],   // where the rail ticks over
};

// Camera stops. Between them it follows a smooth curve.
const CAM = [
  { p: 0, v: [0, .5, 15.5] },
  { p: .25, v: [0, .55, 13.2] },
  { p: .45, v: [0, 1.2, 10.4] },
  { p: .62, v: [0, 4.4, 13.8] },
  { p: .8, v: [0, 7.4, 15.4] },
  { p: 1, v: [0, 8.8, 16.6] },
];

function camAt(p, out) {
  const n = CAM.length;
  let i = 0;
  while (i < n - 2 && p > CAM[i + 1].p) i++;
  const a = CAM[i], b = CAM[i + 1];
  const h = b.p - a.p, t = clamp((p - a.p) / h);
  const t2 = t * t, t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
  for (let k = 0; k < 3; k++) {
    const prev = CAM[Math.max(0, i - 1)], next = CAM[Math.min(n - 1, i + 2)];
    const ma = (b.v[k] - prev.v[k]) / (b.p - prev.p);
    const mb = (next.v[k] - a.v[k]) / (next.p - a.p);
    out[k] = h00 * a.v[k] + h10 * h * ma + h01 * b.v[k] + h11 * h * mb;
  }
  return out;
}

// The five tiles that carry a sentence, placed by hand around where the star will light, on the
// right of the frame so the headline has the left.
const NOTE_TILES = [
  [-.47, 2.25, 4.5],
  [1.9, 1.95, 4.2],
  [1.5, -.1, 4.8],
  [1.25, -1.85, 4.4],
  [-1.1, -1.5, 3.4],
];
// Which drawing each carries: sheet, inbox, chart, document, board.
const NOTE_KINDS = [0, 1, 4, 2, 5];
const KINDS = 6;

const RINGS = [
  { r: 2.5, n: 14, w: .10, k: 1.5, tilt: [.045, 0, 0] },
  { r: 3.8, n: 24, w: .07, k: 1.05, tilt: [-.02, 0, .04] },
  { r: 5.1, n: 34, w: .05, k: .8, tilt: [.02, 0, -.04] },
];

// ---- Drawings ----------------------------------------------------------------------------------

// What is on each tile, drawn in light on black: only the lines glow, the glass stays dark.
function inkTexture(THREE, kind, maxAniso) {
  const W = 1024, H = 682, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);
  const hi = 'rgb(226,222,255)', mid = 'rgb(150,140,224)', low = 'rgb(74,68,128)', dim = 'rgb(38,35,72)';
  const bar = (x, y, w, h, style, r = h / 2) => { g.fillStyle = style; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  const line = (x0, y0, x1, y1, style, lw = 3) => { g.strokeStyle = style; g.lineWidth = lw; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  const M = 64;
  // A title row every tile shares: three small dots and a name.
  [0, 1, 2].forEach((i) => { g.fillStyle = i ? low : mid; g.beginPath(); g.arc(M + 12 + i * 34, 74, 9, 0, TAU); g.fill(); });
  bar(M + 130, 64, 230, 20, low);
  line(M, 118, W - M, 118, dim, 3);
  if (kind === 0) {            // spreadsheet
    bar(M, 150, W - 2 * M, 56, dim, 10);
    for (let k = 0; k < 4; k++) bar(M + 26 + k * (W - 2 * M) / 4, 168, 110 + (k % 2) * 40, 20, mid);
    for (let r = 0; r < 5; r++) line(M, 262 + r * 76, W - M, 262 + r * 76, dim, 3);
    for (let k = 1; k < 4; k++) line(M + k * (W - 2 * M) / 4, 206, M + k * (W - 2 * M) / 4, H - 64, dim, 3);
    [[0, 0, hi], [1, 0, low], [2, 0, mid], [3, 0, low], [0, 1, low], [1, 1, mid], [3, 1, hi], [0, 2, mid], [2, 2, low], [1, 3, low], [2, 3, hi], [3, 3, mid], [0, 4, low], [2, 4, low]]
      .forEach(([cx, cy, s]) => bar(M + 26 + cx * (W - 2 * M) / 4, 224 + cy * 76, 96 + ((cx * 7 + cy * 13) % 5) * 16, 18, s));
  } else if (kind === 1) {     // inbox
    for (let r = 0; r < 6; r++) {
      const y = 150 + r * 82, on = r === 1;
      if (on) bar(M, y - 8, W - 2 * M, 72, dim, 14);
      g.fillStyle = on ? hi : low; g.beginPath(); g.arc(M + 34, y + 28, 15, 0, TAU); g.fill();
      bar(M + 76, y + 8, [300, 360, 250, 330, 280, 310][r], 18, on ? hi : mid);
      bar(M + 76, y + 40, [520, 470, 560, 430, 500, 450][r], 12, low);
      bar(W - M - 96, y + 10, 76, 14, low);
    }
  } else if (kind === 2) {     // document
    bar(M, 156, 420, 34, hi, 10);
    [760, 820, 700, 790, 520].forEach((w, i) => bar(M, 232 + i * 46, w, 16, i === 4 ? low : mid));
    [800, 740, 610].forEach((w, i) => bar(M, 492 + i * 46, w, 16, i === 2 ? low : mid));
  } else if (kind === 3) {     // chat
    bar(M, 150, 520, 92, dim, 30); bar(M + 34, 178, 330, 16, mid); bar(M + 34, 208, 230, 12, low);
    bar(W - M - 460, 268, 460, 92, low, 30); bar(W - M - 426, 296, 300, 16, hi); bar(W - M - 426, 326, 200, 12, mid);
    bar(M, 386, 600, 92, dim, 30); bar(M + 34, 414, 420, 16, mid); bar(M + 34, 444, 280, 12, low);
    bar(W - M - 300, 504, 300, 76, low, 30); bar(W - M - 266, 532, 190, 16, hi);
  } else if (kind === 4) {     // chart
    line(M, H - 96, W - M, H - 96, low, 3);
    [.34, .52, .44, .68, .58, .82, .74, .96].forEach((v, i) => bar(M + 34 + i * 108, H - 96 - v * 380, 62, v * 380, i === 7 ? hi : i % 2 ? mid : low, 10));
    bar(M, 150, 260, 22, mid); bar(M, 186, 170, 14, low);
  } else {                     // board
    for (let k = 0; k < 3; k++) {
      const x = M + k * ((W - 2 * M + 28) / 3), w = (W - 2 * M - 56) / 3;
      bar(x, 150, 150, 18, mid);
      const n = [3, 2, 4][k];
      for (let r = 0; r < n; r++) { bar(x, 192 + r * 104, w, 86, dim, 16); bar(x + 22, 214 + r * 104, w * (.5 + ((k + r) % 3) * .14), 14, r === 0 && k === 1 ? hi : mid); bar(x + 22, 242 + r * 104, w * .42, 11, low); }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAniso;
  return tex;
}

function softDisc(THREE, stops) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  stops.forEach(([at, col]) => rg.addColorStop(at, col));
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// A long thin streak of light, for the cross through the star.
function streakTexture(THREE) {
  const W = 512, H = 32, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = Math.abs(x / (W - 1) - .5) * 2, v = Math.abs(y / (H - 1) - .5) * 2;
    const a = Math.pow(1 - u, 2.6) * Math.exp(-v * v * 7);
    const i = (y * W + x) * 4;
    img.data[i] = 214; img.data[i + 1] = 208; img.data[i + 2] = 255; img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ---- The camera's part: focus, glow, edge, grain -----------------------------------------------

const QUAD_VS = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
const DOWN_FS = `
  varying vec2 vUv; uniform sampler2D tMap; uniform vec2 uTexel; uniform float uClamp;
  void main() {
    vec3 c = texture2D(tMap, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(tMap, vUv + uTexel * vec2(1., -1.)).rgb
           + texture2D(tMap, vUv + uTexel * vec2(-1., 1.)).rgb + texture2D(tMap, vUv + uTexel * vec2(1., 1.)).rgb;
    c *= .25;
    if (uClamp > 0.) c = min(c, vec3(uClamp));
    gl_FragColor = vec4(c, 1.);
  }`;
const UP_FS = `
  varying vec2 vUv; uniform sampler2D tMap; uniform sampler2D tAdd; uniform vec2 uTexel;
  void main() {
    vec3 c = texture2D(tMap, vUv).rgb * 4.;
    c += (texture2D(tMap, vUv + uTexel * vec2(-1., 0.)).rgb + texture2D(tMap, vUv + uTexel * vec2(1., 0.)).rgb
        + texture2D(tMap, vUv + uTexel * vec2(0., -1.)).rgb + texture2D(tMap, vUv + uTexel * vec2(0., 1.)).rgb) * 2.;
    c += texture2D(tMap, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(tMap, vUv + uTexel * vec2(1., -1.)).rgb
       + texture2D(tMap, vUv + uTexel * vec2(-1., 1.)).rgb + texture2D(tMap, vUv + uTexel * vec2(1., 1.)).rgb;
    gl_FragColor = vec4(c / 16. + texture2D(tAdd, vUv).rgb, 1.);
  }`;
const FINAL_FS = `
  #include <packing>
  varying vec2 vUv;
  uniform sampler2D tScene; uniform sampler2D tDepth; uniform sampler2D tSoft; uniform sampler2D tSofter; uniform sampler2D tSoftest; uniform sampler2D tGlow;
  uniform float uNear; uniform float uFar; uniform float uFocus; uniform float uRange; uniform float uDof;
  uniform float uGlow; uniform float uExposure; uniform float uVignette; uniform float uGrain; uniform float uTime; uniform float uAspect;
  vec3 film(vec3 x) { return clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14), 0., 1.); }
  float hash(vec2 p) { vec3 q = fract(vec3(p.xyx) * .1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
  void main() {
    vec3 col = texture2D(tScene, vUv).rgb;
    if (uDof > 0.) {
      float d = texture2D(tDepth, vUv).x;
      float dist = -perspectiveDepthToViewZ(d, uNear, uFar);
      float coc = d > .99995 ? .25 : clamp((abs(dist - uFocus) - uRange * .3) / uRange, 0., 1.5);
      coc *= uDof;
      col = mix(col, texture2D(tSoft, vUv).rgb, smoothstep(0., .4, coc));
      col = mix(col, texture2D(tSofter, vUv).rgb, smoothstep(.4, .85, coc));
      col = mix(col, texture2D(tSoftest, vUv).rgb, smoothstep(.85, 1.4, coc));
    }
    col += texture2D(tGlow, vUv).rgb * (uGlow / 5.);
    vec2 q = (vUv - .5) * vec2(uAspect, 1.);
    col *= 1. - uVignette * smoothstep(.45, 1.15, length(q));
    col = film(col * uExposure);
    col = pow(col, vec3(1. / 2.2));
    col += (hash(gl_FragCoord.xy + fract(uTime) * 61.) - .5) * uGrain;
    gl_FragColor = vec4(col, 1.);
  }`;

function makeLens(THREE, renderer) {
  const LEVELS = 5;
  const half = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter };
  let sceneRT = null, downs = [], ups = [], W = 0, H = 0;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geo = new THREE.PlaneGeometry(2, 2);
  const mk = (fs, uniforms) => new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false });
  const down = mk(DOWN_FS, { tMap: { value: null }, uTexel: { value: new THREE.Vector2() }, uClamp: { value: 0 } });
  const up = mk(UP_FS, { tMap: { value: null }, tAdd: { value: null }, uTexel: { value: new THREE.Vector2() } });
  const fin = mk(FINAL_FS, {
    tScene: { value: null }, tDepth: { value: null }, tSoft: { value: null }, tSofter: { value: null }, tSoftest: { value: null }, tGlow: { value: null },
    uNear: { value: .1 }, uFar: { value: 120 }, uFocus: { value: 10 }, uRange: { value: 4 }, uDof: { value: 1 },
    uGlow: { value: .05 }, uExposure: { value: 1 }, uVignette: { value: .5 }, uGrain: { value: .02 }, uTime: { value: 0 }, uAspect: { value: 1.6 },
  });
  const quad = new THREE.Mesh(geo, down);
  quad.frustumCulled = false;
  const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(quad, cam); };

  function free() { if (sceneRT) { sceneRT.depthTexture.dispose(); sceneRT.dispose(); } downs.forEach((t) => t.dispose()); ups.forEach((t) => t.dispose()); downs = []; ups = []; sceneRT = null; }

  return {
    uniforms: fin.uniforms,
    setSize(w, h) {
      if (w === W && h === H) return;
      free(); W = w; H = h;
      sceneRT = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4, depthTexture: new THREE.DepthTexture(w, h) });
      for (let i = 0; i < LEVELS; i++) {
        const lw = Math.max(2, w >> (i + 1)), lh = Math.max(2, h >> (i + 1));
        downs.push(new THREE.WebGLRenderTarget(lw, lh, half));
        if (i < LEVELS - 1) ups.push(new THREE.WebGLRenderTarget(lw, lh, half));
      }
      fin.uniforms.uAspect.value = w / h;
    },
    render(scene, camera) {
      renderer.setRenderTarget(sceneRT);
      renderer.render(scene, camera);
      // A ladder of ever smaller, softer copies. The small ones are the glow and the out-of-focus picture.
      let src = sceneRT;
      for (let i = 0; i < LEVELS; i++) {
        down.uniforms.tMap.value = src.texture;
        down.uniforms.uTexel.value.set(.5 / src.width, .5 / src.height);
        down.uniforms.uClamp.value = i === 0 ? 24 : 0;
        pass(down, downs[i]);
        src = downs[i];
      }
      let acc = downs[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        up.uniforms.tMap.value = acc.texture;
        up.uniforms.tAdd.value = downs[i].texture;
        up.uniforms.uTexel.value.set(1 / acc.width, 1 / acc.height);
        pass(up, ups[i]);
        acc = ups[i];
      }
      const u = fin.uniforms;
      u.tScene.value = sceneRT.texture; u.tDepth.value = sceneRT.depthTexture;
      u.tSoft.value = downs[0].texture; u.tSofter.value = downs[1].texture; u.tSoftest.value = downs[2].texture; u.tGlow.value = ups[0].texture;
      u.uNear.value = camera.near; u.uFar.value = camera.far;
      pass(fin, null);
    },
    dispose() { free(); geo.dispose(); down.dispose(); up.dispose(); fin.dispose(); },
  };
}

// The page's background colour, as the amount of light that comes out as that colour after the
// last pass. The film's own background uses it, so the picture meets the page without a seam.
function lightFor(srgb, exposure) {
  const f = (x) => Math.pow(clamp((x * (2.51 * x + .03)) / (x * (2.43 * x + .59) + .14)), 1 / 2.2);
  return srgb.map((target) => { let lo = 0, hi = 4; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (f(m * exposure) < target) lo = m; else hi = m; } return (lo + hi) / 2; });
}

// ---- The scene ---------------------------------------------------------------------------------

function buildScene(THREE, canvas, noteCount) {
  const rand = rng(20261112);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
  const lens = makeLens(THREE, renderer);
  const EXPOSURE = 1.15;
  lens.uniforms.uExposure.value = EXPOSURE;
  const scene = new THREE.Scene();
  const BG = lightFor([0x16 / 255, 0x18 / 255, 0x26 / 255], EXPOSURE);
  scene.fog = new THREE.Fog(new THREE.Color(BG[0], BG[1], BG[2]), 12, 36);
  const camera = new THREE.PerspectiveCamera(38, 1, .5, 140);
  const junk = [];
  const keep = (...xs) => { junk.push(...xs); return xs[0]; };
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // The room the glass reflects: a few soft lights in the dark, lavender like the site.
  {
    const room = new THREE.Scene();
    room.background = new THREE.Color(.004, .004, .009);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const lamp = (r, g, b, x, y, z, sx, sy, sz) => { const m = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ color: new THREE.Color(r, g, b) })); m.position.set(x, y, z); m.scale.set(sx, sy, sz); room.add(m); return m.material; };
    const mats = [lamp(9, 8.4, 13, 6, 9, 5, 9, .4, 7), lamp(2.2, 2.2, 4.2, -11, 2, -2, .4, 7, 9), lamp(1.2, 1.0, 2.4, 3, -9, 4, 8, .4, 6), lamp(5, 4.6, 7.5, -2, 3, 12, 5, 3, .4)];
    const pm = new THREE.PMREMGenerator(renderer);
    const rt = keep(pm.fromScene(room, .03));
    scene.environment = rt.texture;
    pm.dispose(); box.dispose(); mats.forEach((m) => m.dispose());
  }

  // Background: the page's own colour, lifting a little toward the upper right like the page does.
  const sky = (() => {
    const geo = keep(new THREE.SphereGeometry(110, 32, 16));
    const mat = keep(new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uBase: { value: new THREE.Vector3(BG[0], BG[1], BG[2]) }, uLift: { value: 0 } },
      vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: `varying vec3 vDir; uniform vec3 uBase; uniform float uLift;
        void main() {
          float a = pow(max(dot(vDir, normalize(vec3(.55, .5, -.67))), 0.), 3.);
          float b = pow(max(dot(vDir, normalize(vec3(-.7, -.35, -.62))), 0.), 4.);
          vec3 c = uBase + vec3(.006, .005, .02) * a * (1. + uLift) + vec3(.002, .002, .008) * b;
          gl_FragColor = vec4(c, 1.);
        }`,
    }));
    const m = new THREE.Mesh(geo, mat);
    m.renderOrder = -2;
    scene.add(m);
    return mat;
  })();

  const starLight = new THREE.PointLight(0xd9d3ff, 0, 0, 1.25);
  scene.add(starLight);

  // Far stars.
  {
    const n = 420, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 34 + rand() * 40, th = rand() * TAU, y = (rand() - .5) * 60;
      pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(th) * r - 8;
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = keep(new THREE.PointsMaterial({ color: new THREE.Color(.5, .47, .8), size: 2.2, sizeAttenuation: false, transparent: true, opacity: .7, fog: false, depthWrite: false }));
    const pts = new THREE.Points(geo, mat);
    pts.renderOrder = -1;
    scene.add(pts);
  }

  // One tile: a thin slab of dark glass with rounded corners and a bevelled edge that catches light.
  const TW = .9, TH = .6;
  const tileGeo = keep((() => {
    const rx = .09 / TW, ry = .09 / TH, s = new THREE.Shape();
    s.moveTo(rx, 0); s.lineTo(1 - rx, 0); s.quadraticCurveTo(1, 0, 1, ry);
    s.lineTo(1, 1 - ry); s.quadraticCurveTo(1, 1, 1 - rx, 1);
    s.lineTo(rx, 1); s.quadraticCurveTo(0, 1, 0, 1 - ry);
    s.lineTo(0, ry); s.quadraticCurveTo(0, 0, rx, 0);
    const geo = new THREE.ExtrudeGeometry(s, { depth: .014, bevelEnabled: true, bevelThickness: .009, bevelSize: .011, bevelSegments: 3, curveSegments: 8 });
    geo.translate(-.5, -.5, -.007); geo.scale(TW, TH, 1);
    return geo;
  })());
  const edgeMat = keep(new THREE.MeshStandardMaterial({ color: 0x8d84e6, roughness: .22, metalness: .85, emissive: 0x5a4fc0, emissiveIntensity: .35 }));

  const total = RINGS.reduce((a, r) => a + r.n, 0);
  const used = new Array(KINDS).fill(0);
  const faceMats = [], meshes = [];
  for (let k = 0; k < KINDS; k++) {
    const ink = keep(inkTexture(THREE, k, maxAniso));
    const mat = keep(new THREE.MeshPhysicalMaterial({
      color: 0x14132b, roughness: .34, metalness: 0, clearcoat: 1, clearcoatRoughness: .2,
      emissive: 0xffffff, emissiveMap: ink, emissiveIntensity: 1, envMapIntensity: 1,
    }));
    const mesh = new THREE.InstancedMesh(tileGeo, [mat, edgeMat], total);
    mesh.frustumCulled = false;
    scene.add(mesh);
    faceMats.push(mat); meshes.push(mesh);
  }
  // The five named tiles are drawn a little brighter than the rest, so they stay easy to follow.
  const noteMeshes = [];
  for (let i = 0; i < noteCount; i++) {
    const mat = keep(faceMats[NOTE_KINDS[i % NOTE_KINDS.length]].clone());
    mat.userData.lift = 1.5;
    // Less mirror on these five: the drawing has to read at a glance.
    mat.envMap = scene.environment; mat.clearcoat = .4; mat.clearcoatRoughness = .32;
    const mesh = new THREE.InstancedMesh(tileGeo, [mat, edgeMat], 1);
    mesh.frustumCulled = false;
    scene.add(mesh);
    faceMats.push(mat); noteMeshes.push(mesh);
  }

  // Every tile gets a place in the scatter and a slot on a ring.
  const tiles = [];
  const ringQ = RINGS.map((r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r.tilt[0], r.tilt[1], r.tilt[2])));
  const placed = NOTE_TILES.slice(0, noteCount).map((v) => new THREE.Vector3(...v));
  const slots = [];
  RINGS.forEach((r, ri) => { for (let j = 0; j < r.n; j++) slots.push({ ri, a: (j / r.n) * TAU + ri * .37 }); });
  const outerStart = RINGS[0].n + RINGS[1].n;
  const noteSlots = Array.from({ length: noteCount }, (_, i) => outerStart + Math.floor((i + .5) * RINGS[2].n / Math.max(1, noteCount)));
  const free = slots.map((_, i) => i).filter((i) => !noteSlots.includes(i));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }

  for (let i = 0; i < total; i++) {
    const note = i < noteCount;
    let S;
    if (note) S = placed[i].clone();
    else {
      for (let tries = 0; tries < 400; tries++) {
        S = new THREE.Vector3(-13 + rand() * 25, (rand() - .5) * 12 + .3, -14 + rand() * 21.5);
        // Nothing crosses the camera's path or sits between the camera and the star.
        const corridor = S.z > -1.5 && Math.hypot(S.x, S.y - .4) < 2.3;
        const core = S.length() < 3;
        // Behind the headline only far, soft tiles: the words stay easy to read.
        const behindWords = S.x < -.9 && S.z > -7;
        const crowd = placed.some((t, k) => t.distanceTo(S) < (k < noteCount ? 3 : 1.5));
        // Nothing but the five named tiles comes close to the camera in the opening.
        const tooNear = S.z > 2.5;
        if (!corridor && !core && !behindWords && !crowd && !tooNear) break;
      }
      placed.push(S);
    }
    const slot = slots[note ? noteSlots[i] : free.pop()];
    const ring = RINGS[slot.ri];
    const thS = Math.atan2(S.z, S.x);
    const tilt = note ? .2 : .9;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * tilt, (rand() - .5) * tilt * 1.5 + (note ? -.12 : 0), (rand() - .5) * tilt * .6));
    const kind = note ? NOTE_KINDS[i % NOTE_KINDS.length] : Math.floor(rand() * KINDS);
    tiles.push({
      S, q, ri: slot.ri, R: ring.r, thS, rS: Math.hypot(S.x, S.z), note,
      delta: (() => { const d = ((slot.a - thS) % TAU + TAU) % TAU; return d > TAU * .75 ? d - TAU : d; })(),
      // The five named problems are the first to fall into place; the rest follow, inner ring first.
      start: note ? T.gather[0] + i * .012 : lerp(T.gather[0], T.gather[1], clamp(slot.ri / 2 * .7 + rand() * .3)),
      scale: note ? 1.9 : .7 + rand() * .55,
      f1: .17 + rand() * .14, f2: .13 + rand() * .12, ph1: rand() * TAU, ph2: rand() * TAU,
      dist: S.length(), arrive: note ? .15 + i * .09 : .1 + rand() * .7,
      mesh: note ? noteMeshes[i] : meshes[kind], slot: note ? 0 : used[kind]++, pos: new THREE.Vector3(),
    });
  }
  meshes.forEach((m, k) => { m.count = used[k]; });

  // Dust: thousands of motes adrift, which the star gathers into the three orbits. Their paths
  // are worked out on the graphics card from the same scroll position as everything else.
  const dust = (() => {
    const n = 2400;
    const scatter = new Float32Array(n * 3), ring = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      scatter[i * 3] = (rand() - .5) * 30; scatter[i * 3 + 1] = (rand() - .5) * 15; scatter[i * 3 + 2] = -16 + rand() * 27;
      const ri = rand() < .22 ? 0 : rand() < .45 ? 1 : 2;
      const g = (rand() + rand() + rand() - 1.5) * .22;
      const wide = rand() < .14;
      ring[i * 3] = wide ? 1.6 + rand() * 4.6 : RINGS[ri].r + g;
      ring[i * 3 + 1] = rand() * TAU;
      ring[i * 3 + 2] = (rand() - .5) * (wide ? .12 : .05);
      seed[i * 3] = rand(); seed[i * 3 + 1] = rand(); seed[i * 3 + 2] = rand();
    }
    const geo = keep(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(scatter, 3));
    geo.setAttribute('aRing', new THREE.BufferAttribute(ring, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));
    const mat = keep(new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uGather: { value: 0 }, uIgnite: { value: 0 }, uSettle: { value: 0 }, uYaw: { value: 0 }, uPx: { value: 600 } },
      vertexShader: `
        attribute vec3 aRing; attribute vec3 aSeed;
        uniform float uTime, uGather, uIgnite, uSettle, uYaw, uPx;
        varying float vA;
        void main() {
          float e = smoothstep(aSeed.x * .55, aSeed.x * .55 + .45, uGather);
          e = e * e * (3. - 2. * e);
          vec3 drift = vec3(sin(uTime * (.07 + aSeed.y * .09) + aSeed.z * 6.28), sin(uTime * (.06 + aSeed.x * .08) + aSeed.y * 6.28), cos(uTime * (.05 + aSeed.z * .07) + aSeed.x * 6.28)) * .5;
          vec3 loose = position + drift;
          float speed = .5 / pow(aRing.x, 1.5);
          float a = aRing.y + uTime * speed * e + uSettle * .9 / aRing.x + uYaw * e;
          vec3 orbit = vec3(cos(a) * aRing.x, aRing.z, sin(a) * aRing.x);
          vec3 p = mix(loose, orbit, e);
          vec4 mv = modelViewMatrix * vec4(p, 1.);
          gl_Position = projectionMatrix * mv;
          float d = -mv.z;
          gl_PointSize = (.016 + aSeed.y * .03) * uPx / d;
          float lit = uIgnite * (.1 + 1.5 / (1. + dot(p, p) * .3));
          vA = (.045 + lit) * (.4 + aSeed.z * .6) * smoothstep(.6, 2.5, d) * (1. - smoothstep(30., 44., d));
        }`,
      fragmentShader: `varying float vA; void main() { vec2 q = gl_PointCoord - .5; float r = dot(q, q); float a = exp(-r * 18.) * vA; gl_FragColor = vec4(vec3(.66, .62, 1.) * a * 1.6, a); }`,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return mat;
  })();

  // The orbits, as hair-thin bands of light lying in each ring's plane.
  const ringMats = RINGS.map(() => keep(new THREE.MeshBasicMaterial({ color: new THREE.Color(.55, .5, 1.1), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, fog: false })));
  RINGS.forEach((r, ri) => {
    const geo = keep(new THREE.RingGeometry(r.r - .006, r.r + .006, 220, 1));
    geo.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(geo, ringMats[ri]);
    m.quaternion.copy(ringQ[ri]);
    scene.add(m);
  });

  // The star: the four-point mark from the site's header, cut like a gem so each arm has a light
  // face and a dark one. It gives off more light than a screen can show; the glow comes from that.
  const starGeo = keep((() => {
    const out = [[0, 1], [.19, .19], [1, 0], [.19, -.19], [0, -1], [-.19, -.19], [-1, 0], [-.19, .19]];
    const pos = [], col = [];
    const tri = (a, b, c, s) => { pos.push(...a, ...b, ...c); for (let k = 0; k < 3; k++) col.push(s, s, s); };
    for (let i = 0; i < 8; i++) {
      const a = [out[i][0], out[i][1], 0], b = [out[(i + 1) % 8][0], out[(i + 1) % 8][1], 0];
      tri(a, b, [0, 0, .24], i % 2 ? .5 : 1);
      tri(b, a, [0, 0, -.24], .3);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return geo;
  })());
  const starMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, depthTest: false, side: THREE.DoubleSide }));
  const star = new THREE.Mesh(starGeo, starMat);
  star.renderOrder = 4;
  const glowMat = keep(new THREE.SpriteMaterial({ map: keep(softDisc(THREE, [[0, 'rgba(206,198,255,.9)'], [.2, 'rgba(150,138,236,.34)'], [.5, 'rgba(110,98,200,.08)'], [1, 'rgba(110,98,200,0)']])), blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false }));
  const glow = new THREE.Sprite(glowMat);
  glow.renderOrder = 2;
  const streakMap = keep(streakTexture(THREE));
  const streakGeo = keep(new THREE.PlaneGeometry(1, 1));
  const streakMat = keep(new THREE.MeshBasicMaterial({ map: streakMap, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, side: THREE.DoubleSide }));
  const streakH = new THREE.Mesh(streakGeo, streakMat), streakV = new THREE.Mesh(streakGeo, streakMat);
  streakH.renderOrder = streakV.renderOrder = 3;
  scene.add(glow, streakH, streakV, star);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QF = new THREE.Quaternion(), QR = new THREE.Quaternion();
  const YPI = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI);
  const ID = new THREE.Quaternion(), SC = new THREE.Vector3(), UP = new THREE.Vector3(), ZERO = new THREE.Vector3(), LM = new THREE.Matrix4();
  const RIGHT = new THREE.Vector3(), CUP = new THREE.Vector3(), AT = new THREE.Vector3();
  const cam = [0, 0, 0], proj = new THREE.Vector3();
  let W = 1, H = 1, PXW = 1, PXH = 1;

  function resize(w, h, ratio) {
    W = w; H = h;
    PXW = Math.max(2, Math.round(w * ratio)); PXH = Math.max(2, Math.round(h * ratio));
    renderer.setPixelRatio(1);
    renderer.setSize(PXW, PXH, false);
    lens.setSize(PXW, PXH);
    camera.aspect = w / h;
    dust.uniforms.uPx.value = PXH / (2 * Math.tan(camera.fov * Math.PI / 360));
  }

  // s: { p, time, intro (0..1, the opening), px, py (pointer, -1..1), yaw (drag), dof (0..1) }
  // and, for the smaller views on the other pages, view: { pos, at, off, range, rings }: where the
  // camera stands, what it looks at, and how much of each ring has arrived.
  function update(s) {
    const p = s.p, time = s.time, v = s.view;
    const ig = smooth(T.ignite[0], T.ignite[1], p);
    const gather = clamp((p - T.gather[0]) / (T.gather[1] + T.gather[2] - T.gather[0]));
    const settle = smooth(T.gather[1], .82, p);
    const wide = smooth(.44, .62, p);

    if (v) { camera.position.set(v.pos[0], v.pos[1], v.pos[2]); AT.set(v.at[0], v.at[1], v.at[2]); }
    else { camAt(p, cam); camera.position.set(cam[0], cam[1], cam[2]); AT.set(0, 0, 0); }
    camera.lookAt(AT);
    // The pointer leans the view a little, like tilting your head.
    camera.updateMatrix();
    RIGHT.setFromMatrixColumn(camera.matrix, 0); CUP.setFromMatrixColumn(camera.matrix, 1);
    camera.position.addScaledVector(RIGHT, s.px * .5).addScaledVector(CUP, s.py * -.32);
    camera.lookAt(AT);
    // In the opening the star sits well right of centre, leaving the left for the headline;
    // once the headline has gone the system moves in toward the middle.
    if (v) camera.setViewOffset(W, H, -W * v.off[0], H * v.off[1], W, H);
    else camera.setViewOffset(W, H, -W * lerp(.24, .15, wide), H * lerp(.01, .03, wide), W, H);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    starLight.intensity = ig * 9;
    scene.environmentIntensity = lerp(.32, .55, ig);
    // The five named cards are brightest in the opening. As the camera moves past them toward the
    // star they fall out of focus, so they dim first: a bright card out of focus turns to a white blur.
    const lift = lerp(lerp(1.5, .5, smooth(.2, .36, p)), 1, smooth(.46, .6, p));
    for (const m of faceMats) {
      m.emissiveIntensity = lerp(1, 1.2, ig) * (m.userData.lift ? lift : 1);
      if (m.userData.lift) m.envMapIntensity = scene.environmentIntensity * .3;
    }
    edgeMat.emissiveIntensity = lerp(.3, .55, ig);
    ringMats.forEach((m, i) => { m.opacity = smooth(.6, .84, p) * .5 * (v && v.rings ? v.rings[i] : 1); });
    sky.uniforms.uLift.value = ig * .6;
    dust.uniforms.uTime.value = time; dust.uniforms.uGather.value = gather; dust.uniforms.uIgnite.value = ig;
    dust.uniforms.uSettle.value = settle; dust.uniforms.uYaw.value = s.yaw;

    const breath = 1 + Math.sin(time * 1.1) * .02;
    star.quaternion.copy(camera.quaternion);
    star.rotateY(Math.sin(time * .5) * .22 + s.px * -.25);
    star.rotateZ((1 - ig) * -.7);
    star.scale.setScalar(ig * .66 * breath);
    star.visible = ig > .001;
    starMat.color.setRGB(.86, .83, 1).multiplyScalar(lerp(1.5, 7.5, ig));
    glow.scale.setScalar(lerp(1, 4.4, ig) * breath);
    glowMat.opacity = ig * .7;
    streakH.quaternion.copy(camera.quaternion); streakV.quaternion.copy(camera.quaternion);
    streakV.rotateZ(Math.PI / 2);
    streakH.scale.set(lerp(1, 7.5, ig), .11, 1); streakV.scale.set(lerp(1, 5.2, ig), .09, 1);
    streakMat.opacity = ig * .5;

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const e = easeIO(clamp((p - t.start) / T.gather[2]));
      const loose = 1 - e;
      // The opening: each tile drifts up into place and grows to size, the named five first.
      const born = easeOut((s.intro - t.arrive * .5) / .5);
      const sx = t.S.x + Math.sin(time * t.f1 + t.ph1) * .16 * loose;
      const sy = t.S.y + Math.sin(time * t.f2 + t.ph2) * .13 * loose - (1 - born) * .7;
      const ring = RINGS[t.ri];
      // A tile falls in toward the star first and sweeps round late, so nothing swings past the lens.
      const r = lerp(t.rS, t.R, 1 - Math.pow(1 - e, 1.9));
      const a = t.thS + t.delta * Math.pow(e, 1.9) + (ring.w * time + ring.k * settle + s.yaw) * e;
      t.pos.set(Math.cos(a) * r, lerp(sy, 0, e), Math.sin(a) * r);
      t.pos.x += sx - t.S.x;
      QR.copy(ID).slerp(ringQ[t.ri], e);
      t.pos.applyQuaternion(QR);

      // Each tile turns to face the star as its light arrives, nearest first.
      const face = Math.max(e, smooth(.26 + t.dist * .008, .38 + t.dist * .008, p));
      UP.set(0, 1, 0).applyQuaternion(QR);
      LM.lookAt(ZERO, t.pos, UP);
      QF.setFromRotationMatrix(LM);
      // A tile is drawn on both sides, so it turns whichever way is shorter. Chosen once, from
      // where it starts: no tile ever swings through edge-on in front of the camera.
      if (t.flip === undefined) {
        LM.lookAt(ZERO, t.S, UP.set(0, 1, 0));
        Q.setFromRotationMatrix(LM);
        t.flip = Math.abs(t.q.dot(Q)) < Math.abs(t.q.dot(Q.multiply(YPI)));
      }
      if (t.flip) QF.multiply(YPI);
      Q.copy(t.q).slerp(QF, face);
      SC.setScalar(lerp(t.scale, .6, e) * lerp(.55, 1, born) * (v && v.rings ? v.rings[t.ri] : 1));
      M.compose(t.pos, Q, SC);
      t.mesh.setMatrixAt(t.slot, M);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    for (const m of noteMeshes) m.instanceMatrix.needsUpdate = true;

    // Focus: on the five named tiles in the opening, on the star and its system after that. The
    // opening starts soft and pulls sharp.
    const camDist = camera.position.length();
    const u = lens.uniforms;
    u.uFocus.value = (v ? camera.position.distanceTo(AT) : lerp(camDist - 4.3, camDist, smooth(.2, .45, p))) + (1 - s.intro) * 9;
    u.uRange.value = v ? v.range : lerp(2.6, 7, smooth(.38, .7, p));
    u.uDof.value = s.dof;
    u.uGlow.value = lerp(.12, .24, ig);
    u.uVignette.value = .62;
    u.uGrain.value = .022;
    u.uTime.value = time;
    lens.render(scene, camera);
  }

  // Where a sentence tile is on screen, in CSS pixels: [x, y under the tile, how visible].
  function noteAt(i, out) {
    const t = tiles[i];
    proj.copy(t.pos).project(camera);
    const d = camera.position.distanceTo(t.pos);
    const pxPerUnit = (H / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) / d;
    out[0] = (proj.x * .5 + .5) * W;
    out[1] = (-proj.y * .5 + .5) * H + (TH * t.scale / 2) * pxPerUnit + 16;
    out[2] = proj.z < 1 && Math.abs(proj.x) < .97 && Math.abs(proj.y) < .9 ? 1 : 0;
    return out;
  }

  function dispose() {
    for (const j of junk) j.dispose();
    for (const m of meshes) m.dispose();
    for (const m of noteMeshes) m.dispose();
    lens.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  }

  return { resize, update, noteAt, dispose, renderer, scene, camera };
}

// ---- Sound: a low, slow chord made in the browser, off until the visitor asks for it ------------

function makeSound() {
  let ctx = null, master = null, filter = null, air = null, top = null, on = false;
  const voice = (type, freq, gain, to) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = freq; g.gain.value = gain; o.connect(g); g.connect(to); o.start(); return g; };
  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0;
    filter = ctx.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 320; filter.Q.value = .4;
    filter.connect(master); master.connect(ctx.destination);
    voice('sine', 110, .5, filter); voice('sine', 164.81, .28, filter); voice('triangle', 220.6, .1, filter);
    air = ctx.createGain(); air.gain.value = 0; air.connect(filter);
    voice('sine', 440, .16, air); voice('sine', 554.37, .12, air);
    top = ctx.createGain(); top.gain.value = 0; top.connect(filter);
    voice('sine', 659.25, .1, top); voice('sine', 880.6, .05, top);
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .07; lg.gain.value = .012; lfo.connect(lg); lg.connect(master.gain); lfo.start();
  }
  return {
    get on() { return on; },
    toggle() {
      on = !on;
      if (on && !ctx) build();
      if (ctx && on) ctx.resume();
      return on;
    },
    // Everything follows the scroll, so it rewinds like the picture does.
    update(p, active) {
      if (!ctx) return;
      const t = ctx.currentTime, ig = smooth(T.ignite[0], T.ignite[1], p), settle = smooth(T.gather[1], .9, p);
      master.gain.setTargetAtTime(on && active ? .07 : 0, t, .25);
      filter.frequency.setTargetAtTime(320 + ig * 900 + settle * 1500, t, .2);
      air.gain.setTargetAtTime(ig, t, .2);
      top.gain.setTargetAtTime(settle, t, .3);
    },
    stop() { if (ctx) { ctx.close(); ctx = null; } on = false; },
  };
}

// ---- The page side: scroll, words, pointer, quality ---------------------------------------------

// The 3D library is fetched in the browser's idle time, after the page itself is up, and the scene
// is fully prepared before its first frame is shown, so the picture never stutters in.
function prepare(three, canvas, noteCount, fit, alive, done) {
  const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 2500 }) : (fn) => setTimeout(fn, 400);
  // Two frames first: the words are on screen before any of the 3D work starts.
  requestAnimationFrame(() => requestAnimationFrame(() => idle(() => {
    if (!alive()) return;
    import(three).then((THREE) => {
      if (!alive()) return;
      const s = buildScene(THREE, canvas, noteCount);
      fit(s);
      const ready = () => { if (!alive()) { s.dispose(); return; } done(s); };
      if (s.renderer.extensions.has('KHR_parallel_shader_compile')) s.renderer.compileAsync(s.scene, s.camera).then(ready, ready);
      else { s.renderer.compile(s.scene, s.camera); ready(); }
    }).catch(() => { /* The words stay; nothing else depends on the 3D. */ });
  })));
}

// How many pixels to draw, best first. A machine that cannot hold one moves down the list.
const BUDGETS = [8.3e6, 5.2e6, 3.4e6, 2.2e6, 1.4e6];

export function mount({ root, three, onActive }) {
  const q = (s) => root.querySelector(s), qa = (s) => Array.from(root.querySelectorAll(s));
  const pin = q('[data-film-pin]'), stage = q('[data-film-stage]');
  // The film brings its own canvas each time it starts, so pausing and resuming always gets a
  // fresh one; the page only provides the empty box it sits in.
  const canvas = document.createElement('canvas');
  stage.appendChild(canvas);
  const rest = qa('[data-film-rest]'), h1 = q('[data-film-h1]'), problem = qa('[data-film-problem]'), answer = q('[data-film-answer]');
  const caps = qa('[data-film-cap]'), notes = qa('[data-film-note]'), ticks = qa('[data-film-tick]');
  const cue = q('[data-film-cue]'), ctas = qa('[data-film-cta]'), soundBtn = q('[data-film-sound]');
  const touched = [...rest, h1, ...problem, answer, ...caps, ...notes, cue, ...ctas, canvas].filter(Boolean);

  // active starts unknown, so the page is always told once whether the film is on screen.
  let gone = false, raf = 0, last = 0, p = -1, near = false, active = null;
  let scene = null, loading = false, live = false, frozen = false, liveAt = 0;
  let tier = window.__nsFilmTier === undefined ? 1 : window.__nsFilmTier, dof = 1, slow = 0, frames = 0, good = 0, lockUp = false;
  let px = 0, py = 0, tx = 0, ty = 0, yaw = 0, yawV = 0, drag = null;
  const out = [0, 0, 0];
  let pinW = 0;
  const t0 = performance.now();
  const sound = makeSound();

  const set = (el, k, v) => { if (el && el['__' + k] !== v) { el['__' + k] = v; el.style[k] = v; } };
  const setActive = (on) => { if (on !== active) { active = on; if (onActive) onActive(on); } };

  function ratioFor(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return Math.min(dpr, Math.sqrt(BUDGETS[tier] / (w * h)));
  }
  function size() {
    if (!scene) return;
    const w = pin.clientWidth, h = pin.clientHeight;
    if (w && h) scene.resize(w, h, ratioFor(w, h));
    notes.forEach((el) => { el.__half = el.offsetWidth / 2; });
    pinW = w;
  }

  function load() {
    if (loading || scene || gone) return;
    loading = true;
    prepare(three, canvas, notes.length, (s) => { const w = pin.clientWidth, h = pin.clientHeight; s.resize(w, h, ratioFor(w, h)); }, () => !gone, (s) => { scene = s; size(); });
  }

  function words(pp) {
    const restO = 1 - smooth(T.rest[0], T.rest[1], pp);
    rest.forEach((el) => { set(el, 'opacity', restO.toFixed(3)); set(el, 'visibility', restO < .01 ? 'hidden' : 'visible'); });
    const ig = smooth(T.ignite[0], T.ignite[1], pp);
    problem.forEach((el) => set(el, 'opacity', lerp(1, .34, ig).toFixed(3)));
    if (answer) set(answer, 'color', 'color-mix(in srgb, var(--color-text) ' + Math.round(lerp(52, 100, ig)) + '%, transparent)');
    if (h1) set(h1, 'opacity', (1 - smooth(T.h1Out[0], T.h1Out[1], pp)).toFixed(3));
    const o3 = Math.min(smooth(T.cap3[0], T.cap3[1], pp), 1 - smooth(T.cap3[2], T.cap3[3], pp));
    const o4 = smooth(T.cap4[0], T.cap4[1], pp);
    [o3, o4].forEach((o, i) => {
      const el = caps[i];
      if (!el) return;
      set(el, 'opacity', o.toFixed(3));
      set(el, 'transform', 'translate3d(0,' + ((1 - o) * 22).toFixed(1) + 'px,0)');
    });
    ctas.forEach((el) => set(el, 'visibility', o4 > .05 ? 'visible' : 'hidden'));
    if (cue) set(cue, 'opacity', (1 - smooth(.005, .04, pp)).toFixed(3));
    const sc = pp < T.scenes[0] ? 0 : pp < T.scenes[1] ? 1 : pp < T.scenes[2] ? 2 : 3;
    ticks.forEach((el, i) => { const v = i === sc ? 'true' : 'false'; if (el.__on !== v) { el.__on = v; el.setAttribute('data-on', v); } });
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const real = ts - (last || ts);
    const dt = Math.min(64, real);
    last = ts;
    const r = root.getBoundingClientRect();
    const vh = window.innerHeight;
    const span = r.height - vh;
    const target = span > 0 ? clamp(-r.top / span) : 0;
    if (p < 0 || window.__nsFilmSnap) p = target;
    else {
      // Real elapsed time here, so a slow machine still keeps up with the scroll.
      p += (target - p) * (1 - Math.exp(-Math.min(real, 600) / 105));
      if (Math.abs(target - p) < .0003) p = target;
    }
    setActive(r.top < vh * .55 && r.bottom > vh * .45);
    words(p);
    sound.update(p, active);
    if (!scene || frozen) return;

    const clock = window.__nsFilmClock === undefined ? (ts - t0) / 1000 : window.__nsFilmClock;
    if (!live) { live = true; liveAt = p > .06 ? -10 : clock; root.setAttribute('data-film-live', ''); }
    const intro = window.__nsFilmSnap ? 1 : clamp((clock - liveAt) / 1.9);

    // Pointer: an eased lean, and at the end a drag that turns the system and coasts to a stop.
    const k = 1 - Math.exp(-dt / 260);
    px += (tx - px) * k; py += (ty - py) * k;
    if (!drag) { yaw += yawV; yawV *= Math.pow(.94, dt / 16.7); if (p < .7) yaw *= Math.pow(.9, dt / 16.7); }
    set(canvas, 'cursor', p > .82 ? (drag ? 'grabbing' : 'grab') : '');

    scene.update({ p, time: clock, intro, px: window.__nsFilmSnap ? 0 : px, py: window.__nsFilmSnap ? 0 : py, yaw, dof });

    const fade = (1 - smooth(T.notes[0], T.notes[1], p)) * smooth(.55, 1, intro);
    notes.forEach((el, i) => {
      scene.noteAt(i, out);
      // A label follows its tile but never runs off the side of the screen.
      const half = (el.__half || 0) + 20;
      const x = pinW > half * 2 ? clamp(out[0], half, pinW - half) : out[0];
      set(el, 'transform', 'translate3d(' + x.toFixed(1) + 'px,' + out[1].toFixed(1) + 'px,0) translateX(-50%)');
      set(el, 'opacity', (out[2] * fade).toFixed(3));
    });

    // Quality: hold the best picture this machine can draw smoothly. Slow frames step it down
    // (fewer pixels, then no soft focus, then the still picture); a long smooth run steps it up once.
    if (window.__nsFilmNoGuard) return;
    frames++;
    if (frames < 30) return;
    if (dt > 24) { slow++; good = 0; } else good++;
    if (frames % 90 === 0) {
      if (slow > 40) {
        lockUp = true;
        if (tier < BUDGETS.length - 1) { tier++; size(); }
        else if (dof) dof = 0;
        else { freeze(); return; }
      }
      slow = 0;
    }
    if (!lockUp && good > 240 && tier > 0) { tier--; good = 0; lockUp = tier === 0; size(); }
  }

  function freeze() {
    frozen = true; live = false;
    if (scene) { scene.dispose(); scene = null; }
    root.removeAttribute('data-film-live');
    root.setAttribute('data-film-frozen', '');
    notes.forEach((el) => set(el, 'opacity', '0'));
  }

  const onMove = (e) => {
    tx = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1); ty = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1);
    if (drag) { const dx = e.clientX - drag.x; drag.x = e.clientX; yawV = dx * .004; yaw += yawV; }
  };
  const onDown = (e) => { if (p > .82 && e.target === canvas && e.button === 0) { drag = { x: e.clientX }; canvas.setPointerCapture(e.pointerId); } };
  const onUp = () => { drag = null; };
  window.addEventListener('pointermove', onMove, { passive: true });
  canvas.addEventListener('pointerdown', onDown);
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });

  const onSound = () => { const on = sound.toggle(); soundBtn.setAttribute('aria-pressed', on ? 'true' : 'false'); };
  if (soundBtn) soundBtn.addEventListener('click', onSound);

  const io = new IntersectionObserver((entries) => {
    near = entries.some((e) => e.isIntersecting);
    if (near) {
      load();
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setActive(false);
      sound.update(p, false);
    }
  }, { rootMargin: '60% 0px' });
  io.observe(root);

  const ro = new ResizeObserver(size);
  ro.observe(pin);
  words(0);

  // For checking and for remaking the still picture, never set by the site itself:
  // __nsFilmDebug exposes the scene, __nsFilmNoGuard keeps a slow test machine on the 3D,
  // __nsFilmTier picks the pixel budget, __nsFilmSnap and __nsFilmClock play it frame by frame.
  if (window.__nsFilmDebug) window.__nsFilm = { get scene() { return scene; }, get p() { return p; }, get tier() { return tier; }, canvas, sound };

  return {
    destroy() {
      gone = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      if (soundBtn) { soundBtn.removeEventListener('click', onSound); soundBtn.setAttribute('aria-pressed', 'false'); }
      sound.stop();
      if (active) setActive(false);
      if (scene) scene.dispose();
      scene = null;
      canvas.remove();
      root.removeAttribute('data-film-live'); root.removeAttribute('data-film-frozen');
      touched.forEach((el) => { ['opacity', 'transform', 'visibility', 'color', 'cursor'].forEach((k) => { el.style[k] = ''; delete el['__' + k]; }); });
      ticks.forEach((el) => { el.removeAttribute('data-on'); delete el.__on; });
    },
  };
}

// ---- The other pages: the same system, seen from somewhere else ---------------------------------
//
// Each page gets one small view. It goes from shot a to shot b either as the page scrolls or,
// with go, when the page says so (the Start page, once the form has gone). p is the film's own
// playhead: 0 is loose cards, 1 is the finished system.

const VIEWS = {
  solutions: { a: { p: 1, pos: [0, 6.2, 15], at: [0, -.4, 0] }, b: { p: 1, pos: [0, 12.2, 10.6], at: [0, -.4, 0] }, range: 8, rings: true },
  work: { a: { p: .02, pos: [-2.5, -1.2, 7.2], at: [-1.1, -1.5, 3.4] }, b: { p: .02, pos: [.5, -1.1, 7.1], at: [-1.1, -1.5, 3.4] }, range: 1.7 },
  about: { a: { p: 1, pos: [0, 1.5, 9.4], at: [0, .15, 0] }, b: { p: 1, pos: [0, 3.4, 9.2], at: [0, .15, 0] }, range: 4.2 },
  start: { a: { p: .03, pos: [.5, .15, 12.6], at: [.5, .15, 4] }, b: { p: 1, pos: [0, 5.6, 13.6], at: [0, -.4, 0] }, range: 6, go: true, tau: 950 },
};

export function mountView({ root, three, name }) {
  const V = VIEWS[name];
  if (!V) return { destroy() {} };
  const canvas = document.createElement('canvas');
  root.appendChild(canvas);
  let gone = false, raf = 0, last = 0, scene = null, loading = false, liveAt = -1, k = -1, dof = 1, slow = 0, frames = 0;
  let px = 0, py = 0, tx = 0, ty = 0;
  const t0 = performance.now();
  const shot = { pos: [0, 0, 0], at: [0, 0, 0], off: [0, 0], range: V.range, rings: V.rings ? [0, 0, 0] : null };
  const fit = (s) => { const w = root.clientWidth, h = root.clientHeight; if (w && h) s.resize(w, h, Math.min(window.devicePixelRatio || 1, 2)); };

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const real = ts - (last || ts);
    last = ts;
    if (!scene) return;
    const snap = !!window.__nsFilmSnap;
    const clock = window.__nsFilmClock === undefined ? (ts - t0) / 1000 : window.__nsFilmClock;
    if (liveAt < 0) { liveAt = snap ? -10 : clock; root.setAttribute('data-view-live', ''); }
    const age = clock - liveAt;
    // How far along: by scroll, until the view has left the top of the screen, or on the page's word.
    const r = root.getBoundingClientRect();
    const target = V.go ? (root.getAttribute('data-view-go') === '1' ? 1 : 0) : clamp(window.scrollY / Math.max(1, r.top + window.scrollY + r.height));
    if (k < 0 || snap) k = target;
    else {
      k += (target - k) * (1 - Math.exp(-Math.min(real, 600) / (V.tau || 120)));
      if (Math.abs(target - k) < .0004) k = target;
    }
    const e = V.go ? easeIO(k) : k;
    for (let i = 0; i < 3; i++) { shot.pos[i] = lerp(V.a.pos[i], V.b.pos[i], e); shot.at[i] = lerp(V.a.at[i], V.b.at[i], e); }
    // On the Solutions page the three orbits arrive one after another, inner first.
    if (shot.rings) for (let i = 0; i < 3; i++) shot.rings[i] = easeOut((age - .3 - i * .55) / 1.1);
    const lean = 1 - Math.exp(-Math.min(real, 64) / 260);
    px += (tx - px) * lean; py += (ty - py) * lean;
    scene.update({ p: lerp(V.a.p, V.b.p, e), time: clock, intro: clamp(age / 1.9), px: snap ? 0 : px * .6, py: snap ? 0 : py * .6, yaw: 0, dof, view: shot });

    // A machine that cannot keep up loses the soft focus first, then the view itself.
    if (window.__nsFilmNoGuard) return;
    frames++;
    if (frames < 30) return;
    if (real > 24) slow++;
    if (frames % 90 === 0) {
      if (slow > 40) { if (dof) dof = 0; else { halt(); return; } }
      slow = 0;
    }
  }

  function halt() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0; gone = true;
    if (scene) { scene.dispose(); scene = null; }
    root.removeAttribute('data-view-live');
  }

  const onMove = (e) => { tx = clamp((e.clientX / window.innerWidth) * 2 - 1, -1, 1); ty = clamp((e.clientY / window.innerHeight) * 2 - 1, -1, 1); };
  window.addEventListener('pointermove', onMove, { passive: true });

  // Nothing is fetched or drawn until the view is on screen; a hidden view never is.
  const io = new IntersectionObserver((entries) => {
    if (gone) return;
    if (entries.some((en) => en.isIntersecting)) {
      if (!loading) { loading = true; prepare(three, canvas, 5, fit, () => !gone, (s) => { scene = s; fit(s); }); }
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }, { rootMargin: '10% 0px' });
  io.observe(root);
  const ro = new ResizeObserver(() => { if (scene) fit(scene); });
  ro.observe(root);

  if (window.__nsFilmDebug) window.__nsView = { get scene() { return scene; }, get k() { return k; }, name, canvas };

  return {
    destroy() {
      io.disconnect(); ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      halt();
      canvas.remove();
    },
  };
}
