// The Home page film: loose pieces of a company's work drift in the dark, the star lights, and
// the pieces fall into orbit around it. Scrolling is the playhead: every position is worked out
// from how far the section has been scrolled, so scrolling back up rewinds it exactly.
//
// index.html mounts this only on a wide screen with motion allowed. Everything it writes to the
// page is undone by destroy(). The words are real text in index.html; this file only moves them.

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeIO = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
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

// Where each scene sits in the scroll (0 = section reaches the top, 1 = it is about to leave).
const IGNITE = [.25, .42];          // the star lights
const GATHER = [.46, .62, .16];     // tiles leave between the first two, each taking the third
// When each caption is on screen: fade in over [0]..[1], out over [2]..[3].
const CAPS = [
  [-1, -1, .19, .245],
  [.265, .31, .43, .475],
  [.50, .55, .77, .815],
  [.84, .885, 2, 2],
];

// Camera stops, by scroll position. Between them it follows a smooth curve, never a straight cut.
const CAM = [
  { p: 0, v: [0, .5, 15.5] },
  { p: .25, v: [0, .5, 11] },
  { p: .45, v: [0, 1.2, 9.6] },
  { p: .62, v: [0, 4.2, 12.3] },
  { p: .8, v: [0, 7.0, 13.0] },
  { p: 1, v: [0, 8.2, 14] },
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

// The five tiles that carry a sentence. Placed by hand so they read well in the first scene.
const NOTE_TILES = [
  [-4.3, 2.0, 2.5],
  [3.0, 2.4, 1.0],
  [3.1, -.8, 2.2],
  [.7, -2.4, 2.6],
  [-1.3, .7, -1.6],
];

// Which drawing each sentence tile carries: sheet, list, document, chat, sheet.
const NOTE_KINDS = [0, 3, 1, 2, 0];

const RINGS = [
  { r: 2.5, n: 14, w: .10, k: 1.5, tilt: [.045, 0, 0] },
  { r: 3.8, n: 24, w: .07, k: 1.05, tilt: [-.02, 0, .04] },
  { r: 5.1, n: 34, w: .05, k: .8, tilt: [.02, 0, -.04] },
];

const INK = { fill0: '#2d2a48', fill1: '#222437', edge: 'rgba(181,171,252,.62)', line: 'rgba(214,210,253,.8)', soft: 'rgba(181,171,252,.34)' };

// Four kinds of tile, drawn in code: a spreadsheet, a document, a chat and a list.
function tileTexture(THREE, kind) {
  const W = 320, H = 214, c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, INK.fill0); grad.addColorStop(1, INK.fill1);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const bar = (x, y, w, h, style, r = h / 2) => { g.fillStyle = style; g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
  if (kind === 0) {
    bar(22, 22, W - 44, 26, INK.soft, 5);
    g.strokeStyle = INK.soft; g.lineWidth = 2;
    for (let r = 0; r < 5; r++) { const y = 62 + r * 28; g.beginPath(); g.moveTo(22, y); g.lineTo(W - 22, y); g.stroke(); }
    for (let k = 1; k < 4; k++) { const x = 22 + k * (W - 44) / 4; g.beginPath(); g.moveTo(x, 48); g.lineTo(x, H - 24); g.stroke(); }
    [[0, 0], [2, 1], [1, 2], [3, 3], [0, 3], [2, 4]].forEach(([cx, cy]) => bar(30 + cx * (W - 44) / 4, 70 + cy * 28, 42, 10, INK.line));
  } else if (kind === 1) {
    bar(24, 26, 120, 16, INK.line);
    [230, 262, 196, 250, 150].forEach((w, i) => bar(24, 66 + i * 26, w, 9, i === 4 ? INK.soft : INK.line));
  } else if (kind === 2) {
    bar(24, 24, 170, 40, INK.soft, 14);
    bar(W - 24 - 150, 78, 150, 40, INK.line, 14);
    bar(24, 132, 200, 40, INK.soft, 14);
    bar(40, 40, 110, 8, INK.line); bar(40, 148, 140, 8, INK.line);
  } else {
    for (let r = 0; r < 5; r++) {
      const y = 28 + r * 34;
      g.fillStyle = r === 1 ? INK.line : INK.soft; g.beginPath(); g.arc(36, y + 8, 8, 0, TAU); g.fill();
      bar(58, y + 3, [190, 220, 150, 205, 170][r], 10, r === 1 ? INK.line : INK.soft);
    }
  }
  g.strokeStyle = INK.edge; g.lineWidth = 5; g.beginPath(); g.roundRect(2.5, 2.5, W - 5, H - 5, 20); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function glowTexture(THREE) {
  const S = 256, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const rg = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  rg.addColorStop(0, 'rgba(214,208,255,.95)');
  rg.addColorStop(.16, 'rgba(165,154,240,.5)');
  rg.addColorStop(.45, 'rgba(120,108,200,.14)');
  rg.addColorStop(1, 'rgba(120,108,200,0)');
  g.fillStyle = rg; g.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function buildScene(THREE, canvas, noteCount) {
  const rand = rng(20261112);
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x161826, 13, 34);
  const camera = new THREE.PerspectiveCamera(38, 1, .1, 120);
  const junk = [renderer];

  scene.add(new THREE.HemisphereLight(0x9a93d6, 0x161826, .62));
  const starLight = new THREE.PointLight(0xd6d0ff, 0, 0, 1.45);
  scene.add(starLight);

  // Far stars, for depth behind the tiles.
  {
    const n = 320, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 26 + rand() * 30, th = rand() * TAU, y = (rand() - .5) * 44;
      pos[i * 3] = Math.cos(th) * r; pos[i * 3 + 1] = y; pos[i * 3 + 2] = Math.sin(th) * r - 6;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({ color: 0xa7a1db, size: 1.6, sizeAttenuation: false, transparent: true, opacity: .5, fog: false, depthWrite: false });
    scene.add(new THREE.Points(geo, mat));
    junk.push(geo, mat);
  }

  // One rounded tile, reused for every piece. Built in a 1 x 1 square so the drawings fit it.
  const TW = .9, TH = .6;
  const tileGeo = (() => {
    const rx = .085 / TW, ry = .085 / TH, s = new THREE.Shape();
    s.moveTo(rx, 0); s.lineTo(1 - rx, 0); s.quadraticCurveTo(1, 0, 1, ry);
    s.lineTo(1, 1 - ry); s.quadraticCurveTo(1, 1, 1 - rx, 1);
    s.lineTo(rx, 1); s.quadraticCurveTo(0, 1, 0, 1 - ry);
    s.lineTo(0, ry); s.quadraticCurveTo(0, 0, rx, 0);
    const geo = new THREE.ShapeGeometry(s, 6);
    geo.translate(-.5, -.5, 0); geo.scale(TW, TH, 1);
    return geo;
  })();
  junk.push(tileGeo);

  const total = RINGS.reduce((a, r) => a + r.n, 0);
  const KINDS = 4, used = [0, 0, 0, 0];
  const mats = [], meshes = [];
  for (let k = 0; k < KINDS; k++) {
    const map = tileTexture(THREE, k);
    const mat = new THREE.MeshStandardMaterial({ map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: .36, roughness: .62, metalness: 0, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(tileGeo, mat, total);
    mesh.frustumCulled = false;
    scene.add(mesh);
    mats.push(mat); meshes.push(mesh); junk.push(map, mat);
  }

  // Every tile gets a place in the scatter and a slot on a ring.
  const tiles = [];
  const ringQ = RINGS.map((r) => new THREE.Quaternion().setFromEuler(new THREE.Euler(r.tilt[0], r.tilt[1], r.tilt[2])));
  const taken = NOTE_TILES.slice(0, noteCount).map((v) => new THREE.Vector3(...v));
  const slots = [];
  RINGS.forEach((r, ri) => { for (let j = 0; j < r.n; j++) slots.push({ ri, a: (j / r.n) * TAU + ri * .37 }); });
  // The sentence tiles go to the outer ring, spread around it, so they stay easy to follow.
  const outerStart = RINGS[0].n + RINGS[1].n;
  const noteSlots = Array.from({ length: noteCount }, (_, i) => outerStart + Math.floor((i + .5) * RINGS[2].n / Math.max(1, noteCount)));
  const free = slots.map((_, i) => i).filter((i) => !noteSlots.includes(i));
  for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [free[i], free[j]] = [free[j], free[i]]; }

  for (let i = 0; i < total; i++) {
    const note = i < noteCount;
    let S;
    if (note) S = taken[i].clone();
    else {
      for (let tries = 0; tries < 200; tries++) {
        S = new THREE.Vector3((rand() - .5) * 23, (rand() - .5) * 11.5 + .3, -12 + rand() * 20.5);
        // Nothing drifts across the camera's path, or between the camera and the star.
        const corridor = S.z > -1 && Math.hypot(S.x, S.y - .4) < 2.1;
        const core = S.length() < 2.6;
        const crowd = taken.some((t) => t.distanceTo(S) < (taken.indexOf(t) < noteCount ? 2.3 : 1.25));
        if (!corridor && !core && !crowd) break;
      }
      taken.push(S);
    }
    const slot = slots[note ? noteSlots[i] : free.pop()];
    const ring = RINGS[slot.ri];
    const thS = Math.atan2(S.z, S.x);
    const tilt = note ? .22 : .95;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler((rand() - .5) * tilt, (rand() - .5) * tilt * 1.5, (rand() - .5) * tilt * .7));
    tiles.push({
      S, q, ri: slot.ri, R: ring.r, thS, rS: Math.hypot(S.x, S.z),
      // Most tiles sweep the way the rings turn; none goes more than three quarters of the way round.
      delta: (() => { const d = ((slot.a - thS) % TAU + TAU) % TAU; return d > TAU * .75 ? d - TAU : d; })(),
      // The five named problems are the first to fall into place; the rest follow, inner ring first.
      start: note ? GATHER[0] + i * .012 : lerp(GATHER[0], GATHER[1], clamp(slot.ri / 2 * .7 + rand() * .3)),
      scale: note ? 1.42 : .72 + rand() * .5,
      f1: .17 + rand() * .14, f2: .13 + rand() * .12, ph1: rand() * TAU, ph2: rand() * TAU,
      dist: S.length(), kind: note ? NOTE_KINDS[i % NOTE_KINDS.length] : i % KINDS, slot: 0,
      pos: new THREE.Vector3(),
    });
    const t = tiles[i];
    t.mesh = meshes[t.kind]; t.slot = used[t.kind]++;
  }
  meshes.forEach((m, k) => { m.count = used[k]; });

  // The orbits themselves, as hairlines.
  const ringMat = new THREE.LineBasicMaterial({ color: 0x9184d9, transparent: true, opacity: 0, depthWrite: false });
  junk.push(ringMat);
  RINGS.forEach((r, ri) => {
    const pts = [];
    for (let j = 0; j < 160; j++) { const a = (j / 160) * TAU; pts.push(new THREE.Vector3(Math.cos(a) * r.r, 0, Math.sin(a) * r.r)); }
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const loop = new THREE.LineLoop(geo, ringMat);
    loop.quaternion.copy(ringQ[ri]);
    scene.add(loop);
    junk.push(geo);
  });

  // The star: the four-point mark from the site's logo, with a soft halo behind it.
  const star = (() => {
    const pts = [[50, 8], [58, 42], [92, 50], [58, 58], [50, 92], [42, 58], [8, 50], [42, 42]];
    const s = new THREE.Shape();
    pts.forEach(([x, y], i) => { const X = (x - 50) / 42, Y = (50 - y) / 42; if (i) s.lineTo(X, Y); else s.moveTo(X, Y); });
    const geo = new THREE.ShapeGeometry(s);
    // Drawn over everything: the star is the one thing a passing tile never hides.
    const mat = new THREE.MeshBasicMaterial({ color: 0xdcd8ff, fog: false, side: THREE.DoubleSide, depthTest: false });
    junk.push(geo, mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.renderOrder = 3;
    return mesh;
  })();
  const glowMap = glowTexture(THREE);
  const glowMat = new THREE.SpriteMaterial({ map: glowMap, blending: THREE.AdditiveBlending, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false });
  const glow = new THREE.Sprite(glowMat);
  glow.renderOrder = 2;
  junk.push(glowMap, glowMat);
  scene.add(glow, star);

  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), QF = new THREE.Quaternion(), QR = new THREE.Quaternion();
  const ID = new THREE.Quaternion(), SC = new THREE.Vector3(), UP = new THREE.Vector3(), ZERO = new THREE.Vector3(), LM = new THREE.Matrix4();
  const cam = [0, 0, 0], proj = new THREE.Vector3();
  let W = 1, H = 1;

  function resize(w, h, ratio) {
    W = w; H = h;
    renderer.setPixelRatio(ratio);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // The system sits a little right of centre, leaving the left for the words.
    camera.setViewOffset(w, h, -w * .11, h * .05, w, h);
    camera.updateProjectionMatrix();
  }

  function update(p, time) {
    camAt(p, cam);
    camera.position.set(cam[0], cam[1], cam[2]);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();

    const ig = smooth(IGNITE[0], IGNITE[1], p);
    const settle = smooth(GATHER[1], .82, p);
    starLight.intensity = ig * 34;
    for (const m of mats) m.emissiveIntensity = .36 + ig * .18;
    ringMat.opacity = smooth(.6, .82, p) * .3;

    const breath = 1 + Math.sin(time * 1.1) * .025;
    // It faces the viewer and settles upright as it lights, like the mark in the page header.
    star.quaternion.copy(camera.quaternion);
    star.rotateZ((1 - ig) * -.6);
    star.scale.setScalar(ig * .62 * breath);
    star.visible = ig > .001;
    glow.scale.setScalar(lerp(1.2, 5.2, ig) * breath);
    glowMat.opacity = ig * .95;

    for (let i = 0; i < tiles.length; i++) {
      const t = tiles[i];
      const e = easeIO(clamp((p - t.start) / GATHER[2]));
      const loose = 1 - e;
      const sx = t.S.x + Math.sin(time * t.f1 + t.ph1) * .16 * loose;
      const sy = t.S.y + Math.sin(time * t.f2 + t.ph2) * .13 * loose;
      const ring = RINGS[t.ri];
      // A tile falls in toward the star first and sweeps round late, so nothing swings past the lens.
      const r = lerp(t.rS, t.R, 1 - Math.pow(1 - e, 1.9));
      const a = t.thS + t.delta * Math.pow(e, 1.9) + (ring.w * time + ring.k * settle) * e;
      t.pos.set(Math.cos(a) * r, lerp(sy, 0, e), Math.sin(a) * r);
      t.pos.x += sx - t.S.x;
      QR.copy(ID).slerp(ringQ[t.ri], e);
      t.pos.applyQuaternion(QR);

      // Each tile turns to face the star as its light arrives, nearest first.
      const face = Math.max(e, smooth(.26 + t.dist * .008, .38 + t.dist * .008, p));
      UP.set(0, 1, 0).applyQuaternion(QR);
      LM.lookAt(ZERO, t.pos, UP);
      QF.setFromRotationMatrix(LM);
      Q.copy(t.q).slerp(QF, face);
      SC.setScalar(lerp(t.scale, .6, e));
      M.compose(t.pos, Q, SC);
      t.mesh.setMatrixAt(t.slot, M);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
    renderer.render(scene, camera);
  }

  // Where a sentence tile is on screen, in CSS pixels: [x, y under the tile, how visible].
  function noteAt(i, out) {
    const t = tiles[i];
    proj.copy(t.pos).project(camera);
    const d = camera.position.distanceTo(t.pos);
    const pxPerUnit = (H / 2) / Math.tan((camera.fov * Math.PI / 180) / 2) / d;
    out[0] = (proj.x * .5 + .5) * W;
    out[1] = (-proj.y * .5 + .5) * H + (TH * t.scale / 2) * pxPerUnit + 12;
    const inside = proj.z < 1 && Math.abs(proj.x) < .93 && proj.y > -.86 && proj.y < .8;
    out[2] = inside ? smooth(3, 5.5, d) : 0;
    return out;
  }

  function dispose() {
    for (const j of junk) j.dispose();
    for (const m of meshes) m.dispose();
    renderer.forceContextLoss();
  }

  return { resize, update, noteAt, dispose, noteCount };
}

export function mount({ root, three, onActive }) {
  const pin = root.querySelector('[data-film-pin]');
  const canvas = root.querySelector('canvas');
  const caps = Array.from(root.querySelectorAll('[data-film-cap]'));
  const notes = Array.from(root.querySelectorAll('[data-film-note]'));
  const noteBox = caps[0] || null;
  const cta = root.querySelector('[data-film-cta]');
  const touched = [...caps, ...notes];
  if (cta) touched.push(cta);

  let gone = false, raf = 0, last = 0, p = -1, near = false, active = false;
  let scene = null, loading = false, ratio = 1, slow = 0, frames = 0, live = false;
  const out = [0, 0, 0];
  const t0 = performance.now();

  const setActive = (on) => {
    if (on === active) return;
    active = on;
    if (onActive) onActive(on);
  };

  function size() {
    if (!scene) return;
    const w = pin.clientWidth, h = pin.clientHeight;
    if (w && h) scene.resize(w, h, ratio);
  }

  // The 3D library is fetched in the browser's idle time, after the page itself is up.
  function load() {
    if (loading || scene || gone) return;
    loading = true;
    const idle = window.requestIdleCallback ? (fn) => requestIdleCallback(fn, { timeout: 2500 }) : (fn) => setTimeout(fn, 400);
    idle(() => { if (!gone) fetch3d(); });
  }

  function fetch3d() {
    import(three).then((THREE) => {
      if (gone) return;
      // Sharp enough on a high-density screen without drawing four times the pixels.
      ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      scene = buildScene(THREE, canvas, notes.length);
      size();
    }).catch(() => { /* The still picture and the words stay; nothing else depends on the 3D. */ });
  }

  function words(pp) {
    caps.forEach((el, i) => {
      const c = CAPS[i];
      if (!c) return;
      const o = Math.min(smooth(c[0], c[1], pp), 1 - smooth(c[2], c[3], pp));
      const v = o.toFixed(3);
      if (el.__o !== v) { el.__o = v; el.style.opacity = v; }
    });
    if (cta) {
      const show = pp > CAPS[CAPS.length - 1][0] + .01;
      if (cta.__s !== show) { cta.__s = show; cta.style.visibility = show ? 'visible' : 'hidden'; }
    }
  }

  function frame(ts) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(64, ts - (last || ts));
    last = ts;
    const r = root.getBoundingClientRect();
    const vh = window.innerHeight;
    const span = r.height - vh;
    const target = span > 0 ? clamp(-r.top / span) : 0;
    if (p < 0 || window.__nsFilmSnap) p = target;
    else {
      p += (target - p) * (1 - Math.exp(-dt / 105));
      if (Math.abs(target - p) < .0003) p = target;
    }
    setActive(r.top < vh * .55 && r.bottom > vh * .45);
    words(p);
    if (!scene) return;
    scene.update(p, window.__nsFilmClock === undefined ? (ts - t0) / 1000 : window.__nsFilmClock);
    if (!live) { live = true; root.setAttribute('data-film-live', ''); }

    // The sentences ride under their tiles. They sit inside the first caption, so they fade with it.
    if (noteBox) {
      const ox = noteBox.offsetLeft, oy = noteBox.offsetTop;
      notes.forEach((el, i) => {
        scene.noteAt(i, out);
        el.style.transform = 'translate3d(' + (out[0] - ox).toFixed(1) + 'px,' + (out[1] - oy).toFixed(1) + 'px,0) translateX(-50%)';
        el.style.opacity = out[2].toFixed(3);
      });
    }

    // If this machine cannot keep up, first draw fewer pixels, then hand over to the still picture.
    if (window.__nsFilmNoGuard) return;
    frames++;
    if (frames > 20 && dt > 34) slow++;
    if (frames === 120 || frames === 300) {
      if (slow / (frames === 120 ? 100 : 180) > .6) {
        if (ratio > 1) { ratio = 1; size(); }
        else if (frames === 300) { freeze(); return; }
      }
      slow = 0;
    }
  }

  function freeze() {
    if (scene) { scene.dispose(); scene = null; }
    live = false;
    root.removeAttribute('data-film-live');
    notes.forEach((el) => { el.style.opacity = '0'; });
    loading = true;
  }

  const io = new IntersectionObserver((entries) => {
    near = entries.some((e) => e.isIntersecting);
    if (near) {
      load();
      if (!raf) { last = 0; raf = requestAnimationFrame(frame); }
    } else {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      setActive(false);
    }
  }, { rootMargin: '60% 0px' });
  io.observe(root);

  const ro = new ResizeObserver(size);
  ro.observe(pin);
  words(0);

  // For checking and for remaking the still picture, never set by the site itself:
  // __nsFilmDebug exposes the scene, __nsFilmNoGuard keeps a slow test machine on the 3D,
  // __nsFilmSnap and __nsFilmClock play it frame by frame.
  if (window.__nsFilmDebug) window.__nsFilm = { get scene() { return scene; }, get p() { return p; }, canvas };

  return {
    destroy() {
      gone = true;
      if (raf) cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      setActive(false);
      if (scene) scene.dispose();
      scene = null;
      root.removeAttribute('data-film-live');
      touched.forEach((el) => { el.style.opacity = ''; el.style.transform = ''; el.style.visibility = ''; delete el.__o; delete el.__s; });
    },
  };
}
