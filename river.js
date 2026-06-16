// Digital Knowledge River - a real 3D WebGL water surface. A noise-displaced
// plane with lighting, fresnel sheen and a flowing current, plus glowing
// "knowledge" particles streaming downstream and live mouse ripples (the
// pointer is raycast onto the water). Theme-aware, pauses when offscreen,
// degrades for reduced motion. Falls back silently without WebGL/CDN.
import * as THREE from 'https://unpkg.com/three@0.160.0/build/three.module.js';

(function () {
  var canvas = document.getElementById('riverCanvas');
  if (!canvas) return;
  var host = canvas.parentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
  } catch (e) { return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  function size() { return { w: host.clientWidth || 800, h: host.clientHeight || 360 }; }
  var sz = size();
  renderer.setSize(sz.w, sz.h, false);

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(46, sz.w / sz.h, 0.1, 200);
  camera.position.set(0, 3.4, 8.6);
  camera.lookAt(0, 0.1, -1.5);

  function isLight() { return document.documentElement.getAttribute('data-theme') !== 'dark'; }
  function pal() {
    return isLight() ? {
      a: [0.25, 0.24, 0.85], b: [0.05, 0.55, 0.92], c: [0.08, 0.72, 0.66], rim: [0.62, 0.88, 1.0], part: 0x4f46e5
    } : {
      a: [0.42, 0.42, 1.0], b: [0.13, 0.78, 0.95], c: [0.18, 0.86, 0.74], rim: [0.7, 0.95, 1.0], part: 0x7c83ff
    };
  }

  var SNOISE = [
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}',
    'vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}',
    'float snoise(vec3 v){const vec2 C=vec2(1.0/6.0,1.0/3.0);const vec4 D=vec4(0.0,0.5,1.0,2.0);',
    'vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);',
    'vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.0-g;vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);',
    'vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;i=mod289(i);',
    'vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));',
    'float n_=0.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.0*floor(p*ns.z*ns.z);',
    'vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.0*x_);vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.0-abs(x)-abs(y);',
    'vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);vec4 s0=floor(b0)*2.0+1.0;vec4 s1=floor(b1)*2.0+1.0;vec4 sh=-step(h,vec4(0.0));',
    'vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;',
    'vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);',
    'vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;',
    'vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);m=m*m;',
    'return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}'
  ].join('\n');

  var W = 16, L = 26;
  var segX = window.innerWidth < 700 ? 36 : 56;
  var segZ = window.innerWidth < 700 ? 90 : 150;
  var geo = new THREE.PlaneGeometry(W, L, segX, segZ);
  geo.rotateX(-Math.PI / 2); // lie flat in XZ, up = +y

  var t = pal();
  var waterMat = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      uTime: { value: 0 }, uAmp: { value: reduce ? 0.25 : 0.7 },
      uMouse: { value: new THREE.Vector2(999, 999) }, uMouseOn: { value: 0 },
      uColorA: { value: new THREE.Vector3(t.a[0], t.a[1], t.a[2]) },
      uColorB: { value: new THREE.Vector3(t.b[0], t.b[1], t.b[2]) },
      uColorC: { value: new THREE.Vector3(t.c[0], t.c[1], t.c[2]) },
      uRim: { value: new THREE.Vector3(t.rim[0], t.rim[1], t.rim[2]) },
      uHalfW: { value: W / 2 }, uHalfL: { value: L / 2 }
    },
    vertexShader: SNOISE + [
      'uniform float uTime;uniform float uAmp;uniform vec2 uMouse;uniform float uMouseOn;',
      'varying vec3 vNormal;varying vec3 vView;varying vec2 vUv;varying float vH;',
      'float waveH(vec2 p){',
      ' float h=snoise(vec3(p*0.32,uTime*0.20))*0.6;',
      ' h+=snoise(vec3(p*0.7+7.0,uTime*0.32))*0.32;',
      ' h+=snoise(vec3(p*1.5,uTime*0.5))*0.16;',
      ' h+=snoise(vec3(p*3.2+3.0,uTime*0.78))*0.07;',
      ' float d=distance(p,uMouse);',
      ' h+=uMouseOn*exp(-d*d*0.32)*sin(d*4.0-uTime*5.5)*1.1;',
      ' return h;',
      '}',
      'void main(){',
      ' vUv=uv;vec3 pos=position;vec2 p=position.xz;',
      ' float h=waveH(p)*uAmp;float e=0.18;',
      ' float hx=waveH(p+vec2(e,0.0))*uAmp;float hz=waveH(p+vec2(0.0,e))*uAmp;',
      ' vec3 tx=vec3(e,hx-h,0.0);vec3 tz=vec3(0.0,hz-h,e);',
      ' vec3 nrm=normalize(cross(tz,tx));',
      ' pos.y+=h;vH=h;',
      ' vec4 mv=modelViewMatrix*vec4(pos,1.0);',
      ' vView=normalize(-mv.xyz);vNormal=normalize(normalMatrix*nrm);',
      ' gl_Position=projectionMatrix*mv;',
      '}'
    ].join('\n'),
    fragmentShader: [
      'uniform vec3 uColorA;uniform vec3 uColorB;uniform vec3 uColorC;uniform vec3 uRim;uniform float uTime;',
      'varying vec3 vNormal;varying vec3 vView;varying vec2 vUv;varying float vH;',
      'void main(){',
      ' vec3 Ld=normalize(vec3(0.35,0.85,0.3));',
      ' float diff=clamp(dot(vNormal,Ld),0.0,1.0);',
      ' vec3 Hh=normalize(Ld+vView);',
      ' float spec=pow(clamp(dot(vNormal,Hh),0.0,1.0),80.0);',
      ' float fres=pow(1.0-clamp(dot(vNormal,vView),0.0,1.0),3.0);',
      ' vec3 grad=mix(uColorA,uColorB,smoothstep(0.0,0.5,vUv.y));',
      ' grad=mix(grad,uColorC,smoothstep(0.5,1.0,vUv.y));',
      ' vec3 col=grad*(0.4+0.6*diff);',
      ' vec3 sky=mix(uColorB,vec3(0.93,0.97,1.0),0.55);',
      ' col=mix(col,sky,fres*0.55);',
      ' col+=spec*vec3(1.0)*1.2;',
      ' col+=uRim*fres*0.5;',
      ' float streak=sin(vUv.y*64.0-uTime*4.0)*0.5+0.5;',
      ' col+=grad*smoothstep(0.8,1.0,streak)*0.16;',
      ' col+=smoothstep(0.42,0.78,vH)*vec3(0.95,0.98,1.0)*0.4;',
      ' float edge=smoothstep(0.0,0.10,vUv.x)*smoothstep(1.0,0.90,vUv.x)*smoothstep(0.0,0.06,vUv.y)*smoothstep(1.0,0.94,vUv.y);',
      ' gl_FragColor=vec4(col,0.95*edge);',
      '}'
    ].join('\n')
  });
  var water = new THREE.Mesh(geo, waterMat);
  scene.add(water);

  // ---- knowledge particles flowing downstream (+z) ----
  var PN = window.innerWidth < 700 ? 120 : 240;
  var pPos = new Float32Array(PN * 3);
  var pSpeed = new Float32Array(PN);
  for (var i = 0; i < PN; i++) {
    pPos[i * 3] = (Math.random() - 0.5) * W * 0.9;
    pPos[i * 3 + 1] = 0.25 + Math.random() * 0.6;
    pPos[i * 3 + 2] = (Math.random() - 0.5) * L;
    pSpeed[i] = 2.2 + Math.random() * 2.6;
  }
  var pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  function sprite() {
    var c = document.createElement('canvas'); c.width = c.height = 64;
    var x = c.getContext('2d'); var g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.3, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c);
  }
  var pMat = new THREE.PointsMaterial({ size: 0.42, map: sprite(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: t.part, opacity: 0.95 });
  var particles = new THREE.Points(pGeo, pMat);
  scene.add(particles);

  // ---- labeled knowledge items: inputs -> ThinkPulse -> outputs (the purpose) ----
  var labelsBox = document.getElementById('riverLabels');
  var cursorEl = document.getElementById('riverCursor');
  var INPUTS = ['Screenshot', 'PDF page', 'Web article', 'Chart', 'Handwriting', 'Code snippet', 'Locked image', 'Exam question'];
  var OUTPUTS = ['Extracted text', 'Summary', 'Answer', 'Explanation', 'Translation', 'Key points', 'Solved', 'Citation'];
  function pick(a) { return a[Math.floor(Math.random() * a.length)]; }
  var ITEMS = [];
  var ITEM_N = window.innerWidth < 700 ? 5 : 7;
  if (labelsBox) {
    for (var li = 0; li < ITEM_N; li++) {
      var sz0 = -L / 2 + Math.random() * L;
      var el = document.createElement('div');
      el.className = 'river-label';
      var kind = sz0 < 0 ? 'in' : 'out';
      el.textContent = kind === 'in' ? pick(INPUTS) : pick(OUTPUTS);
      if (kind === 'out') el.classList.add('out');
      labelsBox.appendChild(el);
      ITEMS.push({ el: el, x: (Math.random() - 0.5) * W * 0.5, z: sz0, spd: 1.8 + Math.random() * 1.5, kind: kind });
    }
  }
  var projV = new THREE.Vector3();
  function updateLabels(dt) {
    if (!labelsBox) return;
    var Wp = host.clientWidth, Hp = host.clientHeight, now = performance.now();
    for (var k = 0; k < ITEMS.length; k++) {
      var it = ITEMS[k];
      // destroy / burst state
      if (it.burst) {
        var bp = (now - it.burst) / 520;
        if (bp >= 1) {
          it.burst = 0; it.z = -L / 2; it.x = (Math.random() - 0.5) * W * 0.5; it.kind = 'in';
          it.el.textContent = pick(INPUTS); it.el.classList.remove('out'); it.el.style.filter = '';
        } else {
          var y2 = 0.5 + Math.sin(now * 0.001 + k) * 0.16;
          projV.set(it.x, y2, it.z).project(camera);
          var bx = (projV.x * 0.5 + 0.5) * Wp, by = (-projV.y * 0.5 + 0.5) * Hp;
          var bsc = (0.68 + (it.z + L / 2) / L * 0.72) * (1 + bp * 1.8);
          it.el.style.transform = 'translate(' + bx.toFixed(1) + 'px,' + by.toFixed(1) + 'px) translate(-50%,-50%) scale(' + bsc.toFixed(2) + ')';
          it.el.style.opacity = (1 - bp).toFixed(2);
          it.el.style.filter = 'brightness(' + (1 + bp * 2.5).toFixed(2) + ') blur(' + (bp * 3).toFixed(1) + 'px)';
          continue;
        }
      }
      it.z += it.spd * dt * (reduce ? 0 : 1);
      if (it.kind === 'in' && it.z >= 0) {
        it.kind = 'out'; it.el.textContent = pick(OUTPUTS);
        it.el.classList.add('out'); it.el.classList.add('pop');
        (function (e) { setTimeout(function () { e.classList.remove('pop'); }, 500); })(it.el);
      }
      if (it.z > L / 2 + 1) {
        it.z = -L / 2; it.x = (Math.random() - 0.5) * W * 0.5; it.kind = 'in';
        it.el.textContent = pick(INPUTS); it.el.classList.remove('out');
      }
      var y = 0.5 + Math.sin(now * 0.001 + k) * 0.16;
      projV.set(it.x, y, it.z).project(camera);
      if (projV.z > 1) { it.el.style.opacity = '0'; it.sx = null; continue; }
      var sx = (projV.x * 0.5 + 0.5) * Wp;
      var sy = (-projV.y * 0.5 + 0.5) * Hp;
      it.sx = sx; it.sy = sy;
      var sc = 0.68 + (it.z + L / 2) / L * 0.72;
      var edge = Math.max(0, Math.min((it.z + L / 2) / 3, (L / 2 - it.z) / 3, 1));
      it.el.style.transform = 'translate(' + sx.toFixed(1) + 'px,' + sy.toFixed(1) + 'px) translate(-50%,-50%) scale(' + sc.toFixed(2) + ')';
      it.el.style.opacity = (0.96 * edge).toFixed(2);
    }
  }

  // ---- interaction (raycast pointer to water plane) ----
  var ray = new THREE.Raycaster();
  var mathPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var hit = new THREE.Vector3();
  var ndc = new THREE.Vector2();
  var targetMouseOn = 0;
  function pointAt(clientX, clientY, r) {
    ndc.x = ((clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ndc, camera);
    return ray.ray.intersectPlane(mathPlane, hit);
  }
  function inBounds(e, r) { return !(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom); }
  window.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    var inside = inBounds(e, r);
    if (cursorEl) {
      if (inside) {
        cursorEl.style.transform = 'translate(' + (e.clientX - r.left) + 'px,' + (e.clientY - r.top) + 'px) translate(-50%,-50%)';
        cursorEl.style.opacity = '1';
      } else { cursorEl.style.opacity = '0'; }
    }
    if (!inside) { targetMouseOn = 0; return; }
    if (pointAt(e.clientX, e.clientY, r)) { waterMat.uniforms.uMouse.value.set(hit.x, hit.z); targetMouseOn = 1; }
  }, { passive: true });
  window.addEventListener('pointerup', function () { targetMouseOn = 0; if (cursorEl) cursorEl.style.opacity = '0'; });
  window.addEventListener('blur', function () { targetMouseOn = 0; if (cursorEl) cursorEl.style.opacity = '0'; });
  // tap / click: destroy the nearest floating label with a burst
  window.addEventListener('pointerdown', function (e) {
    var r = canvas.getBoundingClientRect();
    if (!inBounds(e, r)) return;
    if (pointAt(e.clientX, e.clientY, r)) { waterMat.uniforms.uMouse.value.set(hit.x, hit.z); waterMat.uniforms.uMouseOn.value = 1; targetMouseOn = 1; }
    if (cursorEl && inBounds(e, r)) { cursorEl.style.opacity = '1'; cursorEl.style.transform = 'translate(' + (e.clientX - r.left) + 'px,' + (e.clientY - r.top) + 'px) translate(-50%,-50%)'; }
    var px = e.clientX - r.left, py = e.clientY - r.top, best = null, bd = 78 * 78;
    for (var k = 0; k < ITEMS.length; k++) {
      var it = ITEMS[k];
      if (it.burst || it.sx == null) continue;
      var dx = it.sx - px, dy = it.sy - py, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = it; }
    }
    if (best) best.burst = performance.now();
  }, { passive: true });

  window.addEventListener('tp-theme', function () {
    var c = pal();
    waterMat.uniforms.uColorA.value.set(c.a[0], c.a[1], c.a[2]);
    waterMat.uniforms.uColorB.value.set(c.b[0], c.b[1], c.b[2]);
    waterMat.uniforms.uColorC.value.set(c.c[0], c.c[1], c.c[2]);
    waterMat.uniforms.uRim.value.set(c.rim[0], c.rim[1], c.rim[2]);
    pMat.color.set(c.part);
  });

  // pause when offscreen
  var visible = true;
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }, { threshold: 0.01 }).observe(host);
  }

  // Touch / no-pointer devices: drive the ripple from scrolling (mouse-in on scroll, mouse-out when idle)
  var hoverable = window.matchMedia('(hover: hover)').matches;
  var lastScroll = -9999, prevSY = window.scrollY;
  if (!hoverable) {
    window.addEventListener('scroll', function () {
      lastScroll = performance.now(); prevSY = window.scrollY;
      var rect = host.getBoundingClientRect();
      var prog = 1 - (rect.top + rect.height * 0.5) / window.innerHeight;
      prog = Math.max(0, Math.min(1, prog));
      waterMat.uniforms.uMouse.value.set((prog - 0.5) * W * 0.7, Math.sin(prog * 6.283) * L * 0.3);
    }, { passive: true });
  }

  var last = performance.now();
  function frame(now) {
    requestAnimationFrame(frame);
    if (!visible) { last = now; return; }
    var dt = Math.min((now - last) / 1000, 0.05); last = now;
    if (!reduce) waterMat.uniforms.uTime.value += dt;
    if (!hoverable) targetMouseOn = (now - lastScroll < 700) ? 1 : 0;
    waterMat.uniforms.uMouseOn.value += (targetMouseOn - waterMat.uniforms.uMouseOn.value) * 0.08;

    // flow particles downstream + stir around the cursor
    var arr = pGeo.attributes.position.array;
    var mo = waterMat.uniforms.uMouseOn.value;
    var mx = waterMat.uniforms.uMouse.value.x, mz = waterMat.uniforms.uMouse.value.y;
    for (var i = 0; i < PN; i++) {
      arr[i * 3 + 2] += pSpeed[i] * dt * (reduce ? 0.0 : 1.0);
      arr[i * 3 + 1] = 0.25 + Math.sin(now * 0.001 + i) * 0.18;
      if (mo > 0.1) {
        var dx = arr[i * 3] - mx, dz = arr[i * 3 + 2] - mz, d2 = dx * dx + dz * dz;
        if (d2 < 6) { var f = (1 - d2 / 6) * mo * dt * 5; arr[i * 3] += dx * f; arr[i * 3 + 2] += dz * f; }
      }
      if (arr[i * 3 + 2] > L / 2) { arr[i * 3 + 2] = -L / 2; arr[i * 3] = (Math.random() - 0.5) * W * 0.9; }
      if (arr[i * 3] > W / 2) arr[i * 3] = W / 2; else if (arr[i * 3] < -W / 2) arr[i * 3] = -W / 2;
    }
    pGeo.attributes.position.needsUpdate = true;
    updateLabels(dt);

    // mobile: show the glowing cursor at the scroll-driven ripple point
    if (!hoverable && cursorEl) {
      var moNow = waterMat.uniforms.uMouseOn.value;
      if (moNow > 0.05) {
        projV.set(waterMat.uniforms.uMouse.value.x, 0.3, waterMat.uniforms.uMouse.value.y).project(camera);
        cursorEl.style.transform = 'translate(' + ((projV.x * 0.5 + 0.5) * host.clientWidth).toFixed(0) + 'px,' + ((-projV.y * 0.5 + 0.5) * host.clientHeight).toFixed(0) + 'px) translate(-50%,-50%)';
        cursorEl.style.opacity = moNow.toFixed(2);
      } else { cursorEl.style.opacity = '0'; }
    }

    // gentle camera parallax toward pointer
    camera.position.x += ((waterMat.uniforms.uMouse.value.x * 0.12) - camera.position.x) * 0.04;
    camera.lookAt(0, 0.1, -1.5);

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function onResize() {
    var s = size();
    camera.aspect = s.w / s.h; camera.updateProjectionMatrix();
    renderer.setSize(s.w, s.h, false);
  }
  window.addEventListener('resize', onResize);
  if ('ResizeObserver' in window) { new ResizeObserver(onResize).observe(host); }
})();
