(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var isTouch = window.matchMedia('(max-width:900px)').matches;

  /* ---------- Launch loader (every refresh) ---------- */
  (function () {
    var loader = document.getElementById('loader');
    if (!loader) return;
    if (reduce) { loader.style.display = 'none'; return; }
    document.documentElement.classList.add('loading');
    var box = document.getElementById('ldrParticles');
    if (box) {
      var colors = ['#7c83ff', '#22d3ee', '#2dd4bf', '#ffffff'];
      var n = window.innerWidth < 700 ? 20 : 34;
      var reach = Math.max(window.innerWidth, window.innerHeight) * 0.6;
      for (var i = 0; i < n; i++) {
        var dot = document.createElement('i');
        var ang = (Math.PI * 2 * i) / n + Math.random() * 0.3;
        var dist = 240 + Math.random() * reach;
        dot.style.setProperty('--x', (Math.cos(ang) * dist).toFixed(0) + 'px');
        dot.style.setProperty('--y', (Math.sin(ang) * dist).toFixed(0) + 'px');
        dot.style.color = colors[i % colors.length];
        dot.style.animationDelay = (1.95 + Math.random() * 0.12).toFixed(2) + 's';
        box.appendChild(dot);
      }
    }
    var pct = document.getElementById('ldrPct');
    if (pct) {
      var t0 = performance.now(), dur = 1850;
      (function tick(now) {
        var p = Math.min(((now || t0) - t0) / dur, 1);
        var eased = 1 - Math.pow(1 - p, 2);
        pct.textContent = Math.round(eased * 100);
        loader.style.setProperty('--p', eased.toFixed(3));
        if (p < 1) requestAnimationFrame(tick);
      })(t0);
    }
    setTimeout(function () {
      document.documentElement.classList.remove('loading');
      if (loader.parentNode) loader.parentNode.removeChild(loader);
    }, 3050);
  })();

  /* ---------- Year ---------- */
  var y = document.getElementById('year');
  if (y) y.textContent = new Date().getFullYear();

  /* ---------- Magnetic buttons (subtle, clamped) ---------- */
  if (!isTouch && !reduce) {
    document.querySelectorAll('[data-magnetic]').forEach(function (el) {
      var raf = null;
      function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }
      el.style.transition = 'transform .3s cubic-bezier(.2,.8,.2,1)';
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var x = clamp((e.clientX - r.left - r.width / 2) * 0.12, 7);
        var yy = clamp((e.clientY - r.top - r.height / 2) * 0.16, 7);
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + yy.toFixed(1) + 'px)';
        });
      });
      el.addEventListener('mouseleave', function () {
        if (raf) cancelAnimationFrame(raf);
        el.style.transform = '';
      });
    });
  }

  /* ---------- 3D tilt cards ---------- */
  if (!isTouch && !reduce) {
    document.querySelectorAll('[data-tilt]').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = 'perspective(900px) rotateY(' + px * 9 + 'deg) rotateX(' + (-py * 9) + 'deg) translateZ(6px)';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transform = 'perspective(900px) rotateY(0) rotateX(0)';
      });
    });
  }

  /* ---------- Directional reveal variants (less uniform / less "AI") ---------- */
  function addVariant(sel, cls) {
    document.querySelectorAll(sel).forEach(function (el) {
      if (!el.className.match(/\bfrom-(left|right|scale|up)\b/)) el.classList.add(cls);
    });
  }
  addVariant('.owner-card', 'from-left');
  addVariant('.owner-body', 'from-right');
  addVariant('.show-window', 'from-left');
  addVariant('.show-points', 'from-right');
  addVariant('.models-hub', 'from-scale');
  addVariant('.models-flow', 'from-up');
  document.querySelectorAll('.feature-grid .feature-card').forEach(function (el, i) {
    if (el.classList.contains('big')) return;
    el.classList.add(i % 2 === 0 ? 'from-left' : 'from-right');
  });
  document.querySelectorAll('.steps .step').forEach(function (el) { el.classList.add('from-up'); });

  /* ---------- Scroll reveal (re-triggers on scroll up AND down) ---------- */
  var revealEls = document.querySelectorAll('.reveal,[data-reveal]');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          var d = en.target.getAttribute('data-delay');
          en.target.style.transitionDelay = (d ? d : 0) + 'ms';
          en.target.classList.add('in');
        } else {
          en.target.style.transitionDelay = '0ms';
          en.target.classList.remove('in');
        }
      });
    }, { threshold: 0.16, rootMargin: '0px 0px -12% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- Nav scrolled + scroll progress + parallax + scroll-cue ---------- */
  var nav = document.getElementById('nav');
  var prog = document.getElementById('scrollProgress');
  var scrollCue = document.querySelector('.scroll-cue');
  var parallaxEls = reduce ? [] : document.querySelectorAll('[data-parallax]');
  var ticking = false;
  function applyScroll() {
    var s = window.scrollY || document.documentElement.scrollTop;
    if (nav) nav.classList.toggle('scrolled', s > 24);
    if (prog) {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (h > 0 ? (s / h) * 100 : 0) + '%';
    }
    if (scrollCue) scrollCue.classList.toggle('hide', s > 200);
    if (parallaxEls.length) {
      parallaxEls.forEach(function (el) {
        var rate = parseFloat(el.getAttribute('data-parallax')) || 0.05;
        el.style.transform = 'translate3d(0,' + (s * rate * -1).toFixed(1) + 'px,0)';
      });
    }
    ticking = false;
  }
  function onScroll() {
    if (!ticking) { window.requestAnimationFrame(applyScroll); ticking = true; }
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  applyScroll();

  /* ---------- Theme toggle ---------- */
  var toggle = document.getElementById('themeToggle');
  var saved = localStorage.getItem('tp-theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);
  if (toggle) toggle.addEventListener('click', function () {
    var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    var cur = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', cur);
    localStorage.setItem('tp-theme', cur);
    window.dispatchEvent(new CustomEvent('tp-theme', { detail: cur }));
  });

  /* ---------- Burger / mobile menu ---------- */
  var burger = document.getElementById('burger');
  var links = document.getElementById('navLinks');
  if (burger && links) {
    function setMenu(open) {
      links.classList.toggle('open', open);
      burger.classList.toggle('open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    burger.addEventListener('click', function (e) {
      e.stopPropagation();
      setMenu(!links.classList.contains('open'));
    });
    links.querySelectorAll('a').forEach(function (a) {
      a.addEventListener('click', function () { setMenu(false); });
    });
    document.addEventListener('click', function (e) {
      if (links.classList.contains('open') && !links.contains(e.target) && !burger.contains(e.target)) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && links.classList.contains('open')) setMenu(false);
    });
  }

  /* ---------- Animated counters ---------- */
  var counters = document.querySelectorAll('[data-count]');
  function runCount(el) {
    var target = parseFloat(el.getAttribute('data-count'));
    var dur = 1400, start = 0, t0 = null;
    function tick(t) {
      if (!t0) t0 = t;
      var p = Math.min((t - t0) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased).toString();
      if (p < 1) requestAnimationFrame(tick);
      else el.textContent = target.toString();
    }
    requestAnimationFrame(tick);
  }
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); cio.unobserve(en.target); } });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else { counters.forEach(runCount); }

  /* ---------- Floating badges parallax ---------- */
  if (!isTouch && !reduce) {
    var floats = document.querySelectorAll('[data-float]');
    var orb = document.getElementById('orbWrap');
    if (orb && floats.length) {
      orb.addEventListener('mousemove', function (e) {
        var r = orb.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        floats.forEach(function (f, i) {
          var depth = (i + 1) * 10;
          f.style.transform = 'translate(' + px * depth + 'px,' + py * depth + 'px)';
        });
      });
      orb.addEventListener('mouseleave', function () {
        floats.forEach(function (f) { f.style.transform = ''; });
      });
    }
  }
})();
