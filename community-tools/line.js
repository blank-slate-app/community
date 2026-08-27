/* ═══════════════════════════════════════════════════════════════════════
   line.js — Line, by santibraby (Annotate family)

   A simple straight-line tool. Press L (or pick Line from the Annotate
   flyout), then DRAG on the canvas: down is one end, up is the other.
   Hold SHIFT while dragging to lock the line to 45° steps. The tool
   chains — keep dragging lines until Esc or switching tools.

   THREE LINE TYPES — solid, dashed, dotted — and the app's swatch row
   for color (the four oranges, grey-white, and the light ruler grey).
   Pick style + color + THICKNESS (a − Npx + stepper, 1–20px; dash and
   dot patterns scale with it) on the bottom bar while the tool is
   active (the choices persist per project via ctx.state); right-click
   an existing line to restyle, recolor, or re-weight it.

   OBJECT type 'line': endpoints stored RELATIVE to the box (viewW/viewH
   scale legacy boards). A line is TWO POINTS, not a box: kernel corner
   handles are off (resizable: false — box-stretching a stroke distorts
   its thickness). Select a line and two round GRIPS appear at its ends;
   drag one to move that endpoint (Shift = 45° lock from the other end).
   Thickness and style always render exactly as chosen. Hit area is the
   stroke itself (fat invisible hit line), not the bounding box, so
   empty corners click through to objects beneath.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'line',
  name: 'Line',
  version: '1.2.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'Straight lines — drag to draw (Shift = 45° lock), three types (solid/dashed/dotted), pixel thickness 1–20, the app swatch colors.',
};

export function register(ctx) {
  const COLORS = ['#F05300', '#F07A3C', '#F0A178', '#F0C9B4', '#F0F0F0', '#CCCCCC'];
  const TYPES = ['solid', 'dashed', 'dotted'];
  const DEFAULT_COLOR = '#CCCCCC';
  const DEFAULT_WIDTH = 1;  // stroke width (world px) — a hairline rule
  const MIN_W = 1, MAX_W = 20;
  const DASH = [5, 5];      // dashed pattern AT 1px — scales with width
  const DOT = [0.1, 7];     // dotted pattern AT 1px (round caps = dots)
  const MIN_LEN = 4;        // drags shorter than this are ignored
  const STYLE_KEY = 'line.style';
  const COLOR_KEY = 'line.color';
  const WIDTH_KEY = 'line.width';

  const clampW = (v) => Math.max(MIN_W, Math.min(MAX_W, Math.round(Number(v) || DEFAULT_WIDTH)));
  const widthOf = (obj) => clampW(obj.strokeWidth);
  const curStyle = () => TYPES.includes(ctx.state.get(STYLE_KEY)) ? ctx.state.get(STYLE_KEY) : 'solid';
  const curColor = () => COLORS.includes(ctx.state.get(COLOR_KEY)) ? ctx.state.get(COLOR_KEY) : DEFAULT_COLOR;
  const curWidth = () => clampW(ctx.state.get(WIDTH_KEY) || DEFAULT_WIDTH);

  function constrain45(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (!len) return { x: to.x, y: to.y };
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  }

  // Patterns scale with the stroke: a 4px dashed line dashes 20-on
  // 20-off, a 4px dotted line spaces its dots 28 apart — at 1px both
  // collapse to the original hairline patterns.
  function dashFor(style, w) {
    const k = clampW(w || 1);
    if (style === 'dashed') return DASH.map(v => v * k);
    if (style === 'dotted') return [DOT[0], DOT[1] * k];
    return null;
  }
  function dashAttr(style, w) {
    const d = dashFor(style, w);
    return d ? ` stroke-dasharray="${d.join(' ')}"` : '';
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
      preview.setAttribute('stroke-width', curWidth());
      const d = dashFor(curStyle(), curWidth());
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
        strokeWidth: curWidth(),
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
    '<button class="line-wbtn" data-d="-1" title="Thinner">−</button>' +
    '<span class="line-wval">1px</span>' +
    '<button class="line-wbtn" data-d="1" title="Thicker">+</button>' +
    '<div class="line-bar-sep"></div>' +
    COLORS.map(c => `<button class="line-swatch" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('');
  bar.addEventListener('click', (e) => {
    const t = e.target.closest('.line-type');
    if (t) { ctx.state.set(STYLE_KEY, t.dataset.type); syncBar(); return; }
    const wb = e.target.closest('.line-wbtn');
    if (wb) { ctx.state.set(WIDTH_KEY, clampW(curWidth() + Number(wb.dataset.d))); syncBar(); return; }
    const c = e.target.closest('.line-swatch');
    if (c) { ctx.state.set(COLOR_KEY, c.dataset.color); syncBar(); }
  });
  function syncBar() {
    bar.querySelectorAll('.line-type').forEach(b => b.classList.toggle('active', b.dataset.type === curStyle()));
    bar.querySelector('.line-wval').textContent = curWidth() + 'px';
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
      .canvas-obj.line-obj.selected { outline: none; }
      /* endpoint grips: THE selection affordance (no box, no corner
         handles) — grab one to move that end of the line */
      .canvas-obj.line-obj .line-grip {
        display: none;
        position: absolute;
        width: 12px; height: 12px;
        margin: -6px 0 0 -6px;
        border-radius: 50%;
        background: #111111;
        border: 2px solid #F0C4A0;
        box-sizing: border-box;
        pointer-events: auto;
        cursor: grab;
      }
      .canvas-obj.line-obj.selected .line-grip { display: block; }
      .canvas-obj.line-obj .line-grip:hover { background: #F0C4A0; }

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
      .line-wbtn {
        width: 22px; height: 22px; padding: 0;
        background: none; border: 1px solid #3a362f; border-radius: 4px;
        color: #CCCCCC; cursor: pointer; font-size: 14px; line-height: 1;
        transition: border-color 120ms ease, color 120ms ease;
      }
      .line-wbtn:hover { color: #F0F0F0; border-color: #F0F0F0; }
      .line-wval {
        min-width: 34px; text-align: center;
        font-family: var(--mono, monospace); font-size: 12px; color: #F0C4A0;
        font-variant-numeric: tabular-nums;
      }
      .line-menu-width {
        display: flex; gap: 8px; align-items: center; padding: 8px 14px;
        font-family: var(--font-sans);
      }
      .line-menu-width .lmw-label { font-size: 12px; color: #bbb; margin-right: auto; }
      .line-menu-width .lmw-btn {
        width: 22px; height: 22px; padding: 0;
        background: none; border: 1px solid #3a362f; border-radius: 4px;
        color: #CCCCCC; cursor: pointer; font-size: 14px; line-height: 1;
      }
      .line-menu-width .lmw-btn:hover { color: #F0F0F0; border-color: #F0F0F0; }
      .line-menu-width .lmw-val {
        min-width: 38px; text-align: center;
        font-family: var(--mono, monospace); font-size: 12px; color: #F0C4A0;
        font-variant-numeric: tabular-nums;
      }
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
        defaults: { pa: { x: 0, y: 0 }, pb: { x: 100, y: 0 }, viewW: 100, viewH: 10, lineStyle: 'solid', lineColor: DEFAULT_COLOR, strokeWidth: DEFAULT_WIDTH },
        resizable: false, // a line is two points — drag its GRIPS, never a box corner
        normalize(obj) {
          const pt = (p) => (p && isFinite(p.x) && isFinite(p.y)) ? { x: Number(p.x), y: Number(p.y) } : { x: 0, y: 0 };
          obj.pa = pt(obj.pa); obj.pb = pt(obj.pb);
          if (!TYPES.includes(obj.lineStyle)) obj.lineStyle = 'solid';
          if (!COLORS.includes(obj.lineColor)) obj.lineColor = DEFAULT_COLOR;
          obj.strokeWidth = clampW(obj.strokeWidth);
          if (!isFinite(obj.viewW) || obj.viewW <= 0) obj.viewW = obj.w;
          if (!isFinite(obj.viewH) || obj.viewH <= 0) obj.viewH = obj.h;
        },
        render(obj, el) {
          el.classList.add('line-obj');
          const w = widthOf(obj);
          const coords = `x1="${obj.pa.x}" y1="${obj.pa.y}" x2="${obj.pb.x}" y2="${obj.pb.y}"`;
          const sxV = obj.w / (obj.viewW || obj.w), syV = obj.h / (obj.viewH || obj.h);
          el.innerHTML =
            `<svg viewBox="0 0 ${obj.viewW} ${obj.viewH}" preserveAspectRatio="none">` +
            `<line ${coords} stroke="${obj.lineColor}" stroke-width="${w}" stroke-linecap="round"${dashAttr(obj.lineStyle, w)}/>` +
            `<line class="line-hit" ${coords} stroke="transparent" stroke-width="${Math.max(14, w + 8)}"/>` +
            `</svg>` +
            `<div class="line-grip" data-end="a" style="left:${obj.pa.x * sxV}px;top:${obj.pa.y * syV}px"></div>` +
            `<div class="line-grip" data-end="b" style="left:${obj.pb.x * sxV}px;top:${obj.pb.y * syV}px"></div>`;
        },
        exportDraw(c2d, obj, t) {
          const sx = (obj.w / obj.viewW) * t.scaleX, sy = (obj.h / obj.viewH) * t.scaleY;
          const s = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
          const w = widthOf(obj);
          c2d.save();
          c2d.strokeStyle = obj.lineColor;
          c2d.lineWidth = Math.max(1, w * s);
          c2d.lineCap = 'round';
          const d = dashFor(obj.lineStyle, w);
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
          // one undo per menu visit, however many nudges (gantt's pattern)
          let widthUndoPushed = false;
          const widthRow = {
            html:
              `<div class="line-menu-width">` +
              `<span class="lmw-label">Thickness</span>` +
              `<button class="lmw-btn" data-d="-1">−</button>` +
              `<span class="lmw-val">${cur ? widthOf(cur) + 'px' : '—'}</span>` +
              `<button class="lmw-btn" data-d="1">+</button>` +
              `</div>`,
            onClick(e, ctx2) {
              const b = e.target.closest('.lmw-btn');
              if (!b) return;
              if (!widthUndoPushed) { ctx2.pushUndo(); widthUndoPushed = true; }
              let shown = null;
              for (const id of ctx2.selectedIds) {
                const o = ctx2.findObject(id);
                if (o && o.type === 'line') {
                  o.strokeWidth = clampW(widthOf(o) + Number(b.dataset.d));
                  if (shown === null) shown = o.strokeWidth;
                }
              }
              if (shown !== null) {
                ctx2.state.set(WIDTH_KEY, shown); // new lines follow the last weight
                const val = b.parentElement.querySelector('.lmw-val');
                if (val) val.textContent = shown + 'px';
                ctx2.renderObjects();
                ctx2.markDirty();
              }
            },
          };
          return [
            ...typeItems,
            widthRow,
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

    // ── RAW POINTER ── endpoint grips (before markup note-drag at 250)
    pointer: [
      {
        priority: 245,
        handler(e, ctx2) {
          if (e.button !== 0) return false;
          const grip = e.target.closest('.line-grip');
          if (!grip) return false;
          const objEl = e.target.closest('.canvas-obj');
          const obj = objEl && ctx2.findObject(parseInt(objEl.dataset.id));
          if (!obj || obj.type !== 'line') return false;
          e.preventDefault();
          ctx2.pushUndo();
          ctx2.selectObject(obj.id);
          const end = grip.dataset.end;
          const sxV = obj.w / (obj.viewW || obj.w), syV = obj.h / (obj.viewH || obj.h);
          const other = end === 'a' ? obj.pb : obj.pa;
          const fixed = { x: obj.x + other.x * sxV, y: obj.y + other.y * syV };
          function onMove(ev) {
            let p = ctx2.screenToWorld(ev.clientX, ev.clientY);
            if (ev.shiftKey) p = constrain45(fixed, p);
            const a = end === 'a' ? p : fixed;
            const b = end === 'b' ? p : fixed;
            const minX = Math.min(a.x, b.x), minY = Math.min(a.y, b.y);
            obj.x = minX; obj.y = minY;
            obj.w = Math.max(10, Math.abs(b.x - a.x));
            obj.h = Math.max(10, Math.abs(b.y - a.y));
            obj.viewW = obj.w; obj.viewH = obj.h; // any legacy box-stretch heals here
            obj.pa = { x: a.x - minX, y: a.y - minY };
            obj.pb = { x: b.x - minX, y: b.y - minY };
            ctx2.renderObjects();
            ctx2.markDirty();
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          return true;
        },
      },
    ],

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
