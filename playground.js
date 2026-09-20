(() => {
  const portrait = document.querySelector('.portrait');
  const profile = document.querySelector('.profile');
  const layer = document.createElement('div');
  layer.className = 'playground';
  layer.setAttribute('aria-hidden', 'true');
  const dock = document.createElement('button');
  dock.type = 'button';
  dock.className = 'portrait-dock';
  dock.hidden = true;
  dock.setAttribute('aria-label', 'アバターをここに戻して復元（EnterまたはEscでも復元）');
  const dockHint = document.createElement('span');
  dockHint.className = 'portrait-hint';
  dockHint.setAttribute('aria-hidden', 'true');
  dockHint.textContent = 'Take me home 🥺';
  dock.append(dockHint);
  document.body.append(layer, dock);
  let avatar = null;
  let drag = null;
  let returning = false;
  let returnElapsed = 0;
  let bodies = [];
  let active = false;
  let frame = 0;
  let lastTime = 0;
  let accumulator = 0;
  let pointer = null;
  const step = 1 / 120;
  const returnDuration = 0.95;
  const correctionStart = returnDuration + 0.45;
  const correctionDuration = 0.65;

  // Circular collision bounds keep the small, rotating fragments inexpensive.
  function add(node, rect, radius, home = () => rect) {
    node.classList.add('fragment');
    Object.assign(node.style, { width: `${rect.width}px`, height: `${rect.height}px` });
    layer.append(node);
    bodies.push({ node, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2,
      w: rect.width, h: rect.height, r: radius, home,
      mass: Math.max(1, radius * radius / 100),
      vx: (Math.random() - 0.5) * 100, vy: -30 - Math.random() * 70,
      angle: 0, spin: (Math.random() - 0.5) * 3 });
  }

  function letters(element) {
    const text = element.firstChild;
    if (!text || text.nodeType !== Node.TEXT_NODE) return;
    const style = getComputedStyle(element);
    const range = document.createRange();
    const segments = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('ja', { granularity: 'grapheme' }).segment(text.textContent)
      : Array.from(text.textContent).map((segment, i, chars) => ({ segment, index: chars.slice(0, i).join('').length }));
    for (const { segment, index } of segments) {
      if (!segment.trim()) continue;
      range.setStart(text, index);
      range.setEnd(text, index + segment.length);
      const rect = range.getBoundingClientRect();
      const node = document.createElement('span');
      node.textContent = segment;
      Object.assign(node.style, { fontFamily: style.fontFamily, fontSize: style.fontSize,
        fontWeight: style.fontWeight, fontStyle: style.fontStyle,
        color: element.closest('.tagline') ? 'var(--muted)' : 'var(--text)',
        lineHeight: `${rect.height}px`, whiteSpace: 'pre' });
      const homeRange = range.cloneRange();
      add(node, rect, Math.max(4, Math.min(rect.width, rect.height) * 0.48),
        () => homeRange.getBoundingClientRect());
      bodies[bodies.length - 1].isName = element.id === 'profile-name';
    }
  }

  function border(element) {
    const rect = element.getBoundingClientRect();
    // Break the outline into short sticks so the letters can spill out.
    for (const vertical of [false, true]) {
      const length = vertical ? rect.height : rect.width;
      const count = Math.ceil(length / 16);
      for (let side = 0; side < 2; side++) {
        for (let i = 0; i < count; i++) {
          const size = length / count;
          const node = document.createElement('span');
          node.style.background = 'var(--line)';
          add(node, { left: rect.left + (vertical ? side * rect.width : i * size),
            top: rect.top + (vertical ? i * size : side * rect.height),
            width: vertical ? 1 : size, height: vertical ? size : 1 }, size / 2, () => {
            const current = element.getBoundingClientRect();
            const part = (vertical ? current.height : current.width) / count;
            return { left: current.left + (vertical ? side * current.width : i * part),
              top: current.top + (vertical ? i * part : side * current.height),
              width: vertical ? 1 : part, height: vertical ? part : 1 };
          });
        }
      }
    }
  }

  function render() {
    for (const b of bodies) {
      b.node.style.transform = `translate3d(${b.x - b.w / 2}px, ${b.y - b.h / 2}px, 0) rotate(${b.angle}rad)`;
    }
  }

  function simulate(dt) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    for (const b of bodies) {
      if (drag && b === avatar) continue;
      b.vy += 850 * dt;
      b.vx *= 0.998;
      b.vy *= 0.998;
      b.spin *= 0.998;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.angle += b.spin * dt;
    }
    // Iterative contact resolution prevents most overlap in the pile.
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < bodies.length; i++) {
        const a = bodies[i];
        for (let j = i + 1; j < bodies.length; j++) {
          const b = bodies[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const min = a.r + b.r;
          const distance = Math.hypot(dx, dy);
          if (distance >= min) continue;
          const nx = distance ? dx / distance : 1;
          const ny = distance ? dy / distance : 0;
          const invA = drag && a === avatar ? 0 : 1 / a.mass;
          const invB = drag && b === avatar ? 0 : 1 / b.mass;
          const correction = Math.max(0, min - distance - 0.1) * 0.8 / (invA + invB);
          a.x -= nx * correction * invA; a.y -= ny * correction * invA;
          b.x += nx * correction * invB; b.y += ny * correction * invB;
          const velocity = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (velocity >= 0) continue;
          const impulse = -(1 + (velocity < -40 ? 0.35 : 0)) * velocity / (invA + invB);
          a.vx -= impulse * nx * invA; a.vy -= impulse * ny * invA;
          b.vx += impulse * nx * invB; b.vy += impulse * ny * invB;
          const tangent = (b.vx - a.vx) * -ny + (b.vy - a.vy) * nx;
          const friction = Math.max(-impulse * 0.2, Math.min(impulse * 0.2, -tangent / (invA + invB)));
          a.vx += friction * ny * invA; a.vy -= friction * nx * invA;
          b.vx -= friction * ny * invB; b.vy += friction * nx * invB;
          a.spin += tangent * 0.0008; b.spin -= tangent * 0.0008;
        }
        if (drag && a === avatar) continue;
        if (a.x < a.r) { a.x = a.r; a.vx = Math.abs(a.vx) * 0.5; }
        if (a.x > width - a.r) { a.x = width - a.r; a.vx = -Math.abs(a.vx) * 0.5; }
        if (a.y < a.r) { a.y = a.r; a.vy = Math.abs(a.vy) * 0.4; }
        if (a.y > height - a.r) {
          a.y = height - a.r;
          a.vy = a.vy > 40 ? -a.vy * 0.4 : Math.min(a.vy, 0);
          a.vx *= 0.94; a.spin *= 0.94;
        }
      }
    }
  }

  function tick(time) {
    if (!active) return;
    const dt = Math.min((time - lastTime) / 1000, 0.04);
    if (returning) {
      lastTime = time;
      returnElapsed += dt;
      const progress = Math.min(1, returnElapsed / returnDuration);
      const eased = 1 - (1 - progress) ** 4;
      const correction = Math.max(0, Math.min(1,
        (returnElapsed - correctionStart) / correctionDuration));
      const corrected = correction * correction * (3 - 2 * correction);
      for (const b of bodies) {
        const home = b.home();
        const wrongX = b.wrongHome ? b.wrongHome() : home.left + home.width / 2;
        const targetX = wrongX + (home.left + home.width / 2 - wrongX) * corrected;
        b.x = b.from.x + (targetX - b.from.x) * eased;
        b.y = b.from.y + (home.top + home.height / 2 - b.from.y) * eased;
        b.angle = b.from.angle * (1 - eased);
        if (b.wrongHome) {
          // A tiny double-take, then alternate arcs as the letters trade places.
          const surprise = Math.max(0, Math.min(1,
            (returnElapsed - correctionStart + 0.18) / 0.18));
          b.angle += Math.sin(surprise * Math.PI * 2) * 0.09;
          b.y += Math.sin(correction * Math.PI) * b.correctionArc;
        }
        b.w = b.from.w + (home.width - b.from.w) * eased;
        b.h = b.from.h + (home.height - b.from.h) * eased;
        b.node.style.width = `${b.w}px`;
        b.node.style.height = `${b.h}px`;
      }
      render();
      if (correction === 1) { stop(); return; }
    } else {
      accumulator += dt;
      lastTime = time;
      while (accumulator >= step) { simulate(step); accumulator -= step; }
      render();
    }
    frame = requestAnimationFrame(tick);
  }

  function start() {
    if (active) return;
    const copy = portrait.cloneNode(true);
    copy.removeAttribute('title');
    copy.removeAttribute('aria-label');
    copy.tabIndex = -1;
    const rect = portrait.getBoundingClientRect();
    add(copy, rect, rect.width / 2, () => portrait.getBoundingClientRect());
    avatar = bodies[0];
    document.querySelectorAll('h1, .tagline span, .links a').forEach(letters);
    document.querySelectorAll('.links a').forEach(border);
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const scale = Math.max(0.6, Math.min(1, window.innerWidth / 600));
      for (const b of bodies) {
        const direction = Math.atan2(b.y - avatar.y, b.x - avatar.x)
          + (Math.random() - 0.5) * 0.6;
        const speed = (420 + Math.random() * 220) * scale;
        // Spread out from the portrait, with an upward kick before gravity takes over.
        b.vx = Math.cos(direction) * speed;
        b.vy = Math.sin(direction) * speed * 0.45 - 480 * scale;
        b.spin = (Math.random() - 0.5) * 12;
      }
      // The heavier avatar gets a smaller, playful hop of its own.
      avatar.vx = (Math.random() - 0.5) * 180 * scale;
      avatar.vy = -310 * scale;
      avatar.spin = (Math.random() - 0.5) * 4;
    }
    active = true;
    profile.inert = true;
    document.body.classList.add('is-playing');
    dock.hidden = false;
    positionDock();
    dock.focus({ preventScroll: true });
    render();
    lastTime = performance.now();
    frame = requestAnimationFrame(tick);
  }

  function stop() {
    active = false;
    returning = false;
    releaseDrag();
    avatar = null;
    cancelAnimationFrame(frame);
    bodies = [];
    pointer = null;
    accumulator = 0;
    layer.replaceChildren();
    document.body.classList.remove('is-playing');
    profile.inert = false;
    dock.hidden = true;
    dock.classList.remove('is-ready');
    portrait.focus({ preventScroll: true });
  }

  function positionDock() {
    if (!active) return;
    const rect = portrait.getBoundingClientRect();
    Object.assign(dock.style, { left: `${rect.left}px`, top: `${rect.top}px`,
      width: `${rect.width}px`, height: `${rect.height}px` });
  }

  function insideDock() {
    const rect = portrait.getBoundingClientRect();
    return Math.hypot(avatar.x - rect.left - rect.width / 2,
      avatar.y - rect.top - rect.height / 2) < rect.width * 0.35;
  }

  function releaseDrag() {
    const previous = drag;
    drag = null;
    layer.classList.remove('is-dragging');
    dock.classList.remove('is-ready');
    if (previous && layer.hasPointerCapture(previous.id)) layer.releasePointerCapture(previous.id);
    pointer = null;
  }

  function restore() {
    if (!active || returning) return;
    releaseDrag();
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { stop(); return; }
    returning = true;
    returnElapsed = 0;
    const name = bodies.filter((b) => b.isName);
    const shuffled = [...name];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    // Even an unlucky shuffle must visibly get the name wrong.
    if (shuffled.length > 1 && shuffled.every((b, i) => b === name[i])) {
      shuffled.push(shuffled.shift());
    }
    shuffled.forEach((b, index) => {
      b.correctionArc = index % 2 ? 16 : -16;
      b.wrongHome = () => {
        const first = name[0].home();
        const last = name[name.length - 1].home();
        const totalWidth = name.reduce((sum, letter) => sum + letter.home().width, 0);
        const gap = name.length > 1
          ? (last.left + last.width - first.left - totalWidth) / (name.length - 1) : 0;
        return first.left + shuffled.slice(0, index).reduce(
          (sum, letter) => sum + letter.home().width + gap, 0) + b.home().width / 2;
      };
    });
    for (const b of bodies) {
      b.from = { x: b.x, y: b.y, w: b.w, h: b.h,
        angle: Math.atan2(Math.sin(b.angle), Math.cos(b.angle)) };
    }
  }

  layer.addEventListener('pointermove', (event) => {
    if (!active || returning) return;
    if (drag) {
      if (event.pointerId !== drag.id) return;
      avatar.x = Math.max(avatar.r, Math.min(window.innerWidth - avatar.r, event.clientX - drag.x));
      avatar.y = Math.max(avatar.r, Math.min(window.innerHeight - avatar.r, event.clientY - drag.y));
      avatar.vx = avatar.vy = avatar.spin = 0;
      dock.classList.toggle('is-ready', insideDock());
      return;
    }
    const now = performance.now();
    if (pointer && now - pointer.time < 120) {
      const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y;
      const distance = Math.hypot(dx, dy);
      const strength = Math.min(110, distance * 3);
      for (const b of bodies) {
        // Use the swept pointer segment to catch fast swipes between events.
        const t = distance ? Math.max(0, Math.min(1,
          ((b.x - pointer.x) * dx + (b.y - pointer.y) * dy) / distance ** 2)) : 0;
        const offsetX = b.x - (pointer.x + dx * t);
        const offsetY = b.y - (pointer.y + dy * t);
        const falloff = Math.max(0, 1 - Math.hypot(offsetX, offsetY) / 120);
        const force = strength * falloff / Math.sqrt(b.mass);
        b.vx = Math.max(-1100, Math.min(1100, b.vx + (dx / (distance || 1) * 1.4 + offsetX / 120) * force));
        b.vy = Math.max(-1100, Math.min(1100, b.vy + (dy / (distance || 1) * 0.4 - 2.4) * force));
        b.spin = Math.max(-12, Math.min(12, b.spin + dx * falloff * 0.015));
      }
    }
    pointer = { x: event.clientX, y: event.clientY, time: now };
  });
  layer.addEventListener('pointerdown', (event) => {
    if (!active || returning || drag || event.button !== 0) return;
    pointer = { x: event.clientX, y: event.clientY, time: performance.now() };
    if (Math.hypot(event.clientX - avatar.x, event.clientY - avatar.y) <= avatar.r) {
      drag = { id: event.pointerId, x: event.clientX - avatar.x, y: event.clientY - avatar.y };
      avatar.vx = avatar.vy = avatar.spin = 0;
      layer.classList.add('is-dragging');
    }
    layer.setPointerCapture(event.pointerId);
  });
  layer.addEventListener('pointerup', (event) => {
    if (drag && drag.id === event.pointerId) {
      const docked = insideDock();
      releaseDrag();
      if (docked) restore();
    }
    pointer = null;
  });
  layer.addEventListener('pointerleave', () => { pointer = null; });
  layer.addEventListener('pointercancel', releaseDrag);
  layer.addEventListener('lostpointercapture', releaseDrag);
  portrait.addEventListener('click', start);
  dock.addEventListener('click', restore);
  window.addEventListener('resize', positionDock);
  window.addEventListener('scroll', positionDock);
  document.addEventListener('keydown', (event) => { if (active && event.key === 'Escape') restore(); });
  document.addEventListener('visibilitychange', () => {
    if (!active) return;
    cancelAnimationFrame(frame);
    releaseDrag();
    if (!document.hidden) { lastTime = performance.now(); frame = requestAnimationFrame(tick); }
  });
})();
