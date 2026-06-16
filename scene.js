// Interactive 3D centerpiece: a glowing "world" — a noise-displaced sphere with
// a gradient surface and a fresnel rim, wrapped in an atmospheric halo and a
// thin orbit ring. Reacts to the cursor, breathes over time, and docks
// gracefully (no ugly fade) as you scroll. Theme-perfect in light and dark.
// Pure custom shaders (no scene lights), so it reads crisp on white and deep
// on dark. Falls back silently if WebGL or the CDN is unavailable.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function () {
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var canvas = document.getElementById('bgCanvas');
  if (!canvas) return;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.z = 4.4;

  function isLight() { return document.documentElement.getAttribute('data-theme') !== 'dark'; }

  // Theme palettes (linear-ish RGB triplets 0..1)
  function theme() {
    return isLight() ? {
      a: [0.32, 0.30, 0.92],   // indigo
      b: [0.05, 0.62, 0.92],   // azure
      rim: [0.55, 0.86, 1.0],  // bright cyan-white rim
      atmo: [0.36, 0.55, 1.0],
      ring: [0.31, 0.27, 0.90],
      atmoGlow: 0.55, ringOp: 0.22, planetOp: 0.95, rimPow: 2.1
    } : {
      a: [0.49, 0.49, 1.0],
      b: [0.13, 0.83, 0.93],
      rim: [0.65, 0.96, 1.0],
      atmo: [0.45, 0.70, 1.0],
      ring: [0.55, 0.62, 1.0],
      atmoGlow: 0.95, ringOp: 0.30, planetOp: 0.97, rimPow: 2.6
    };
  }
  function v3(a) { return new THREE.Vector3(a[0], a[1], a[2]); }

  var SNOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){',
    ' const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    ' vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
    ' vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
    ' vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;',
    ' i=mod289(i);',
    ' vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    ' float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;',
    ' vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    ' vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);',
    ' vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);',
    ' vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);',
    ' vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));',
    ' vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    ' vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    ' vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));',
    ' p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    ' vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;',
    ' return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));',
    '}'
  ].join('\n');

  var t = theme();

  // ---------- planet ----------
  var planetMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: reduce ? 0.0 : 0.14 },
      uMouse: { value: new THREE.Vector2(0, 0) },
      uColorA: { value: v3(t.a) }, uColorB: { value: v3(t.b) },
      uRim: { value: v3(t.rim) }, uRimPow: { value: t.rimPow }, uOpacity: { value: t.planetOp }
    },
    vertexShader: SNOISE + [
      'uniform float uTime;uniform float uAmp;uniform vec2 uMouse;',
      'varying vec3 vNormalV;varying vec3 vViewDir;varying float vN;',
      'void main(){',
      ' vec3 nrm=normalize(normal);',
      ' float n=snoise(nrm*1.5+vec3(0.0,0.0,uTime*0.18));',
      ' float n2=snoise(nrm*3.2-vec3(uTime*0.12));',
      ' float disp=(n*0.7+n2*0.3);',
      ' float mb=max(dot(nrm,normalize(vec3(uMouse,0.75))),0.0);',
      ' vec3 p=position+nrm*(disp*uAmp+mb*mb*0.10);',
      ' vN=disp;',
      ' vec4 mv=modelViewMatrix*vec4(p,1.0);',
      ' vViewDir=normalize(-mv.xyz);',
      ' vNormalV=normalize(normalMatrix*nrm);',
      ' gl_Position=projectionMatrix*mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColorA;uniform vec3 uColorB;uniform vec3 uRim;uniform float uRimPow;uniform float uOpacity;',
      'varying vec3 vNormalV;varying vec3 vViewDir;varying float vN;',
      'void main(){',
      ' float fres=pow(1.0-max(dot(vNormalV,vViewDir),0.0),uRimPow);',
      ' vec3 base=mix(uColorA,uColorB,smoothstep(-0.7,0.7,vN));',
      ' vec3 col=mix(base,uRim,clamp(fres,0.0,1.0));',
      ' col+=uRim*fres*0.5;',
      ' gl_FragColor=vec4(col,uOpacity);',
      '}'
    ].join('\n')
  });
  var DETAIL = window.innerWidth < 700 ? 4 : 6;
  var planet = new THREE.Mesh(new THREE.IcosahedronGeometry(1.3, DETAIL), planetMat);

  // ---------- atmosphere halo ----------
  var atmoMat = new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
    uniforms: { uColor: { value: v3(t.atmo) }, uGlow: { value: t.atmoGlow } },
    vertexShader: [
      'varying vec3 vNormalV;',
      'void main(){ vNormalV=normalize(normalMatrix*normal); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColor;uniform float uGlow;varying vec3 vNormalV;',
      'void main(){ float i=pow(0.72-dot(vNormalV,vec3(0.0,0.0,1.0)),3.0); i=max(i,0.0)*uGlow; gl_FragColor=vec4(uColor,1.0)*i; }'
    ].join('\n')
  });
  var atmo = new THREE.Mesh(new THREE.IcosahedronGeometry(1.62, 4), atmoMat);

  // ---------- orbit ring ----------
  var ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(t.ring[0], t.ring[1], t.ring[2]), transparent: true, opacity: t.ringOp, blending: THREE.AdditiveBlending });
  var ring = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.008, 12, 220), ringMat);
  ring.rotation.x = 1.15; ring.rotation.y = 0.25;

  var group = new THREE.Group();
  scene.add(group);
  group.add(planet); group.add(atmo); group.add(ring);

  function placeGroup() { group.position.x = window.innerWidth > 900 ? 1.7 : 0; }
  placeGroup();

  // ---------- interaction ----------
  var tx = 0, ty = 0, cx = 0, cy = 0, scrollY = 0;
  window.addEventListener('mousemove', function (e) {
    tx = (e.clientX / window.innerWidth - 0.5) * 2;
    ty = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });
  window.addEventListener('scroll', function () { scrollY = window.scrollY || 0; }, { passive: true });

  function applyTheme() {
    var c = theme();
    planetMat.uniforms.uColorA.value.set(c.a[0], c.a[1], c.a[2]);
    planetMat.uniforms.uColorB.value.set(c.b[0], c.b[1], c.b[2]);
    planetMat.uniforms.uRim.value.set(c.rim[0], c.rim[1], c.rim[2]);
    planetMat.uniforms.uRimPow.value = c.rimPow;
    planetMat.uniforms.uOpacity.value = c.planetOp;
    atmoMat.uniforms.uColor.value.set(c.atmo[0], c.atmo[1], c.atmo[2]);
    atmoMat.uniforms.uGlow.value = c.atmoGlow;
    ringMat.color.setRGB(c.ring[0], c.ring[1], c.ring[2]);
    ringMat.opacity = c.ringOp;
  }
  window.addEventListener('tp-theme', applyTheme);

  var t0 = performance.now();
  function frame(now) {
    var time = (now - t0) * 0.001;
    cx += (tx - cx) * 0.05; cy += (ty - cy) * 0.05;

    planetMat.uniforms.uTime.value = time;
    planetMat.uniforms.uMouse.value.set(cx, -cy);

    if (!reduce) {
      planet.rotation.y = time * 0.12 + cx * 0.35;
      planet.rotation.x = cy * 0.25;
      ring.rotation.z = time * 0.06;
    }

    // scroll fade: the planet belongs to the hero only - fade it right out so
    // it never washes out the sections below.
    var vh = window.innerHeight;
    var p = Math.min(scrollY / (vh * 0.8), 1);
    var ease = p * p * (3 - 2 * p); // smoothstep
    group.scale.setScalar(1 - ease * 0.45);
    var c = theme();
    planetMat.uniforms.uOpacity.value = c.planetOp * (1 - ease * 0.94);
    atmoMat.uniforms.uGlow.value = c.atmoGlow * (1 - ease);
    ringMat.opacity = c.ringOp * (1 - ease);
    group.position.y = ease * 1.1;
    group.position.x = (window.innerWidth > 900 ? 1.7 : 0) + ease * 0.3;
    group.visible = ease < 0.985;

    camera.position.x = cx * 0.22;
    camera.position.y = -cy * 0.16;
    camera.lookAt(group.position.x * 0.5, group.position.y * 0.5, 0);

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  applyTheme();
  requestAnimationFrame(frame);

  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeGroup();
  });
})();
