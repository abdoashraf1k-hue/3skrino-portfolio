/*
 * dc-lite.js: a tiny runtime that plays the 3SKRINO hero files outside Claude Design.
 * It understands the subset the heroes use: {{holes}}, <sc-if>, <sc-for>, on* events,
 * a DCLogic class with state / setState / lifecycle, and it scales the 1440x810 hero
 * to the viewport.
 *
 * Portrait: a hero may also ship <template id="dc-template-portrait">, used whenever the
 * viewport is taller than ~wide (phones, tablets held upright). It is laid out on a canvas
 * 844px tall and 390-640px wide (fluid in width), scaled to fit. The component sees
 * this.mode ('portrait' | 'landscape'); <html data-mode> mirrors it for CSS.
 * Touch: drags, device tilt and an idle drift drive the template's onMouseMove handler
 * (see "Touch + motion" below). prefers-reduced-motion turns the drift and tilt off.
 *
 * URL options (all optional):
 *   ?fit=cover    fill the viewport, crop the overflow (default)
 *   ?fit=contain  show the whole hero, letterboxed
 *   ?fit=width    scale to the viewport width only
 *   ?nav=0        hide the hero's own top navigation (use when the site has its own nav)
 *
 * Inside an iframe, clicks on links like href="#showreel" are sent to the parent page as
 *   window.postMessage({ type: '3skrino-hero-nav', href: '#showreel' })
 * so the host site decides where they go. Mouse-wheel scrolling over the hero is sent as
 *   { type: '3skrino-hero-wheel', deltaY, deltaX } so the host page can keep scrolling.
 */
