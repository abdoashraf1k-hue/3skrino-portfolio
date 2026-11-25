/*
 * dc-lite.js: a tiny runtime that plays the 3SKRINO hero files outside Claude Design.
 * It understands the subset the heroes use: {{holes}}, <sc-if>, <sc-for>, on* events,
 * a DCLogic class with state / setState / lifecycle, and it scales the 1440x810 hero
 * to the viewport.
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

  function mount(Cls, tpl, stage, props) {
    const params = new URLSearchParams(location.search);
    const fit = params.get('fit') || 'cover';
    if (params.get('nav') === '0') {
      const st = document.createElement('style');
      st.textContent = 'nav[aria-label="Primary"]{display:none!important}';
      document.head.appendChild(st);
    }
    const comp = new Cls(props || {});
    comp.props = props || {};
    if (!comp.state) comp.state = {};
    const root = document.createElement('div');
    root.className = 'dc-root';
    stage.appendChild(root);
    let raf = 0;
    function render() {
      const vals = comp.renderVals();
      const out = [];
      tpl.content.childNodes.forEach(function (n) { build(n, vals, out, ''); });
      morphChildren(root, out);
    }
    comp.__schedule = function () { if (!raf) raf = requestAnimationFrame(function () { raf = 0; render(); }); };
    render();
    if (comp.componentDidMount) comp.componentDidMount();
    window.addEventListener('pagehide', function () { if (comp.componentWillUnmount) comp.componentWillUnmount(); });

    function resize() {
      const W = 1440, H = 810, vw = window.innerWidth, vh = window.innerHeight;
      let s = fit === 'contain' ? Math.min(vw / W, vh / H) : fit === 'width' ? vw / W : Math.max(vw / W, vh / H);
      root.style.transform = 'translate(-50%, -50%) scale(' + s + ')';
      if (fit === 'width') { stage.style.position = 'relative'; stage.style.height = Math.round(H * s) + 'px'; }
    }
    window.addEventListener('resize', resize);
    resize();

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
