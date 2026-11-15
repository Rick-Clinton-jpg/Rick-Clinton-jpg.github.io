/* Editorial assembly: the real content stays in place; only its presentation moves. */
(() => {
  'use strict';
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  if (!('IntersectionObserver' in window)) return;

  const clamp = value => Math.max(0, Math.min(1, value));
  const smooth = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
  const records = [];
  const visible = new Set();
  let frame = 0;
  let opening = 0;
  let initialized = false;
  let enabled = false;
  let observer;
  let resizeObserver;

  function register(selector, kind) {
    document.querySelectorAll(selector).forEach(element => {
      // Keep nested motion independent and avoid animating a parent twice.
      if (element.closest('.motion-host')) return;
      element.classList.add('motion-host', `motion-${kind}`);
      const record = { element, kind, parts: null, last: null, intro: false };
      records.push(record);
    });
  }

  function fragments(record) {
    const { element, kind } = record;
    if (kind === 'diagram') {
      record.parts = Array.from(element.children).filter(child =>
        !['defs', 'title', 'desc'].includes(child.tagName.toLowerCase()));
    } else {
      const layer = document.createElement('span');
      layer.className = 'motion-fragments';
      layer.setAttribute('aria-hidden', 'true');
      layer.setAttribute('inert', '');
      let source;
      if (kind === 'type') {
        source = document.createElement('span');
        source.className = 'motion-original';
        source.append(...element.childNodes);
        element.append(source);
      } else {
        source = element.querySelector('img');
        if (!source) return;
        source.classList.add('motion-original');
      }
      const columns = kind === 'image' ? 6 : 1;
      const rows = kind === 'image' ? 4 : 6;
      record.parts = [];
      for (let row = 0; row < rows; row++) {
        for (let column = 0; column < columns; column++) {
          const part = document.createElement('span');
          part.className = 'motion-piece';
          part.style.clipPath = `inset(${row * 100 / rows}% ${100 - (column + 1) * 100 / columns}% ${100 - (row + 1) * 100 / rows}% ${column * 100 / columns}%)`;
          const copy = source.cloneNode(true);
          copy.classList.remove('motion-original');
          copy.classList.add('motion-copy');
          copy.removeAttribute('id');
          copy.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
          if (kind === 'image') {
            copy.alt = '';
            copy.removeAttribute('loading');
            copy.removeAttribute('fetchpriority');
          }
          part.append(copy);
          layer.append(part);
          record.parts.push(part);
        }
      }
      element.append(layer);
    }
    record.parts.forEach((part, i) => {
      // Deterministic cuts: no random flicker when the scroll direction changes.
      part.style.setProperty('--piece-x', `${((i * 17 % 11) - 5) * (kind === 'type' ? 5 : 4)}px`);
      part.style.setProperty('--piece-y', `${12 + (i * 7 % 19)}px`);
      part.style.setProperty('--piece-turn', `${((i * 3 % 7) - 3) * (kind === 'type' ? 0.14 : 0.35)}deg`);
      part.style.setProperty('--piece-delay', ((i * 7 % 13) / 20).toFixed(2));
      part.classList.add('motion-atom');
    });
  }

  function render(record, amount) {
    if (record.last !== null && Math.abs(record.last - amount) < 0.001) return;
    record.last = amount;
    const { element, kind } = record;
    const distance = Math.abs(amount);
    if (['type', 'image', 'diagram'].includes(kind)) {
      if (!record.parts && distance > 0) fragments(record);
      element.classList.toggle('motion-fragmenting', distance > 0.001);
    }
    element.style.setProperty('--unbuilt', distance.toFixed(4));
    element.style.setProperty('--direction', amount < 0 ? '-1' : '1');
    element.style.setProperty('--travel', (amount < 0 ? -distance : distance).toFixed(4));
    element.style.setProperty('--presence', (1 - smooth(distance)).toFixed(4));
  }

  function schedule() {
    if (enabled && !frame) frame = requestAnimationFrame(update);
  }

  function update(now) {
    frame = 0;
    if (!enabled) return;
    const height = window.innerHeight;
    const header = document.querySelector('.site-header').getBoundingClientRect().bottom;
    // At the document end, the final lines must be able to finish assembling.
    const remainingScroll = Math.max(0, document.body.offsetHeight - height - scrollY);
    const endReveal = smooth(remainingScroll / (height * 0.28));
    const intro = opening ? 1 - smooth((now - opening) / 1050) : 0;
    // Read every rectangle before writing styles, to avoid layout thrashing.
    const measurements = Array.from(visible, record => {
      const rect = record.element.getBoundingClientRect();
      // Block transforms must not feed back into their own scroll position.
      const shift = record.kind === 'block' ? 14 * (record.last || 0) : 0;
      return [record, { top: rect.top - shift, bottom: rect.bottom - shift, height: rect.height, width: rect.width }];
    });
    measurements.forEach(([record, rect]) => {
      if (!rect.height || !rect.width) return;
      let amount = 0;
      if (!record.element.matches(':focus-within')) {
        const entering = smooth((rect.top - height * 0.70) / (height * 0.28)) * endReveal;
        const exitRange = Math.min(height * 0.25, rect.height * 0.65);
        const leaving = smooth((header + exitRange - rect.bottom) / exitRange);
        amount = leaving > 0 ? -leaving : entering;
        if (record.intro && intro > Math.abs(amount)) amount = intro;
      }
      render(record, amount);
    });
    if (intro > 0) schedule();
    else opening = 0;
  }

  function initialize() {
    if (initialized) return;
    initialized = true;
    register('.hero-name, .hero-tag, .feature-title, .work-heading h2, .work-copy h3, .research-section h2, .audit-section h2, .writing-section h2, .about-section h2', 'type');
    register('.hero-stage, .work-art, .feature-visual', 'image');
    register('.layout-graph', 'diagram');
    register('.section-marker, .group-head', 'rule');
    register('.hero-lede, .hero-about, .hero-side, .hero-under, .feature-copy > p, .feature-copy > h3, .feature-links, .feature-graph figcaption, .facts > div, .work-heading > p, .work-copy > .index, .work-copy > .purpose, .spec > div, .entry-end, .research-intro > p, .research-ledger > article, .audit-lede, .audit-row, .audit-section .toggle, .paper, .about-grid > p, .timeline > .tl, .footer-call, .footer-grid, .fine', 'block');
    observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        const record = records.find(item => item.element === entry.target);
        if (entry.isIntersecting) visible.add(record);
        else {
          visible.delete(record);
          // A focused control must never disappear when a layout change moves it.
          if (record.element.matches(':focus-within')) render(record, 0);
        }
      });
      schedule();
    }, { rootMargin: '100px 0px' });
    if ('ResizeObserver' in window) {
      resizeObserver = new ResizeObserver(schedule);
      resizeObserver.observe(document.querySelector('main'));
    }
    addEventListener('scroll', () => { opening = 0; schedule(); }, { passive: true });
    addEventListener('resize', schedule, { passive: true });
    addEventListener('pageshow', schedule);
    document.addEventListener('focusin', schedule);
    document.addEventListener('focusout', schedule);
    document.addEventListener('click', schedule);
    document.addEventListener('load', schedule, true);
    if (document.fonts) document.fonts.ready.then(schedule);
  }

  function setMotion() {
    enabled = !preference.matches;
    if (enabled) {
      initialize();
      opening = window.scrollY < 10 && !location.hash ? performance.now() : 0;
      document.documentElement.classList.add('editorial-motion');
      records.forEach(record => {
        const rect = record.element.getBoundingClientRect();
        record.intro = Boolean(opening && rect.top < innerHeight && rect.bottom > 0);
        if (rect.top < innerHeight + 100 && rect.bottom > -100) visible.add(record);
        observer.observe(record.element);
      });
      schedule();
    } else {
      cancelAnimationFrame(frame);
      frame = 0;
      opening = 0;
      document.documentElement.classList.remove('editorial-motion');
      if (observer) observer.disconnect();
      records.forEach(record => render(record, 0));
      visible.clear();
    }
  }

  try {
    setMotion();
    preference.addEventListener('change', setMotion);
  } catch (error) {
    // Static content is the fallback if enhancement cannot initialize.
    enabled = false;
    document.documentElement.classList.remove('editorial-motion');
  }
})();
