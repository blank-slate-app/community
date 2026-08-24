/* ═══════════════════════════════════════════════════════════════════════
   line.js — Line, by santibraby (Annotate family)

   A simple straight-line tool. Press L (or pick Line from the Annotate
   flyout), then DRAG on the canvas: down is one end, up is the other.
   Hold SHIFT while dragging to lock the line to 45° steps. The tool
   chains — keep dragging lines until Esc or switching tools.

   THREE LINE TYPES — solid, dashed, dotted — and the app's swatch row
   for color (the four oranges, grey-white, and the light ruler grey).
   Pick style + color on the bottom bar while the tool is active (the
   choice persists per project via ctx.state); right-click an existing
   line to restyle or recolor it.

   OBJECT type 'line': endpoints stored RELATIVE to the box at a frozen
   viewW/viewH (the polygon pattern) — kernel corner-resize scales the
   line, rotation is kernel-standard. Hit area is the stroke itself
   (fat invisible hit line), not the bounding box, so empty corners
   click through to objects beneath.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'line',
  name: 'Line',
  version: '1.0.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'Straight lines — drag to draw (Shift = 45° lock), three types (solid/dashed/dotted), the app swatch colors.',
};

export function register(ctx) {
  const COLORS = ['#F05300', '#F07A3C', '#F0A178', '#F0C9B4', '#F0F0F0', '#CCCCCC'];
  const TYPES = ['solid', 'dashed', 'dotted'];
  const DEFAULT_COLOR = '#CCCCCC';
  const WIDTH = 1;          // stroke width (world px) — a hairline rule
  const DASH = [5, 5];      // dashed pattern (world px) — even dash/gap
  const DOT = [0.1, 7];     // dotted pattern (round caps make the dots)
  const MIN_LEN = 4;        // drags shorter than this are ignored
  const STYLE_KEY = 'line.style';
  const COLOR_KEY = 'line.color';

  const curStyle = () => TYPES.includes(ctx.state.get(STYLE_KEY)) ? ctx.state.get(STYLE_KEY) : 'solid';
  const curColor = () => COLORS.includes(ctx.state.get(COLOR_KEY)) ? ctx.state.get(COLOR_KEY) : DEFAULT_COLOR;

  function constrain45(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (!len) return { x: to.x, y: to.y };
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  }

  function dashFor(style) {
    if (style === 'dashed') return DASH;
    if (style === 'dotted') return DOT;
    return null;
  }
  function dashAttr(style, scale) {
    const d = dashFor(style);
    return d ? ` stroke-dasharray="${d.map(v => v * (scale || 1)).join(' ')}"` : '';
  }

  // ── draw-drag (modal tool) ───────────────────────────────────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:9998;display:none;';
  const preview = document.createElementNS(SVG_NS, 'line');
  preview.setAttribute('stroke-linecap', 'round');
  overlay.appendChild(preview);
  ctx.worldEl.appendChild(overlay);

  function beginDraw(e, ctx2) {
    const a = ctx2.screenToWorld(e.clientX, e.clientY);
    overlay.style.display = 'block';
    const paint = (b) => {
      preview.setAttribute('x1', a.x); preview.setAttribute('y1', a.y);
      preview.setAttribute('x2', b.x); preview.setAttribute('y2', b.y);
      preview.setAttribute('stroke', curColor());
      preview.setAttribute('stroke-width', WIDTH);
      const d = dashFor(curStyle());
      if (d) preview.setAttribute('stroke-dasharray', d.join(' '));
      else preview.removeAttribute('stroke-dasharray');
    };
    paint(a);
    const onMove = (ev) => {
      let b = ctx2.screenToWorld(ev.clientX, ev.clientY);
      if (ev.shiftKey) b = constrain45(a, b);
      paint(b);
    };
    const onUp = (ev) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      overlay.style.display = 'none';
      let b = ctx2.screenToWorld(ev.clientX, ev.clientY);
      if (ev.shiftKey) b = constrain45(a, b);
      if (Math.hypot(b.x - a.x, b.y - a.y) * ctx2.getZoom() < MIN_LEN) return;
      const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
      const w = Math.max(10, Math.abs(b.x - a.x)), h = Math.max(10, Math.abs(b.y - a.y));
      ctx2.pushUndo();
      const obj = ctx2.createObject({
        type: 'line',
        x: minX, y: minY, w, h,
        viewW: w, viewH: h,
        pa: { x: a.x - minX, y: a.y - minY },
        pb: { x: b.x - minX, y: b.y - minY },
        lineStyle: curStyle(),
        lineColor: curColor(),
      });
      ctx2.selectObject(obj.id);
      ctx2.renderObjects();
      ctx2.markDirty();
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // ── the options bar (style + color for NEW lines) ────────────────────
  const bar = document.createElement('div');
  bar.className = 'line-bar';
  const TYPE_GLYPHS = {
    solid: '<svg width="26" height="14" viewBox="0 0 26 14"><line x1="2" y1="7" x2="24" y2="7" stroke="currentColor" stroke-width="2"/></svg>',
    dashed: '<svg width="26" height="14" viewBox="0 0 26 14"><line x1="2" y1="7" x2="24" y2="7" stroke="currentColor" stroke-width="2" stroke-dasharray="5 4"/></svg>',
    dotted: '<svg width="26" height="14" viewBox="0 0 26 14"><line x1="2" y1="7" x2="24" y2="7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-dasharray="0.1 5"/></svg>',
  };
  bar.innerHTML =
    TYPES.map(t => `<button class="line-type" data-type="${t}" title="${t[0].toUpperCase() + t.slice(1)}">${TYPE_GLYPHS[t]}</button>`).join('') +
    '<div class="line-bar-sep"></div>' +
    COLORS.map(c => `<button class="line-swatch" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('');
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('.line-type');
    if (t) { ctx.state.set(STYLE_KEY, t.dataset.type); syncBar(); return; }
    const c = e.target.closest('.line-swatch');
    if (c) { ctx.state.set(COLOR_KEY, c.dataset.color); syncBar(); }
  });
  function syncBar() {
    bar.querySelectorAll('.line-type').forEach(b => b.classList.toggle('active', b.dataset.type === curStyle()));
    bar.querySelectorAll('.line-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === curColor()));
  }

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      /* hit area = the stroke, not the box (empty corners click through) */
      .canvas-obj.line-obj { pointer-events: none; }
      .canvas-obj.line-obj svg {
        display: block; width: 100%; height: 100%;
        overflow: visible; pointer-events: none;
      }
      .canvas-obj.line-obj svg .line-hit { pointer-events: stroke; }
      .canvas-obj.line-obj .resize-handle { pointer-events: auto; }
      .canvas-obj.line-obj.selected { outline: none; }

      .line-bar {
        display: flex; gap: 8px; align-items: center;
        background: #171614; border: 1px solid #29251f; border-radius: 8px;
        padding: 8px 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.5);
      }
      .line-type {
        display: flex; align-items: center; justify-content: center;
        width: 34px; height: 26px; padding: 0;
        background: none; border: 2px solid transparent; border-radius: 4px;
        color: #CCCCCC; cursor: pointer;
        transition: border-color 120ms ease, color 120ms ease;
      }
      .line-type:hover { color: #F0F0F0; }
      .line-type.active { border-color: #F0F0F0; }
      .line-bar-sep { width: 1px; height: 20px; background: #29251f; }
      .line-swatch {
        width: 22px; height: 22px; border: 2px solid transparent; border-radius: 50%;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .line-swatch:hover { transform: scale(1.15); }
      .line-swatch.active { border-color: #F0F0F0; }
      .line-menu-swatches { display: flex; gap: 6px; align-items: center; padding: 8px 14px; }
      .line-menu-swatch {
        width: 20px; height: 20px; border: 2px solid transparent; border-radius: 50%;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .line-menu-swatch:hover { transform: scale(1.15); }
      .line-menu-swatch.active { border-color: #F0F0F0; }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      line: {
        defaults: { pa: { x: 0, y: 0 }, pb: { x: 100, y: 0 }, viewW: 100, viewH: 10, lineStyle: 'solid', lineColor: DEFAULT_COLOR },
        proportionalResize: false,
        normalize(obj) {
          const pt = (p) => (p && isFinite(p.x) && isFinite(p.y)) ? { x: Number(p.x), y: Number(p.y) } : { x: 0, y: 0 };
          obj.pa = pt(obj.pa); obj.pb = pt(obj.pb);
          if (!TYPES.includes(obj.lineStyle)) obj.lineStyle = 'solid';
          if (!COLORS.includes(obj.lineColor)) obj.lineColor = DEFAULT_COLOR;
          if (!isFinite(obj.viewW) || obj.viewW <= 0) obj.viewW = obj.w;
          if (!isFinite(obj.viewH) || obj.viewH <= 0) obj.viewH = obj.h;
        },
        render(obj, el) {
          el.classList.add('line-obj');
          const coords = `x1="${obj.pa.x}" y1="${obj.pa.y}" x2="${obj.pb.x}" y2="${obj.pb.y}"`;
          el.innerHTML =
            `<svg viewBox="0 0 ${obj.viewW} ${obj.viewH}" preserveAspectRatio="none">` +
            `<line ${coords} stroke="${obj.lineColor}" stroke-width="${WIDTH}" stroke-linecap="round"${dashAttr(obj.lineStyle)}/>` +
            `<line class="line-hit" ${coords} stroke="transparent" stroke-width="14"/>` +
            `</svg>`;
        },
        exportDraw(c2d, obj, t) {
          const sx = (obj.w / obj.viewW) * t.scaleX, sy = (obj.h / obj.viewH) * t.scaleY;
          const s = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
          c2d.save();
          c2d.strokeStyle = obj.lineColor;
          c2d.lineWidth = Math.max(1, WIDTH * s);
          c2d.lineCap = 'round';
          const d = dashFor(obj.lineStyle);
          c2d.setLineDash(d ? d.map(v => v * s) : []);
          c2d.beginPath();
          c2d.moveTo(t.x + obj.pa.x * sx, t.y + obj.pa.y * sy);
          c2d.lineTo(t.x + obj.pb.x * sx, t.y + obj.pb.y * sy);
          c2d.stroke();
          c2d.restore();
        },
        // right-click → type items + swatch row (whole selection at once)
        menu: (selObjs) => {
          const lines = (selObjs || []).filter(o => o.type === 'line');
          const cur = lines.length === 1 ? lines[0] : null;
          const typeItems = TYPES.map(tp => ({
            label: tp[0].toUpperCase() + tp.slice(1),
            checked: lines.length > 0 && lines.every(o => o.lineStyle === tp),
            action(ctx2) {
              ctx2.pushUndo();
              for (const id of ctx2.selectedIds) {
                const o = ctx2.findObject(id);
                if (o && o.type === 'line') o.lineStyle = tp;
              }
              ctx2.renderObjects(); ctx2.markDirty();
            },
          }));
          return [
            ...typeItems,
            {
              html: '<div class="line-menu-swatches">' + COLORS.map(c =>
                `<button class="line-menu-swatch${cur && cur.lineColor === c ? ' active' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`
              ).join('') + '</div>',
              onClick(e, ctx2) {
                const b = e.target.closest('.line-menu-swatch');
                if (!b) return;
                ctx2.pushUndo();
                for (const id of ctx2.selectedIds) {
                  const o = ctx2.findObject(id);
                  if (o && o.type === 'line') o.lineColor = b.dataset.color;
                }
                ctx2.renderObjects(); ctx2.markDirty();
                b.parentElement.querySelectorAll('.line-menu-swatch').forEach(sw =>
                  sw.classList.toggle('active', sw === b));
              },
            },
          ];
        },
      },
    },

    // ── THE TOOL (modal, Annotate family) ──────────────────────────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><line x1="4" y1="20" x2="20" y2="4"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="4" r="1.5"/></svg>',
      title: 'Line (L)',
      family: 'Annotate',
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 7,
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
      shortcut: 'l',
      cursor: 'crosshair',
      onActivate(ctx2) { syncBar(); ctx2.showBar(bar); },
      onDeactivate(ctx2) { ctx2.hideBar(); },
      onPointerDown(e, ctx2) {
        if (e.target.closest('.resize-handle') || e.target.closest('[contenteditable="true"]')) return false;
        e.preventDefault();
        ctx2.clearSelection();
        beginDraw(e, ctx2);
        return true;
      },
    },

    // ── MENUS ── entry in the shared "Annotate ▶" submenu ──────────────
    canvasMenu: [
      {
        submenu: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Line',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="4" y1="20" x2="20" y2="4"/></svg>',
            order: 7,
            action(ctx2) { ctx2.setTool('line'); },
          },
        ],
      },
    ],
  };
}
