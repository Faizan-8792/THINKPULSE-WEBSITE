// Scroll Storytelling Thread - a glowing 3D light-line that starts at the top
// left (by the ThinkPulse brand), sweeps right across the hero, then weaves down
// the whole page as a visual spine. It draws itself in as you scroll down and
// recedes near the bottom. Decorative only: the canvas never captures pointer
// events. Theme-aware (tp-theme), reduced-motion safe, pauses when the tab is
// hidden, and fails silently without WebGL or the CDN.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function () {
  var canvas = document.getElementById('threadCanvas');
  if (!canvas) return;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var mobile = window.innerWidth < 700;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var aspect = window.innerWidth / window.innerHeight;
  var camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, 0.01, 10);
  camera.position.z = 2;

  function isLight() { return document.documentElement.getAttribute('data-theme') !== 'dark'; }
  function pal() {
    return isLight() ? {
      a: [0.31, 0.27, 0.92], b: [0.04, 0.66, 0.95], glow: 0.8, opacity: 0.95, add: false
    } : {
      a: [0.52, 0.52, 1.0], b: [0.15, 0.86, 0.96], glow: 1.0, opacity: 1.0, add: true
    };
  }

  // weave spine. x is a fraction of half-width [-1..1] (mapped to the frustum
  // edges by aspect), y descends top(+1) -> bottom(-1). A calm, tall S-curve
  // with only a couple of gentle bends so it never slices across the content.
  // Point 0 sits top-left near the brand; it sweeps once to the right over the
  // hero, eases back, and exits at the bottom.
  var RAW = [
    [-0.86, 0.95, 0.0],
    [0.60, 0.48, 0.12],
    [-0.46, -0.18, -0.10],
    [0.20, -0.95, 0.0]
  ];
  var EDGE = 0.92; // keep the weave just inside the screen edges
  function buildCurve() {
    var pts = RAW.map(function (p) {
      return new THREE.Vector3(p[0] * aspect * EDGE, p[1], p[2]);
    });
    return new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
  }

  var t = pal();
  var mat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: t.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    uniforms: {
      uDraw: { value: 0 }, uTail: { value: 0 }, uHead: { value: 0 }, uTime: { value: 0 },
      uColorA: { value: new THREE.Vector3(t.a[0], t.a[1], t.a[2]) },
      uColorB: { value: new THREE.Vector3(t.b[0], t.b[1], t.b[2]) },
      uGlow: { value: t.glow }, uOpacity: { value: t.opacity }
    },
    vertexShader: [
      'varying vec2 vUv;',
      'void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform float uDraw;uniform float uTail;uniform float uHead;uniform float uTime;',
      'uniform vec3 uColorA;uniform vec3 uColorB;uniform float uGlow;uniform float uOpacity;',
      'varying vec2 vUv;',
      'void main(){',
      ' float along = vUv.x;',
      ' float shown = step(uTail, along) * step(along, uDraw);',
      ' if (shown < 0.5) discard;',
      // soft round cross-section: bright core, glowing falloff
      ' float ring = 1.0 - abs(vUv.y - 0.5) * 2.0;',
      ' float core = pow(clamp(ring, 0.0, 1.0), 1.6);',
      ' vec3 col = mix(uColorA, uColorB, along);',
      // flowing energy pulses travelling down the line (animated glow)
      ' float flow = sin(along * 12.0 - uTime * 2.6);',
      ' float pulse = smoothstep(0.7, 1.0, flow);',
      ' col += vec3(0.85, 0.95, 1.0) * pulse * 0.5;',
      // bright moving head just behind the draw front
      ' float headBand = smoothstep(uDraw - 0.05, uDraw, along) * uHead;',
      ' col += vec3(0.95, 0.99, 1.0) * headBand;',
      ' float a = uOpacity * core * (0.6 + 0.4 * uGlow) + headBand * 0.6 + pulse * core * 0.25;',
      ' gl_FragColor = vec4(col, clamp(a, 0.0, 1.0));',
      '}'
    ].join('\n')
  });

  var group = new THREE.Group();
  scene.add(group);
  var thread = null;
  function buildThread() {
    if (thread) { group.remove(thread); thread.geometry.dispose(); }
    var tubular = mobile ? 260 : 520;
    var radial = mobile ? 6 : 8;
    var radius = mobile ? 0.009 : 0.013;
    var geo = new THREE.TubeGeometry(buildCurve(), tubular, radius, radial, false);
    thread = new THREE.Mesh(geo, mat);
    group.add(thread);
  }
  buildThread();

  // --- scroll model ---
  var scrollY = window.scrollY || 0;
  var docHeight = document.documentElement.scrollHeight;
  var innerH = window.innerHeight;
  window.addEventListener('scroll', function () { scrollY = window.scrollY || 0; }, { passive: true });
  function progress() {
    var max = docHeight - innerH;
    return max > 0 ? Math.max(0, Math.min(scrollY / max, 1)) : 0;
  }

  function measure() {
    docHeight = document.documentElement.scrollHeight;
    innerH = window.innerHeight;
    aspect = window.innerWidth / innerH;
    camera.left = -aspect; camera.right = aspect; camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, innerH);
    buildThread(); // rebuild so the weave re-spans the new width
  }
  window.addEventListener('resize', measure, { passive: true });
  if ('ResizeObserver' in window) { new ResizeObserver(measure).observe(document.body); }

  // --- theme ---
  var baseOpacity = t.opacity;
  function applyTheme() {
    var c = pal();
    mat.uniforms.uColorA.value.set(c.a[0], c.a[1], c.a[2]);
    mat.uniforms.uColorB.value.set(c.b[0], c.b[1], c.b[2]);
    mat.uniforms.uGlow.value = c.glow;
    baseOpacity = c.opacity;
    mat.blending = c.add ? THREE.AdditiveBlending : THREE.NormalBlending;
    mat.needsUpdate = true;
  }
  window.addEventListener('tp-theme', applyTheme);

  // --- reduced motion: one static, calm frame, no loop ---
  if (reduce) {
    mat.uniforms.uDraw.value = 1;
    mat.uniforms.uTail.value = 0;
    mat.uniforms.uHead.value = 0;
    mat.uniforms.uOpacity.value = baseOpacity * 0.6;
    renderer.render(scene, camera);
    return;
  }

  // --- render loop ---
  var eased = 0, running = true, t0 = performance.now();
  function smooth(a, b, x) { var u = Math.max(0, Math.min((x - a) / (b - a), 1)); return u * u * (3 - 2 * u); }
  function loop(now) {
    if (document.hidden) { running = false; return; }
    requestAnimationFrame(loop);
    var time = (now - t0) * 0.001;
    var target = progress();
    eased += (target - eased) * 0.08;

    var draw = smooth(0.0, 0.85, eased);
    var tail = smooth(0.85, 1.0, eased) * 0.9;
    mat.uniforms.uTime.value = time;
    mat.uniforms.uDraw.value = draw;
    mat.uniforms.uTail.value = tail;
    mat.uniforms.uHead.value = (draw < 0.999 ? 1.0 : 0.35) * (0.6 + 0.4 * Math.sin(time * 3.0));
    group.scale.y = 1.0 - smooth(0.85, 1.0, eased) * 0.15;
    mat.uniforms.uOpacity.value = baseOpacity * (1.0 - smooth(0.92, 1.0, eased) * 0.6);

    renderer.render(scene, camera);
  }
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !running) { running = true; requestAnimationFrame(loop); }
  });
  applyTheme();
  requestAnimationFrame(loop);
})();
