/* ═══════════════════════════════════════════════════════════════════════
   guides.js — Rulers & Guides, by santibraby (Annotate family)

   Photoshop-style guides. Tap G: rulers appear along the top and left of
   the canvas (ticks in world px, tracking pan/zoom); drag OFF a ruler to
   drop a guide line — a real object, so it selects, moves, and deletes
   like anything else. Tap G again: rulers AND guides hide. Again: back.
   Right-click → Annotate ▶ Guides ▶ Clear All Guides.

   Guides never export: the type has no exportDraw, so JPEG/PDF/pptx
   pipelines skip them. Visibility persists with the project
   (ctx.state 'guides.on').

   On Blank-Slate 2.0.6+ the type also declares fitIgnore (the 40,000px
   band can't hijack fit-to-view), snapCandidates (objects snap to the
   exact 1px LINE, never the grab band; nothing snaps while hidden), and
   selectable (marquee/Ctrl+A never sweep guides up — click one to move
   or delete it). Older kernels ignore these fields; behavior there is
   unchanged.
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'guides',
  name: 'Guides',
  version: '1.1.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'Photoshop-style rulers and draggable guide lines. G toggles; guides never export.',
};

export function register(ctx) {
  const STATE_KEY = 'guides.on';
  const GUIDE_COLOR = '#00FFFF';
  const EXT = 40000;   // guide span (world px) — longer than any sane board
  const THICK = 14;    // grab band (world px); the drawn line is 1px
  const RULER = 22;    // ruler thickness (screen px)

  const guidesOn = () => !!ctx.state.get(STATE_KEY);

  // ── rulers (fixed chrome, aligned to the floating canvas via the
  //    kernel's stage CSS variables — they follow the panel push) ──────
  const topBar = document.createElement('div');
  topBar.className = 'guide-ruler guide-ruler-top';
  const topCv = document.createElement('canvas');
  topBar.appendChild(topCv);

  const leftBar = document.createElement('div');
  leftBar.className = 'guide-ruler guide-ruler-left';
  const leftCv = document.createElement('canvas');
  leftBar.appendChild(leftCv);

  const corner = document.createElement('div');
  corner.className = 'guide-ruler guide-ruler-corner';

  const dragLine = document.createElement('div');
  dragLine.className = 'guide-drag-line';

  document.body.appendChild(topBar);
  document.body.appendChild(leftBar);
  document.body.appendChild(corner);
  document.body.appendChild(dragLine);

  // nice tick step for the current zoom (≥ 55 screen px between labels)
  function tickStep(zoom) {
    const steps = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
    for (const s of steps) if (s * zoom >= 55) return s;
    return 10000;
  }

  let rafId = null;
  let lastKey = '';
  function drawRulers() {
    if (!guidesOn()) { rafId = null; return; }
    const zoom = Math.max(0.001, ctx.getZoom());
    const W0 = ctx.screenToWorld(0, 0); // world coords at screen origin
    const key = `${zoom}|${W0.x.toFixed(1)}|${W0.y.toFixed(1)}|${topBar.clientWidth}|${leftBar.clientHeight}`;
    if (key !== lastKey) {
      lastKey = key;
      const dpr = window.devicePixelRatio || 1;
      const topRect = topBar.getBoundingClientRect();
      const leftRect = leftBar.getBoundingClientRect();
      const step = tickStep(zoom);

      // top ruler (world X)
      topCv.width = Math.max(1, Math.round(topRect.width * dpr));
      topCv.height = RULER * dpr;
      const tc = topCv.getContext('2d');
      tc.scale(dpr, dpr);
      tc.clearRect(0, 0, topRect.width, RULER);
      tc.font = '9px "JetBrains Mono", monospace';
      tc.fillStyle = 'rgba(240,240,240,0.55)';
      tc.strokeStyle = 'rgba(240,240,240,0.35)';
      const firstX = Math.floor(ctx.screenToWorld(topRect.left, 0).x / step) * step;
      for (let wx = firstX; ; wx += step) {
        const sx = (wx - W0.x) * zoom - topRect.left;
        if (sx > topRect.width) break;
        if (sx < -60) continue;
        tc.beginPath(); tc.moveTo(sx, RULER - 7); tc.lineTo(sx, RULER); tc.stroke();
        tc.fillText(String(wx), sx + 3, RULER - 9);
        const minor = step / 5;
        for (let m = 1; m < 5; m++) {
          const mx = sx + m * minor * zoom;
          tc.beginPath(); tc.moveTo(mx, RULER - 4); tc.lineTo(mx, RULER); tc.stroke();
        }
      }

      // left ruler (world Y)
      leftCv.width = RULER * dpr;
      leftCv.height = Math.max(1, Math.round(leftRect.height * dpr));
      const lc = leftCv.getContext('2d');
      lc.scale(dpr, dpr);
      lc.clearRect(0, 0, RULER, leftRect.height);
      lc.font = '9px "JetBrains Mono", monospace';
      lc.fillStyle = 'rgba(240,240,240,0.55)';
      lc.strokeStyle = 'rgba(240,240,240,0.35)';
      const firstY = Math.floor(ctx.screenToWorld(0, leftRect.top).y / step) * step;
      for (let wy = firstY; ; wy += step) {
        const sy = (wy - W0.y) * zoom - leftRect.top;
        if (sy > leftRect.height) break;
        if (sy < -60) continue;
        lc.beginPath(); lc.moveTo(RULER - 7, sy); lc.lineTo(RULER, sy); lc.stroke();
        lc.save();
        lc.translate(RULER - 9, sy + 3);
        lc.rotate(-Math.PI / 2);
        lc.textAlign = 'right';
        lc.fillText(String(wy), 0, 0);
        lc.restore();
        const minor = step / 5;
        for (let m = 1; m < 5; m++) {
          const my = sy + m * minor * zoom;
          lc.beginPath(); lc.moveTo(RULER - 4, my); lc.lineTo(RULER, my); lc.stroke();
        }
      }
    }
    rafId = requestAnimationFrame(drawRulers);
  }

  function syncChrome() {
    const on = guidesOn();
    topBar.style.display = on ? 'block' : 'none';
    leftBar.style.display = on ? 'block' : 'none';
    corner.style.display = on ? 'block' : 'none';
    lastKey = '';
    if (on && rafId == null) rafId = requestAnimationFrame(drawRulers);
  }

  function toggleGuides() {
    ctx.state.set(STATE_KEY, !guidesOn());
    ctx.renderObjects(); // guide objects show/hide via their render()
    ctx.markDirty();
    syncChrome();
  }

  // ── drag a new guide off a ruler ────────────────────────────────────
  function beginRulerDrag(orientation, eDown) {
    eDown.preventDefault();
    dragLine.style.display = 'block';
    const move = (e) => {
      if (orientation === 'h') {
        dragLine.style.cssText += `;display:block;left:0;right:0;top:${e.clientY}px;height:1px;width:auto;`;
      } else {
        dragLine.style.cssText += `;display:block;top:0;bottom:0;left:${e.clientX}px;width:1px;height:auto;`;
      }
    };
    const up = (e) => {
      document.removeEventListener('mousemove', move);
      document.removeEventListener('mouseup', up);
      dragLine.style.display = 'none';
      dragLine.style.cssText = '';
      const wp = ctx.screenToWorld(e.clientX, e.clientY);
      ctx.pushUndo();
      const obj = ctx.createObject(orientation === 'h'
        ? { type: 'guide', orientation: 'h', x: wp.x - EXT / 2, y: wp.y - THICK / 2, w: EXT, h: THICK }
        : { type: 'guide', orientation: 'v', x: wp.x - THICK / 2, y: wp.y - EXT / 2, w: THICK, h: EXT });
      ctx.selectObject(obj.id);
      ctx.renderObjects();
      ctx.markDirty();
    };
    document.addEventListener('mousemove', move);
    document.addEventListener('mouseup', up);
  }
  topBar.addEventListener('mousedown', (e) => beginRulerDrag('h', e));
  leftBar.addEventListener('mousedown', (e) => beginRulerDrag('v', e));

  function clearAllGuides() {
    const hasAny = ctx.objects.some(o => o.type === 'guide');
    if (!hasAny) { ctx.showToast('No guides to clear'); return; }
    ctx.pushUndo();
    for (let i = ctx.objects.length - 1; i >= 0; i--) {
      if (ctx.objects[i].type === 'guide') ctx.objects.splice(i, 1);
    }
    ctx.renderObjects();
    ctx.markDirty();
    ctx.showToast('Guides cleared');
  }

  syncChrome();

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      .guide-ruler {
        position: fixed;
        display: none;
        background: rgba(17, 17, 17, 0.85);
        z-index: 1200;
      }
      .guide-ruler-top {
        top: var(--stage-top);
        left: calc(var(--stage-left) + 22px);
        right: calc(52px + var(--stage-rail-gap));
        height: 22px;
        border-bottom: 1px solid var(--frc-line);
        cursor: row-resize;
        transition: left 200ms ease;
      }
      .guide-ruler-left {
        top: calc(var(--stage-top) + 22px);
        left: var(--stage-left);
        bottom: var(--stage-bottom);
        width: 22px;
        border-right: 1px solid var(--frc-line);
        cursor: col-resize;
        transition: left 200ms ease;
      }
      .guide-ruler-corner {
        top: var(--stage-top);
        left: var(--stage-left);
        width: 22px; height: 22px;
        border-right: 1px solid var(--frc-line);
        border-bottom: 1px solid var(--frc-line);
        transition: left 200ms ease;
      }
      .guide-ruler canvas { display: block; width: 100%; height: 100%; }
      /* Presentation is a READ-ONLY deck view: rulers and guide lines are
         working chrome and must never sit over the slides. The kernel
         toggles body.presenting; hiding via CSS auto-restores on exit. */
      body.presenting .guide-ruler,
      body.presenting .guide-drag-line,
      body.presenting .canvas-obj.guide-obj { display: none !important; }
      .guide-drag-line {
        position: fixed;
        display: none;
        background: ${GUIDE_COLOR};
        opacity: 0.8;
        pointer-events: none;
        z-index: 3000;
      }
      /* the guide objects: invisible grab band with a 1px line centered */
      .canvas-obj.guide-obj { min-width: 0; min-height: 0; }
      .canvas-obj.guide-obj .guide-line { position: absolute; background: ${GUIDE_COLOR}; opacity: 0.8; }
      .canvas-obj.guide-obj.guide-h .guide-line { left: 0; right: 0; top: 50%; height: 1px; }
      .canvas-obj.guide-obj.guide-v .guide-line { top: 0; bottom: 0; left: 50%; width: 1px; }
      .canvas-obj.guide-obj.selected { outline: none; }
      .canvas-obj.guide-obj.selected .guide-line { opacity: 1; box-shadow: 0 0 0 1px rgba(0,255,255,0.35); }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      guide: {
        defaults: { orientation: 'h' },
        resizable: false,   // a guide is a line — move it, don't stretch it
        rotatable: false,
        // 2.0.6+ kernel hooks (ignored by older kernels):
        fitIgnore: true,    // fit-to-view frames the WORK, not the guides
        // sweep-selection skips guides entirely — a world-spanning band
        // would land in every marquee and every Ctrl+A. Click to select.
        selectable: () => false,
        // snap to the exact line (center of the band); hidden guides are
        // silent. Dragging a guide also probes with its line, so the LINE
        // lands on object edges — never the band edge, never 7px off.
        snapCandidates(obj) {
          if (!guidesOn()) return null;
          return obj.orientation === 'h'
            ? { y: [obj.y + obj.h / 2] }
            : { x: [obj.x + obj.w / 2] };
        },
        normalize(obj) {
          if (obj.orientation !== 'v') obj.orientation = 'h';
          // enforce the constant span/band regardless of what was saved
          if (obj.orientation === 'h') { obj.w = EXT; obj.h = THICK; }
          else { obj.w = THICK; obj.h = EXT; }
          obj.rotation = 0;
        },
        render(obj, el) {
          el.classList.add('guide-obj', obj.orientation === 'h' ? 'guide-h' : 'guide-v');
          el.classList.remove(obj.orientation === 'h' ? 'guide-v' : 'guide-h');
          el.innerHTML = '<div class="guide-line"></div>';
          el.style.display = guidesOn() ? '' : 'none';
          // guides ride ABOVE everything, always (below tool overlays)
          el.style.zIndex = '9000';
        },
        // no exportDraw — guides NEVER appear in JPEG/PDF/pptx exports
      },
    },

    // ── TOGGLE ── G shows/hides rulers + every guide ───────────────────
    shortcuts: [{ key: 'g', action: () => toggleGuides() }],

    // ── MENUS + rail flyout entry (Annotate family) ────────────────────
    toolbar: [
      {
        icon: '<svg viewBox="0 0 24 24"><path d="M3 3v18M3 3h18"/><path d="M8 3v4M13 3v4M18 3v4M3 8h4M3 13h4M3 18h4"/></svg>',
        title: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Guides (G)',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18M3 3h18"/><path d="M8 3v4M13 3v4M18 3v4M3 8h4M3 13h4M3 18h4"/></svg>',
            order: 6,
            action() { toggleGuides(); },
          },
        ],
      },
    ],
    canvasMenu: [
      {
        submenu: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Guides',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18M3 3h18"/><path d="M8 3v4M13 3v4M18 3v4M3 8h4M3 13h4M3 18h4"/></svg>',
            order: 6,
            submenu: [
              { label: 'Show/Hide Guides', checked: () => guidesOn(), action() { toggleGuides(); } },
              { label: 'Clear All Guides', action() { clearAllGuides(); } },
            ],
          },
        ],
      },
    ],

    // rulers reflect the project's saved visibility once it has loaded
    onReady() { syncChrome(); },
  };
}