(function () {
  'use strict';

  class DCLogic {
    constructor(props) { this.props = props || {}; this.state = {}; }
    setState(patch) {
      const next = typeof patch === 'function' ? patch(this.state, this.props) : patch;
      this.state = Object.assign({}, this.state, next);
      if (this.__schedule) this.__schedule();
    }
    forceUpdate() { if (this.__schedule) this.__schedule(); }
  }
  window.DCLogic = DCLogic;

  const HOLE = /\{\{\s*([^}]+?)\s*\}\}/g;
  const EVT = {
    onclick: 'click', onmousemove: 'mousemove', onmouseleave: 'mouseleave', onmouseenter: 'mouseenter',
    onmousedown: 'mousedown', onmouseup: 'mouseup', onpointermove: 'pointermove', onpointerleave: 'pointerleave',
    oninput: 'input', onchange: 'change'
  };

  function lookup(path, scope) {
    path = path.trim();
    if (path === 'true') return true;
    if (path === 'false') return false;
    if (path === 'null') return null;
    if (/^-?\d+(\.\d+)?$/.test(path)) return parseFloat(path);
    if (/^'.*'$|^".*"$/.test(path)) return path.slice(1, -1);
    let v = scope;
    for (const k of path.split('.')) { if (v == null) return undefined; v = v[k]; }
    return v;
  }
  function interp(str, scope) {
    return str.replace(HOLE, function (_, p) { const v = lookup(p, scope); return v == null ? '' : String(v); });
  }
  function wholePath(str) {
    const m = str.match(/^\s*\{\{\s*([^}]+?)\s*\}\}\s*$/);
    return m ? m[1] : null;
  }

  let uid = 0;
  function idOf(node) { if (!node.__dcid) node.__dcid = 'n' + (++uid); return node.__dcid; }

  // Build fresh DOM nodes from the template for the current values.
  function build(node, scope, out, key) {
    if (node.nodeType === 3) { out.push(document.createTextNode(interp(node.data, scope))); return; }
    if (node.nodeType !== 1) return;
    const tag = node.localName;
    if (tag === 'helmet') return;
    if (tag === 'sc-if') {
      const p = wholePath(node.getAttribute('value') || '');
      if (p && lookup(p, scope)) {
        const k = key + '/' + idOf(node);
        node.childNodes.forEach(function (c) { build(c, scope, out, k); });
      }
      return;
    }
    if (tag === 'sc-for') {
      const list = lookup(wholePath(node.getAttribute('list') || '') || '', scope) || [];
      const as = node.getAttribute('as') || 'item';
      const k = key + '/' + idOf(node);
      list.forEach(function (item, i) {
        const s = Object.create(scope); s[as] = item; s.$index = i;
        node.childNodes.forEach(function (c) { build(c, s, out, k + '#' + i); });
      });
      return;
    }
    const el = node.namespaceURI === 'http://www.w3.org/2000/svg'
      ? document.createElementNS(node.namespaceURI, node.localName)
      : document.createElement(node.localName);
    el.__k = key;
    el.__ev = {};
    for (const a of Array.from(node.attributes)) {
      const name = a.name;
      if (name.indexOf('hint-') === 0) continue;
      if (EVT[name]) {
        const p = wholePath(a.value);
        const fn = p ? lookup(p, scope) : null;
        if (typeof fn === 'function') el.__ev[EVT[name]] = fn;
        continue;
      }
      const p = wholePath(a.value);
      if (p) {
        const v = lookup(p, scope);
        if (v == null || v === false) continue;
        el.setAttribute(name, String(v));
      } else {
        el.setAttribute(name, a.value.indexOf('{{') >= 0 ? interp(a.value, scope) : a.value);
      }
    }
    const kids = [];
    node.childNodes.forEach(function (c) { build(c, scope, kids, ''); });
    kids.forEach(function (k) { el.appendChild(k); });
    out.push(el);
  }

  function bind(el) {
    if (el.nodeType !== 1) return;
    el.__bound = el.__bound || {};
    for (const type in el.__ev) {
      if (!el.__bound[type]) {
        el.__bound[type] = true;
        el.addEventListener(type, function (e) { const fn = el.__ev && el.__ev[type]; if (fn) fn(e); });
      }
    }
    for (const c of Array.from(el.childNodes)) bind(c);
  }

  function same(a, b) {
    return a.nodeType === b.nodeType && a.nodeName === b.nodeName && (a.nodeType !== 1 || a.__k === b.__k);
  }

  function patch(live, fresh) {
    if (live.nodeType === 3) { if (live.data !== fresh.data) live.data = fresh.data; return; }
    // keep CSS custom properties set from script (mouse position) across renders
    const keep = [];
    for (let i = 0; i < live.style.length; i++) {
      const p = live.style[i];
      if (p.indexOf('--') === 0) keep.push([p, live.style.getPropertyValue(p)]);
    }
    for (const a of Array.from(live.attributes)) if (!fresh.hasAttribute(a.name)) live.removeAttribute(a.name);
    for (const a of Array.from(fresh.attributes)) if (live.getAttribute(a.name) !== a.value) live.setAttribute(a.name, a.value);
    keep.forEach(function (kv) { if (!fresh.style.getPropertyValue(kv[0])) live.style.setProperty(kv[0], kv[1]); });
    live.__ev = fresh.__ev;
    bind(live);
    morphChildren(live, Array.from(fresh.childNodes));
  }

  function morphChildren(parent, fresh) {
    for (let i = 0; i < fresh.length; i++) {
      const f = fresh[i];
      const l = parent.childNodes[i];
      if (!l) { parent.appendChild(f); bind(f); }
      else if (same(l, f)) patch(l, f);
      else { parent.replaceChild(f, l); bind(f); }
    }
    while (parent.childNodes.length > fresh.length) parent.removeChild(parent.lastChild);
  }

  // Portrait canvas: 390x844 at phone size; wider screens (tablets) get a wider canvas of the
  // same height instead of a bigger scale, so the template must be fluid in width (390-640).
  const PW = 390, PH = 844;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(hover: none), (pointer: coarse)');

  function mount(Cls, tpl, stage, props) {
    const params = new URLSearchParams(location.search);
    const fit = params.get('fit') || 'cover';
    const head = document.createElement('style');
    head.textContent =
      (params.get('nav') === '0' ? 'nav[aria-label="Primary"]{display:none!important}' : '') +
      // vertical swipes scroll the page (native scroll chaining); horizontal drags tilt the hero
      '.dc-root{touch-action:pan-y;-webkit-tap-highlight-color:transparent}' +
      // touch: every link/button gets a hit area of at least 44 screen px, whatever the scale
      '@media (pointer: coarse){.dc-root :where(a,button):not([style*="position: absolute"]){position:relative}' +
      '.dc-root :where(a,button)::after{content:"";position:absolute;' +
      'top:calc(50% - max(50%, 22px / var(--dc-s, 1)));bottom:calc(50% - max(50%, 22px / var(--dc-s, 1)));' +
      'left:calc(50% - max(50%, 22px / var(--dc-s, 1)));right:calc(50% - max(50%, 22px / var(--dc-s, 1)))}}' +
      '@media (prefers-reduced-motion: reduce){.dc-root *,.dc-root *::before,.dc-root *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important}}';
    document.head.appendChild(head);
    const portraitTpl = document.getElementById('dc-template-portrait');
    const comp = new Cls(props || {});
    comp.props = props || {};
    if (!comp.state) comp.state = {};
    const root = document.createElement('div');
    root.className = 'dc-root';
    stage.appendChild(root);
    let raf = 0;
    let mode = '';
    let mover = null; // the element carrying the template's onMouseMove (see Touch + motion)
    function pickMode() { return portraitTpl && window.innerWidth / window.innerHeight < 1.1 ? 'portrait' : 'landscape'; }
    function render() {
      comp.mode = mode;
      const vals = comp.renderVals();
      const out = [];
      (mode === 'portrait' ? portraitTpl : tpl).content.childNodes.forEach(function (n) { build(n, vals, out, mode); });
      morphChildren(root, out);
      mover = null;
      fitAll();
    }
    // <el data-fit="width|contain">: scale a fixed-size piece of the desktop composition to fit its
    // parent (portrait templates reuse the board / card / frame as is). Re-applied after each render.
    function fitAll() {
      const els = root.querySelectorAll('[data-fit]');
      for (let i = 0; i < els.length; i++) {
        const el = els[i], p = el.parentElement;
        const k = el.getAttribute('data-fit') === 'contain'
          ? Math.min(p.clientWidth / el.offsetWidth, p.clientHeight / el.offsetHeight)
          : p.clientWidth / el.offsetWidth;
        el.style.scale = String(Math.round(k * 1e4) / 1e4);
      }
    }
    comp.__schedule = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); };

    function resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const next = pickMode();
      if (next !== mode) {
        mode = next;
        document.documentElement.setAttribute('data-mode', mode);
        root.textContent = '';
        render();
      }
      if (mode === 'portrait') {
        const s = Math.min(vw / PW, vh / PH);
        root.style.width = (vw / s).toFixed(2) + 'px';
        root.style.height = (vh / s).toFixed(2) + 'px';
        root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
        root.style.setProperty('--dc-s', s.toFixed(4));
        stage.style.position = ''; stage.style.height = '';
        stage.style.backgroundColor = ''; stage.style.backgroundImage = '';
        fitAll();
        return;
      }
      const W = 1440, H = 810;
      root.style.width = ''; root.style.height = '';
      // cover, but never crop more than ~6% off the sides or ~10% off the top and bottom: the copy
      // and buttons sit 56-80px from the edges, so a 4:3 tablet or a phone on its side would lose
      // them. Any band left over is filled with the hero's own background.
      let s = fit === 'contain' ? Math.min(vw / W, vh / H) : fit === 'width' ? vw / W
        : Math.min(Math.max(vw / W, vh / H), vw / (W * 0.94), vh / (H * 0.9));
      const first = root.firstElementChild;
      const band = fit !== 'width' && first && (W * s < vw - 1 || H * s < vh - 1);
      const cs = band ? getComputedStyle(first) : null;
      stage.style.backgroundColor = cs ? cs.backgroundColor : '';
      stage.style.backgroundImage = cs ? cs.backgroundImage : '';
      root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
      root.style.setProperty('--dc-s', s.toFixed(4));
      if (fit === 'width') { stage.style.position = 'relative'; stage.style.height = Math.round(H * s) + 'px'; }
    }
    window.addEventListener('resize', resize);
    resize();
    if (comp.componentDidMount) comp.componentDidMount();
    window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });

    // ---- Touch + motion: drive the hero's own onMouseMove handler without a mouse. ----
    // Touch drags, device tilt (after a tap on iOS) and, failing both, a slow idle drift all call
    // the same handler with { clientX, clientY, currentTarget, synthetic }. synthetic=true means
    // "not a real pointer" (heroes can ignore it for proximity effects, e.g. the museum lasers).
    function target() {
      if (mover && mover.isConnected) return mover;
      const all = root.querySelectorAll('*');
      for (let i = 0; i < all.length; i++) if (all[i].__ev && all[i].__ev.mousemove) return (mover = all[i]);
      return null;
    }
    function drive(fx, fy, synthetic) {
      const el = target();
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.__ev.mousemove({ currentTarget: el, target: el, clientX: r.left + fx * r.width, clientY: r.top + fy * r.height, synthetic: synthetic });
    }
    const clamp = function (v) { return Math.min(1, Math.max(0, v)); };
    let lastInput = 0;
    root.addEventListener('pointerdown', onPointer);
    root.addEventListener('pointermove', onPointer);
    function onPointer(e) {
      if (e.pointerType === 'mouse') return; // the template's own mouse handlers cover this
      lastInput = performance.now();
      const el = target();
      if (el && el.__ev.mousemove) el.__ev.mousemove({ currentTarget: el, target: e.target, clientX: e.clientX, clientY: e.clientY, synthetic: false });
    }

    let tilt = null, base = null, asked = false;
    function onOrient(e) {
      if (e.gamma == null || e.beta == null || reduced.matches) return;
      if (base === null) base = e.beta;
      tilt = [clamp(0.5 + e.gamma / 50), clamp(0.5 + (e.beta - base) / 50)];
    }
    if (coarse.matches && 'DeviceOrientationEvent' in window) {
      if (typeof DeviceOrientationEvent.requestPermission === 'function') {
        // iOS: needs a user gesture; ask on the first tap
        root.addEventListener('pointerup', function () {
          if (asked) return;
          asked = true;
          DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') window.addEventListener('deviceorientation', onOrient); }).catch(function () {});
        });
      } else window.addEventListener('deviceorientation', onOrient);
    }

    let visible = true;
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { visible = es[0].isIntersecting; }).observe(root);
    if (coarse.matches) {
      const t0 = performance.now();
      setInterval(function () {
        if (!visible || document.hidden || reduced.matches || performance.now() - lastInput < 2500) return;
        if (tilt) { drive(tilt[0], tilt[1], true); return; }
        const t = (performance.now() - t0) / 1000;
        drive(0.5 + 0.16 * Math.sin(t * 0.55), 0.5 + 0.12 * Math.sin(t * 0.37), true);
      }, 90);
    }

    document.addEventListener('click', function (e) {
      const a = e.target.closest && e.target.closest('a[href^="#"]');
      if (a && window.parent !== window) {
        e.preventDefault();
        window.parent.postMessage({ type: '3skrino-hero-nav', href: a.getAttribute('href') }, window.location.origin);
      }
    });
    // let the page that embeds the hero keep scrolling when the wheel is used over it
    if (window.parent !== window) {
      window.addEventListener('wheel', function (e) {
        window.parent.postMessage({ type: '3skrino-hero-wheel', deltaY: e.deltaY, deltaX: e.deltaX }, window.location.origin);
      }, { passive: true });
    }
    return comp;
  }

  window.DCLite = { mount: mount };
})();
