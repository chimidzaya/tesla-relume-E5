/* ==========================================================
   Model 3 — motion & effects
   One rAF loop drives springs, Lenis, canvases and scroll FX.
   ========================================================== */
(() => {
  'use strict';

  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const isPhone = () => innerWidth < 768;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const css = getComputedStyle(root);
  const token = name => css.getPropertyValue(name).trim();
  const SVG_NS = 'http://www.w3.org/2000/svg';

  /* ---------- Springs (mass 1) ---------- */
  const CFG = {
    REVEAL: [90, 26], ITEM: [170, 24], SHEET: [190, 26], FIGURE: [200, 24],
    TYPE: [210, 24], YEAR: [190, 24], COPY: [110, 26], VEIL: [70, 24]
  };

  const active = new Set();
  const pending = [];
  const tickers = new Set();

  class Spring {
    constructor(cfg, from, onChange) {
      this.k = cfg[0];
      this.c = cfg[1];
      this.x = from;
      this.v = 0;
      this.target = from;
      this.onChange = onChange;
      if (onChange) onChange(from);
    }
    to(target, delay = 0) {
      if (reduced) return this.set(target);
      if (delay > 0) {
        pending.push({ at: performance.now() + delay, spring: this, target });
      } else {
        this.target = target;
        active.add(this);
      }
      return this;
    }
    set(target) {
      this.x = this.target = target;
      this.v = 0;
      active.delete(this);
      if (this.onChange) this.onChange(target);
      return this;
    }
    integrate(h) {
      const a = -this.k * (this.x - this.target) - this.c * this.v;
      this.v += a * h;
      this.x += this.v * h;
    }
    settle() {
      if (Math.abs(this.x - this.target) < 1e-4 && Math.abs(this.v) < 1e-4) {
        this.x = this.target;
        this.v = 0;
        active.delete(this);
      }
      if (this.onChange) this.onChange(this.x);
    }
  }

  /* ---------- Lenis ---------- */
  let lenis = null;
  if (!reduced && typeof window.Lenis === 'function') {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
  }

  /* ---------- The single rAF loop ---------- */
  let last = performance.now();
  function frame(t) {
    const dt = clamp((t - last) / 1000, 0, 1 / 30);
    last = t;

    for (let i = pending.length - 1; i >= 0; i--) {
      if (pending[i].at <= t) {
        const { spring, target } = pending[i];
        pending.splice(i, 1);
        spring.target = target;
        active.add(spring);
      }
    }

    if (active.size) {
      const steps = Math.max(1, Math.ceil(dt * 240));
      const h = dt / steps;
      active.forEach(s => {
        for (let i = 0; i < steps; i++) s.integrate(h);
        s.settle();
      });
    }

    if (lenis) lenis.raf(t);
    tickers.forEach(fn => fn(t, dt));
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ---------- Decorative injections ---------- */
  const ARROW = '<svg class="arrow" viewBox="0 0 13.7071 10.7071" aria-hidden="true" focusable="false"><path d="M0 5.35H13M8 10.35L13 5.35L8 0.35" fill="none" stroke="currentColor"/></svg>';
  document.querySelectorAll('.cut-btn, .navbar__cta').forEach(el => el.insertAdjacentHTML('beforeend', ARROW));

  const CORNER = '<path d="M0 0.5H10V10.5" fill="none" stroke="currentColor"/>';
  document.querySelectorAll('.bracket').forEach(el => {
    ['tl', 'tr', 'br', 'bl'].forEach(p => {
      el.insertAdjacentHTML('beforeend',
        `<svg class="bracket__c bracket__c--${p}" viewBox="0 0 10.5 10.5" aria-hidden="true" focusable="false">${CORNER}</svg>`);
    });
  });

  /* Image plates: rounded corners + stepped notch bottom-centre */
  function platePath(w, h, o = 0) {
    const r = 6, cx = w / 2 + o, nw = Math.min(w * 0.3, 180);
    const xa = cx + nw / 2, xb = cx + nw / 4, ya = h - 5 + o, yb = h - 10 + o;
    const L = o, T = o, R = w + o, B = h + o;
    return [
      `M${L + r} ${T}`, `H${R - r}`, `Q${R} ${T} ${R} ${T + r}`, `V${B - r}`, `Q${R} ${B} ${R - r} ${B}`,
      `H${xa}`, `L${xa - 5} ${ya}`, `H${xb + 5}`, `L${xb} ${yb}`,
      `H${2 * cx - xb}`, `L${2 * cx - xb - 5} ${ya}`, `H${2 * cx - xa + 5}`, `L${2 * cx - xa} ${B}`,
      `H${L + r}`, `Q${L} ${B} ${L} ${B - r}`, `V${T + r}`, `Q${L} ${T} ${L + r} ${T}`, 'Z'
    ].join('');
  }

  document.querySelectorAll('.plate').forEach(plate => {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('class', 'plate__svg');
    svg.setAttribute('aria-hidden', 'true');
    const fill = document.createElementNS(SVG_NS, 'path');
    fill.setAttribute('class', 'plate__fill');
    const outline = document.createElementNS(SVG_NS, 'path');
    outline.setAttribute('class', 'plate__outline');
    outline.setAttribute('vector-effect', 'non-scaling-stroke');
    svg.append(fill, outline);
    plate.prepend(svg);
    new ResizeObserver(() => {
      const w = plate.clientWidth, h = plate.clientHeight;
      if (!w || !h) return;
      svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
      svg.setAttribute('width', w);
      svg.setAttribute('height', h);
      fill.setAttribute('d', platePath(w, h));
      outline.setAttribute('d', platePath(w - 1, h - 1, 0.5));
    }).observe(plate);
  });

  /* ---------- Text splitting (screen-reader copy kept) ---------- */
  function split(el, mode) {
    if (el._units) return el._units;
    const sr = document.createElement('span');
    sr.className = 'visually-hidden';
    sr.textContent = el.textContent.replace(/\s+/g, ' ').trim();
    const vis = document.createElement('span');
    vis.className = 'split-text';
    vis.setAttribute('aria-hidden', 'true');
    while (el.firstChild) vis.appendChild(el.firstChild);
    el.append(sr, vis);

    const units = [];
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(part => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); return; }
            const pieces = mode === 'chars' ? [...part] : [part];
            pieces.forEach(p => {
              const s = document.createElement('span');
              s.className = 'u';
              s.textContent = p;
              frag.appendChild(s);
              units.push(s);
            });
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) {
          walk(n);
        }
      });
    };
    walk(vis);
    el._units = units;
    return units;
  }

  /* Section headings: two balanced lines */
  function twoLines(el) {
    const units = el._units;
    if (!units || units.length < 2) return;
    const total = units.reduce((n, u) => n + u.textContent.length, 0);
    let acc = 0, best = 1, bestDiff = Infinity;
    for (let i = 1; i < units.length; i++) {
      acc += units[i - 1].textContent.length;
      const diff = Math.abs(acc - total / 2);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    }
    units[best].before(document.createElement('br'));
  }

  /* ---------- Reveal builders (return a run(delay) fn) ---------- */
  const unitStyle = (u, dist) => x => {
    u.style.opacity = x;
    u.style.transform = `translateY(${((1 - x) * dist).toFixed(4)}em)`;
  };

  function words(el, cfg, stagger, onLast) {
    const springs = split(el, 'words').map((u, i, arr) => new Spring(cfg, 0, x => {
      unitStyle(u, 0.35)(x);
      if (onLast && i === arr.length - 1) onLast(x);
    }));
    return delay => springs.forEach((s, i) => s.to(1, delay + i * stagger));
  }

  function chars(el, stagger = 24) {
    const springs = split(el, 'chars').map(u => new Spring(CFG.TYPE, 0, unitStyle(u, 0.3)));
    return delay => springs.forEach((s, i) => s.to(1, delay + i * stagger));
  }

  function block(el, cfg = CFG.REVEAL) {
    const s = new Spring(cfg, 0, x => {
      const done = x >= 1;
      el.style.opacity = done ? '' : x;
      el.style.transform = done ? '' : `translateY(${((1 - x) * 0.75).toFixed(4)}rem)`;
    });
    return delay => s.to(1, delay);
  }

  function line(el, cfg = CFG.REVEAL) {
    const s = new Spring(cfg, 0, x => el.style.setProperty('--draw', x.toFixed(4)));
    return delay => s.to(1, delay);
  }

  function row(el) {
    const s = new Spring(CFG.ITEM, 0, x => {
      el.style.opacity = x;
      el.style.setProperty('--draw', x.toFixed(4));
    });
    return delay => s.to(1, delay);
  }

  /* Viewport-triggered reveals, staggered per batch */
  const io = new IntersectionObserver(entries => {
    const hits = entries.filter(e => e.isIntersecting).map(e => e.target);
    hits.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
    const counters = new Map();
    hits.forEach(el => {
      io.unobserve(el);
      el._reveals.forEach(r => {
        const n = counters.get(r.group) || 0;
        counters.set(r.group, n + 1);
        r.run(r.delay + n * r.stagger);
      });
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });

  function onView(el, run, { delay = 0, stagger = 0, group = 'default' } = {}) {
    if (!el) return;
    (el._reveals = el._reveals || []).push({ run, delay, stagger, group });
    io.observe(el);
  }

  const $$ = (sel, scope = document) => [...scope.querySelectorAll(sel)];

  /* ---------- Hero (sequenced after the veil) ---------- */
  const hero = document.querySelector('.m3-hero');
  const heroRuns = [];
  const navbar = document.querySelector('.navbar');
  heroRuns.push([block(navbar), 0]);
  heroRuns.push([block(hero.querySelector('.tagline')), 180]);
  heroRuns.push([words(hero.querySelector('.m3-hero__title'), CFG.TYPE, 110), 180]);
  heroRuns.push([words(hero.querySelector('.meta-row'), CFG.COPY, 32), 420]);
  $$('.hero-stats .stat', hero).forEach((el, i) => {
    heroRuns.push([block(el, CFG.ITEM), 900 + i * 120]);
    heroRuns.push([chars(el.querySelector('dd')), 980 + i * 120]);
  });
  $$('.m3-hero__actions .cut-btn', hero).forEach((el, i) => heroRuns.push([block(el, CFG.ITEM), 1500 + i * 100]));
  const startHero = () => heroRuns.forEach(([run, d]) => run(d));

  /* ---------- Everything below the hero ---------- */
  $$('.section-header, .split__text, .band__inner, .cta__content').forEach(scope => {
    const tag = scope.querySelector(':scope > .tagline');
    if (tag) onView(tag, block(tag));
  });

  $$('.h2').forEach(h => {
    const run = words(h, CFG.TYPE, 110, x => h.style.setProperty('--dot', x.toFixed(3)));
    twoLines(h);
    h.style.setProperty('--dot', 0);
    onView(h, run, { delay: 60 });
  });

  $$('.section-header').forEach(el => onView(el, line(el), { delay: 260 }));

  $$('.h3, .card-title, .panel-title').forEach(el => onView(el, words(el, CFG.TYPE, 110), { delay: 80 }));

  $$('.text-medium:not(.meta-row), .feature p, .connect-card p, .trim-card__price, .note').forEach(el =>
    onView(el, words(el, CFG.COPY, 32), { delay: 140 }));

  $$('.trim-card, .feature, .connect-card').forEach(el =>
    onView(el, block(el, CFG.ITEM), { stagger: 90, group: 'cards' }));

  $$('.split > .plate').forEach(el => onView(el, block(el)));

  $$('.stat-plate').forEach(el => {
    onView(el, block(el, CFG.ITEM), { delay: 120, stagger: 70, group: 'plates' });
    onView(el, chars(el.querySelector('strong')), { delay: 200, stagger: 70, group: 'plateChars' });
  });

  $$('.check-list li').forEach(el => onView(el, block(el, CFG.ITEM), { stagger: 90, group: 'checks' }));

  $$('.spec-table tr').forEach(el => onView(el, row(el), { stagger: 40, group: 'rows' }));

  $$('.cta .cut-btn').forEach(el => onView(el, block(el, CFG.ITEM), { delay: 300, stagger: 100, group: 'ctas' }));

  $$('.footnotes li').forEach(el => onView(el, block(el, CFG.ITEM), { stagger: 60, group: 'notes' }));

  /* ---------- Loading veil ---------- */
  const veil = document.querySelector('.veil');
  function runVeil(done) {
    if (!veil || reduced) {
      if (veil) veil.remove();
      done();
      return;
    }
    const fill = veil.querySelector('.veil__fill');
    const meter = veil.querySelector('.veil__meter span');
    let loaded = document.readyState === 'complete';
    addEventListener('load', () => { loaded = true; });
    setTimeout(() => { loaded = true; }, 6000);

    if (lenis) lenis.stop();
    root.style.overflow = 'hidden';

    let p = 0;
    const tick = (t, dt) => {
      const target = loaded ? 1 : 0.7;
      const rate = loaded ? 4 : 0.6;
      p += (target - p) * Math.min(1, rate * dt);
      if (loaded && p > 0.995) p = 1;
      fill.setAttribute('height', (35 * p).toFixed(2));
      meter.style.transform = `scaleX(${p.toFixed(4)})`;
      if (p === 1) {
        tickers.delete(tick);
        const lift = new Spring(CFG.VEIL, 0, x => {
          veil.style.transform = `translateY(${(-x * 100).toFixed(3)}%)`;
          if (x > 0.995 && veil.isConnected) veil.remove();
        });
        lift.to(1);
        root.style.overflow = '';
        if (lenis) lenis.start();
        done();
      }
    };
    tickers.add(tick);
  }
  runVeil(startHero);

  /* ---------- Hero cursor parallax ---------- */
  const media = hero.querySelector('.m3-hero__media');
  if (!reduced && matchMedia('(pointer: fine)').matches) {
    const px = new Spring(CFG.FIGURE, 0, null);
    const py = new Spring(CFG.FIGURE, 0, null);
    const apply = () => { media.style.transform = `translate3d(${px.x.toFixed(2)}px, ${py.x.toFixed(2)}px, 0)`; };
    px.onChange = apply;
    py.onChange = apply;
    hero.addEventListener('pointermove', e => {
      px.to((e.clientX / innerWidth - 0.5) * -18);
      py.to((e.clientY / innerHeight - 0.5) * -12);
    });
    hero.addEventListener('pointerleave', () => { px.to(0); py.to(0); });
  }

  /* ---------- Sticky stack ---------- */
  const stack = $$('[data-stack]').map(sec => ({
    sec,
    inner: sec.querySelector('.stack-inner'),
    shade: sec.querySelector('.stack-shade'),
    top: 0
  }));

  function layoutStack() {
    stack.forEach(s => {
      s.top = Math.min(0, innerHeight - s.sec.offsetHeight);
      s.sec.style.top = `${s.top}px`;
    });
  }
  layoutStack();
  addEventListener('resize', layoutStack);
  new ResizeObserver(layoutStack).observe(document.body);

  tickers.add(() => {
    stack.forEach(s => {
      const next = s.sec.nextElementSibling;
      if (!next) return;
      const p = clamp((innerHeight - next.getBoundingClientRect().top) / innerHeight, 0, 1);
      s.shade.style.opacity = (0.55 * p).toFixed(3);
      if (!reduced && !isPhone() && p > 0) {
        s.inner.style.transformOrigin = `50% ${(-s.top + innerHeight / 2).toFixed(1)}px`;
        s.inner.style.transform = `scale(${(1 - 0.1 * p).toFixed(4)})`;
      } else {
        s.inner.style.transform = '';
      }
    });
  });

  /* ---------- Shared canvas helper ---------- */
  function canvasLayer(canvas, draw, { interval = 0, continuous = true } = {}) {
    const ctx = canvas.getContext('2d');
    const state = { ctx, w: 0, h: 0, dpr: 1, visible: false, lastDraw: -1e9 };
    const resize = () => {
      state.dpr = Math.min(devicePixelRatio || 1, 2);
      state.w = canvas.clientWidth;
      state.h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(state.w * state.dpr));
      canvas.height = Math.max(1, Math.round(state.h * state.dpr));
      ctx.setTransform(state.dpr, 0, 0, state.dpr, 0, 0);
      state.lastDraw = -1e9;
      if (reduced || !continuous) draw(state, 0);
    };
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver(([e]) => { state.visible = e.isIntersecting; }).observe(canvas);
    resize();
    if (!reduced && continuous) {
      tickers.add(t => {
        if (!state.visible || t - state.lastDraw < interval) return;
        state.lastDraw = t;
        draw(state, t);
      });
    }
    return state;
  }

  /* ---------- Contour lines (marching squares) ---------- */
  const SEGMENTS = {
    1: [[3, 2]], 2: [[2, 1]], 3: [[3, 1]], 4: [[0, 1]], 5: [[3, 2], [0, 1]], 6: [[0, 2]], 7: [[3, 0]],
    8: [[3, 0]], 9: [[0, 2]], 10: [[3, 0], [2, 1]], 11: [[0, 1]], 12: [[3, 1]], 13: [[2, 1]], 14: [[3, 2]]
  };
  const LINE_SCALE = 3.8, LINE_COUNT = 2.5, WAVE = 0.37, SPEED = 1.66, CELLS = 96;

  function field(x, y, s) {
    const u = x * LINE_SCALE, v = y * LINE_SCALE;
    return (
      Math.sin(u * 1.0 + s) +
      Math.sin(v * 1.27 - s * 0.83) +
      Math.sin(u * 0.71 + v * 0.53 + s * 1.21) +
      Math.sin(Math.hypot(u - 1.9, v - 1.2) * WAVE * 3.1 - s * 0.6)
    ) / 4;
  }

  $$('canvas.contour').forEach(canvas => {
    const color = canvas.dataset.tone === 'light' ? token('--contour-light') : token('--contour-dark');
    canvasLayer(canvas, ({ ctx, w, h }, t) => {
      ctx.clearRect(0, 0, w, h);
      if (!w || !h) return;
      const cs = w / CELLS, cols = CELLS, rows = Math.ceil(h / cs);
      const s = (t / 1000) * SPEED * 0.12;
      const stride = cols + 1;
      const vals = new Float32Array(stride * (rows + 1));
      for (let j = 0; j <= rows; j++) {
        for (let i = 0; i <= cols; i++) vals[j * stride + i] = field(i / CELLS, j / CELLS, s) * LINE_COUNT;
      }
      ctx.beginPath();
      for (let j = 0; j < rows; j++) {
        for (let i = 0; i < cols; i++) {
          const a = vals[j * stride + i], b = vals[j * stride + i + 1];
          const c = vals[(j + 1) * stride + i + 1], d = vals[(j + 1) * stride + i];
          const lo = Math.ceil(Math.min(a, b, c, d)), hi = Math.floor(Math.max(a, b, c, d));
          for (let k = lo; k <= hi; k++) {
            const idx = (a >= k ? 8 : 0) | (b >= k ? 4 : 0) | (c >= k ? 2 : 0) | (d >= k ? 1 : 0);
            const segs = SEGMENTS[idx];
            if (!segs) continue;
            const edge = e => {
              switch (e) {
                case 0: return [i + (k - a) / (b - a), j];
                case 1: return [i + 1, j + (k - b) / (c - b)];
                case 2: return [i + (k - d) / (c - d), j + 1];
                default: return [i, j + (k - a) / (d - a)];
              }
            };
            segs.forEach(([e1, e2]) => {
              const p1 = edge(e1), p2 = edge(e2);
              ctx.moveTo(p1[0] * cs, p1[1] * cs);
              ctx.lineTo(p2[0] * cs, p2[1] * cs);
            });
          }
        }
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 1;
      ctx.stroke();
    }, { interval: 24 });
  });

  /* ---------- Checkerboard seams ---------- */
  const hash = (i, j, seed) => {
    const x = Math.sin(i * 127.1 + j * 311.7 + seed * 74.7) * 43758.5453;
    return x - Math.floor(x);
  };

  $$('.seam').forEach(seam => {
    const canvas = seam.querySelector('canvas');
    const from = seam.dataset.from === 'dark' ? token('--surface-black') : token('--background');
    const accent = token('--accent');
    let lastS = -1;
    const draw = ({ ctx, w, h }) => {
      const s = reduced ? 0 : clamp(1 - seam.getBoundingClientRect().top / innerHeight, 0, 1);
      if (Math.abs(s - lastS) < 0.001) return;
      lastS = s;
      ctx.clearRect(0, 0, w, h);
      const size = 24, cols = Math.ceil(w / size), rows = Math.ceil(h / size);
      for (let j = 0; j < rows; j++) {
        const y = j / rows;
        const yy = y < 0.16 ? 0 : (y - 0.16) / 0.84;
        for (let i = 0; i < cols; i++) {
          const parity = (i + j) & 1;
          const base = yy === 0 ? 1 : (1 - yy) * (parity ? 1 : 0.55);
          const life = base * (0.6 + 0.4 * hash(i, j, 1));
          if (life <= 0.12 + s) continue;
          ctx.fillStyle = hash(i, j, 2) < 0.06 ? accent : from;
          ctx.fillRect(i * size, j * size, size, size);
        }
      }
    };
    const state = canvasLayer(canvas, (st) => { lastS = -1; draw(st); }, { continuous: false });
    if (!reduced) tickers.add(() => { if (state.visible) draw(state); });
  });

  /* ---------- Dot grid (dark section) ---------- */
  $$('canvas.dotgrid').forEach(canvas => {
    const grid = token('--grid-line');
    const accent = token('--accent');
    canvasLayer(canvas, ({ ctx, w, h }, t) => {
      ctx.clearRect(0, 0, w, h);
      const cx = w / 2, cy = h / 2, gap = 96;
      ctx.lineWidth = 1;
      ctx.strokeStyle = grid;
      ctx.setLineDash([12.15, 8.35]);
      ctx.lineDashOffset = -((t % 7000) / 7000) * 20.5;
      ctx.beginPath();
      for (let x = cx % gap; x < w; x += gap) { ctx.moveTo(x + 0.5, 0); ctx.lineTo(x + 0.5, h); }
      for (let y = cy % gap; y < h; y += gap) { ctx.moveTo(0, y + 0.5); ctx.lineTo(w, y + 0.5); }
      ctx.globalAlpha = 0.45;
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);

      ctx.fillStyle = grid;
      for (let x = cx % gap; x < w; x += gap) {
        for (let y = cy % gap; y < h; y += gap) ctx.fillRect(x - 1, y - 1, 2, 2);
      }

      ctx.beginPath();
      [80, 160, 240].forEach(r => { ctx.moveTo(cx + r, cy); ctx.arc(cx, cy, r, 0, Math.PI * 2); });
      ctx.strokeStyle = grid;
      ctx.stroke();

      if (!reduced) {
        const ph = (t % 4200) / 4200;
        ctx.beginPath();
        ctx.arc(cx, cy, 24 + ph * 240, 0, Math.PI * 2);
        ctx.strokeStyle = accent;
        ctx.globalAlpha = (1 - ph) * 0.8;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }, { interval: 24 });
  });

  /* ---------- Dashed connector + pulse ---------- */
  $$('.check-list').forEach(list => {
    const first = list.querySelector('li');
    if (!first) return;
    first.classList.add('is-active');
    const ring = document.createElement('span');
    ring.className = 'pulse';
    ring.setAttribute('aria-hidden', 'true');
    first.appendChild(ring);
    if (reduced) return;
    tickers.add(t => {
      list.style.setProperty('--crawl', `${(((t % 5200) / 5200) * 11.45).toFixed(2)}px`);
      const ph = (t % 3200) / 3200;
      ring.style.transform = `scale(${(1 + ph * 1.8).toFixed(3)})`;
      ring.style.opacity = ((1 - ph) * 0.8).toFixed(3);
    });
  });

  /* ---------- Mobile menu ---------- */
  const toggle = document.querySelector('.menu-toggle');
  const sheet = document.createElement('div');
  sheet.className = 'sheet';
  sheet.id = 'mobile-menu';
  sheet.hidden = true;
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.setAttribute('aria-label', toggle.getAttribute('aria-label'));
  const sheetNav = document.querySelector('.navbar__links').cloneNode(true);
  sheetNav.className = 'sheet__nav';
  sheet.appendChild(sheetNav);
  navbar.after(sheet);

  let menuOpen = false;
  const sheetSpring = new Spring(CFG.SHEET, 0, x => {
    sheet.style.opacity = x;
    sheet.style.transform = `translateY(${((1 - x) * -2).toFixed(3)}%)`;
    if (x < 0.01 && !menuOpen) sheet.hidden = true;
  });
  const itemSprings = [...sheetNav.children].map(el => new Spring(CFG.ITEM, 0, x => {
    el.style.opacity = x;
    el.style.transform = `translateY(${((1 - x) * 0.35).toFixed(4)}em)`;
  }));

  function openMenu() {
    menuOpen = true;
    sheet.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    root.style.overflow = 'hidden';
    if (lenis) lenis.stop();
    sheetSpring.to(1);
    itemSprings.forEach((s, i) => { s.set(0); s.to(1, 120 + i * 55); });
    const firstLink = sheetNav.querySelector('a, button');
    if (firstLink) firstLink.focus({ preventScroll: true });
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    toggle.setAttribute('aria-expanded', 'false');
    root.style.overflow = '';
    if (lenis) lenis.start();
    sheetSpring.to(0);
    if (reduced) sheet.hidden = true;
    toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => (menuOpen ? closeMenu() : openMenu()));
  addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
  sheetNav.addEventListener('click', e => { if (e.target.closest('a')) closeMenu(); });
  addEventListener('resize', () => { if (innerWidth >= 1024) closeMenu(); });

  /* ---------- In-page anchors (flow position, not stuck position) ---------- */
  function flowTop(el) {
    let y = 0, node = el;
    while (node && node.parentElement !== document.querySelector('main')) node = node.parentElement;
    if (!node) return el.getBoundingClientRect().top + scrollY;
    for (let n = node.previousElementSibling; n; n = n.previousElementSibling) y += n.offsetHeight;
    return y + node.parentElement.offsetTop;
  }

  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const target = document.querySelector(id);
    if (!target) return;
    e.preventDefault();
    closeMenu();
    const y = flowTop(target);
    if (lenis) lenis.scrollTo(y);
    else scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
  });
})();
