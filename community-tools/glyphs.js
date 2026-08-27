/* ═══════════════════════════════════════════════════════════════════════
   glyphs.js — Glyphs, by santibraby (Annotate family)

   A stamp tool for simple stroke glyphs — star, lightbulb, bag, truck,
   wrench, ruler… — drawn in the app's own icon dialect: 24×24, 2px
   stroke, round caps, no fills. Pick a glyph on the bottom bar, click
   the canvas to place it (64px, centered on the click; the tool chains).

   A placed glyph is a normal object: corner-scale it (aspect locked),
   right-click for the color swatches, or REPLACE the glyph in place
   from the same menu — the box, color and position stay, only the
   drawing swaps.

   Glyph art is pure SVG path data (arcs for circles), so display and
   export share the same bytes: the canvas exporter strokes the exact
   paths through Path2D. Everything scales as vectors — crisp at 300dpi.

   OBJECT type 'glyph': { glyphId, glyphColor }.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'glyphs',
  name: 'Glyphs',
  version: '1.0.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'Stamp simple stroke glyphs — star, lightbulb, bag, truck, wrench, ruler and friends — scalable, recolorable, replaceable in place.',
};

export function register(ctx) {
  const COLORS = ['#F0F0F0', '#111111', '#F05300', '#F07A3C', '#F0A178', '#F0C9B4', '#999999', '#CCCCCC'];
  const DEFAULT_COLOR = '#F0F0F0';
  const PLACE_SIZE = 64;
  const GLYPH_KEY = 'glyphs.current';
  const COLOR_KEY = 'glyphs.color';

  // ── the set — official Lucide path data (lucide.dev, ISC license),
  // extracted from lucide-static v1.34.0 and baked in: no runtime
  // dependency, display and export stroke the same bytes
  const GLYPHS = {
    star:      { name: 'Star', d: ['M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z'] },
    heart:     { name: 'Heart', d: ['M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5'] },
    lightbulb: { name: 'Lightbulb', d: ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'] },
    zap:       { name: 'Lightning', d: ['M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z'] },
    flag:      { name: 'Flag', d: ['M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528'] },
    pin:       { name: 'Pin', d: ['M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0', 'M 9 10 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0'] },
    house:     { name: 'House', d: ['M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8', 'M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'] },
    truck:     { name: 'Truck', d: ['M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2', 'M15 18H9', 'M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14', 'M 15 18 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0', 'M 5 18 a 2 2 0 1 0 4 0 a 2 2 0 1 0 -4 0'] },
    box:       { name: 'Box', d: ['M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z', 'M12 22V12', 'M 3.29 7 L 12 12 L 20.71 7', 'm7.5 4.27 9 5.15'] },
    tag:       { name: 'Tag', d: ['M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z', 'M 7 7.5 a 0.5 0.5 0 1 0 1 0 a 0.5 0.5 0 1 0 -1 0'] },
    bag:       { name: 'Bag', d: ['M16 10a4 4 0 0 1-8 0', 'M3.103 6.034h17.794', 'M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z'] },
    folder:    { name: 'Folder', d: ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'] },
    mail:      { name: 'Mail', d: ['m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7', 'M 4 4 h 16 a 2 2 0 0 1 2 2 v 12 a 2 2 0 0 1 -2 2 h -16 a 2 2 0 0 1 -2 -2 v -12 a 2 2 0 0 1 2 -2 Z'] },
    phone:     { name: 'Phone', d: ['M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384'] },
    message:   { name: 'Message', d: ['M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z'] },
    calendar:  { name: 'Calendar', d: ['M8 2v3', 'M16 2v3', 'M 5 3 h 14 a 2 2 0 0 1 2 2 v 14 a 2 2 0 0 1 -2 2 h -14 a 2 2 0 0 1 -2 -2 v -14 a 2 2 0 0 1 2 -2 Z', 'M3 9h18'] },
    clock:     { name: 'Clock', d: ['M 2 12 a 10 10 0 1 0 20 0 a 10 10 0 1 0 -20 0', 'M12 6v6l4 2'] },
    bell:      { name: 'Bell', d: ['M10.268 21a2 2 0 0 0 3.464 0', 'M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326'] },
    bookmark:  { name: 'Bookmark', d: ['M17 3a2 2 0 0 1 2 2v15a1 1 0 0 1-1.496.868l-4.512-2.578a2 2 0 0 0-1.984 0l-4.512 2.578A1 1 0 0 1 5 20V5a2 2 0 0 1 2-2z'] },
    camera:    { name: 'Camera', d: ['M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4z', 'M 9 13 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0'] },
    eye:       { name: 'Eye', d: ['M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0', 'M 9 12 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0'] },
    lock:      { name: 'Lock', d: ['M 5 11 h 14 a 2 2 0 0 1 2 2 v 7 a 2 2 0 0 1 -2 2 h -14 a 2 2 0 0 1 -2 -2 v -7 a 2 2 0 0 1 2 -2 Z', 'M7 11V7a5 5 0 0 1 10 0v4'] },
    sun:       { name: 'Sun', d: ['M 8 12 a 4 4 0 1 0 8 0 a 4 4 0 1 0 -8 0', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'] },
    moon:      { name: 'Moon', d: ['M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401'] },
    cloud:     { name: 'Cloud', d: ['M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z'] },
    check:     { name: 'Check', d: ['M20 6 9 17l-5-5'] },
    x:         { name: 'X', d: ['M18 6 6 18', 'm6 6 12 12'] },
    plus:      { name: 'Plus', d: ['M5 12h14', 'M12 5v14'] },
    arrow:     { name: 'Arrow', d: ['M5 12h14', 'm12 5 7 7-7 7'] },
    wrench:    { name: 'Wrench', d: ['M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.106-3.105c.32-.322.863-.22.983.218a6 6 0 0 1-8.259 7.057l-7.91 7.91a1 1 0 0 1-2.999-3l7.91-7.91a6 6 0 0 1 7.057-8.259c.438.12.54.662.219.984z'] },
    ruler:     { name: 'Ruler', d: ['M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z', 'm14.5 12.5 2-2', 'm11.5 9.5 2-2', 'm8.5 6.5 2-2', 'm17.5 15.5 2-2'] },
    hammer:    { name: 'Hammer', d: ['m15 12-9.373 9.373a1 1 0 0 1-3.001-3L12 9', 'm18 15 4-4', 'm21.5 11.5-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5'] },
    scissors:  { name: 'Scissors', d: ['M 3 6 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0', 'M8.12 8.12 12 12', 'M20 4 8.12 15.88', 'M 3 18 a 3 3 0 1 0 6 0 a 3 3 0 1 0 -6 0', 'M14.8 14.8 20 20'] },
    roller:    { name: 'Paint Roller', d: ['M 4 2 h 12 a 2 2 0 0 1 2 2 v 2 a 2 2 0 0 1 -2 2 h -12 a 2 2 0 0 1 -2 -2 v -2 a 2 2 0 0 1 2 -2 Z', 'M10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2', 'M 9 16 h 2 a 1 1 0 0 1 1 1 v 4 a 1 1 0 0 1 -1 1 h -2 a 1 1 0 0 1 -1 -1 v -4 a 1 1 0 0 1 1 -1 Z'] },
  };
  const GLYPH_IDS = Object.keys(GLYPHS);
  const DEFAULT_GLYPH = 'star';

  const curGlyph = () => GLYPH_IDS.includes(ctx.state.get(GLYPH_KEY)) ? ctx.state.get(GLYPH_KEY) : DEFAULT_GLYPH;
  const curColor = () => COLORS.includes(ctx.state.get(COLOR_KEY)) ? ctx.state.get(COLOR_KEY) : DEFAULT_COLOR;

  // one glyph as inline svg markup (shared by canvas render, bar, menu)
  function glyphSvg(id, color, size) {
    const g = GLYPHS[id] || GLYPHS[DEFAULT_GLYPH];
    return `<svg viewBox="0 0 24 24" ${size ? `width="${size}" height="${size}"` : ''} fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
      g.d.map(d => `<path d="${d}"/>`).join('') + '</svg>';
  }

  // ── the picker bar (glyph grid + swatches) ──────────────────────────
  const bar = document.createElement('div');
  bar.className = 'glyphs-bar';
  bar.innerHTML =
    `<div class="glyphs-grid">` +
    GLYPH_IDS.map(id => `<button class="glyphs-cell" data-glyph="${id}" title="${GLYPHS[id].name}">${glyphSvg(id, 'currentColor', 18)}</button>`).join('') +
    `</div><div class="glyphs-bar-sep"></div><div class="glyphs-colors">` +
    COLORS.map(c => `<button class="glyphs-swatch" data-color="${c}" title="${c}" style="background:${c}"></button>`).join('') +
    `</div>`;
  bar.addEventListener('click', (e) => {
    const g = e.target.closest('.glyphs-cell');
    if (g) { ctx.state.set(GLYPH_KEY, g.dataset.glyph); syncBar(); return; }
    const c = e.target.closest('.glyphs-swatch');
    if (c) { ctx.state.set(COLOR_KEY, c.dataset.color); syncBar(); }
  });
  function syncBar() {
    bar.querySelectorAll('.glyphs-cell').forEach(b => b.classList.toggle('active', b.dataset.glyph === curGlyph()));
    bar.querySelectorAll('.glyphs-swatch').forEach(b => b.classList.toggle('active', b.dataset.color === curColor()));
  }

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      .canvas-obj.glyph-obj { background: transparent; }
      .canvas-obj.glyph-obj svg {
        display: block; width: 100%; height: 100%;
        pointer-events: none;
      }
      .glyphs-bar {
        display: flex; gap: 10px; align-items: center;
        background: #171614; border: 1px solid #29251f; border-radius: 8px;
        padding: 8px 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.5);
        max-width: 560px;
      }
      .glyphs-grid { display: flex; flex-wrap: wrap; gap: 2px; max-width: 320px; }
      .glyphs-cell {
        display: flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; padding: 0;
        background: none; border: 2px solid transparent; border-radius: 4px;
        color: #CCCCCC; cursor: pointer;
        transition: border-color 120ms ease, color 120ms ease;
      }
      .glyphs-cell:hover { color: #F0F0F0; }
      .glyphs-cell.active { border-color: #F0F0F0; color: #F0F0F0; }
      .glyphs-bar-sep { width: 1px; align-self: stretch; background: #29251f; }
      .glyphs-colors { display: flex; flex-wrap: wrap; gap: 6px; max-width: 120px; }
      .glyphs-swatch {
        width: 20px; height: 20px; border: 2px solid transparent; border-radius: 50%;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .glyphs-swatch:hover { transform: scale(1.15); }
      .glyphs-swatch.active { border-color: #F0F0F0; }
      .glyphs-menu-swatches { display: flex; gap: 6px; align-items: center; padding: 8px 14px; }
      .glyphs-menu-swatch {
        width: 20px; height: 20px; border: 2px solid transparent; border-radius: 50%;
        cursor: pointer; padding: 0;
      }
      .glyphs-menu-swatch:hover { transform: scale(1.15); }
      .glyphs-menu-swatch.active { border-color: #F0F0F0; }
      .glyphs-menu-grid {
        display: flex; flex-wrap: wrap; gap: 2px;
        padding: 8px 14px; width: 232px;
        max-height: 180px; overflow-y: auto;
      }
      .glyphs-menu-cell {
        display: flex; align-items: center; justify-content: center;
        width: 26px; height: 26px; padding: 0;
        background: none; border: 2px solid transparent; border-radius: 4px;
        color: #CCCCCC; cursor: pointer;
      }
      .glyphs-menu-cell:hover { color: #F0F0F0; }
      .glyphs-menu-cell.active { border-color: #F0F0F0; color: #F0F0F0; }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      glyph: {
        defaults: { glyphId: DEFAULT_GLYPH, glyphColor: DEFAULT_COLOR },
        proportionalResize: true, // glyphs scale square from the corners
        normalize(obj) {
          if (!GLYPH_IDS.includes(obj.glyphId)) obj.glyphId = DEFAULT_GLYPH;
          if (!COLORS.includes(obj.glyphColor)) obj.glyphColor = DEFAULT_COLOR;
        },
        render(obj, el) {
          el.classList.add('glyph-obj');
          el.innerHTML = glyphSvg(obj.glyphId, obj.glyphColor);
        },
        // Stroke the SAME path data through Path2D — display === export
        exportDraw(c2d, obj, t) {
          if (typeof Path2D === 'undefined') return;
          const g = GLYPHS[obj.glyphId] || GLYPHS[DEFAULT_GLYPH];
          const s = Math.min(obj.w * t.scaleX, obj.h * t.scaleY) / 24;
          if (!(s > 0)) return;
          c2d.save();
          c2d.translate(
            t.x + (obj.w * t.scaleX - 24 * s) / 2,
            t.y + (obj.h * t.scaleY - 24 * s) / 2);
          c2d.scale(s, s);
          c2d.strokeStyle = obj.glyphColor;
          c2d.lineWidth = 2;
          c2d.lineCap = 'round';
          c2d.lineJoin = 'round';
          for (const d of g.d) c2d.stroke(new Path2D(d));
          c2d.restore();
        },
        // right-click → swatches + replace-in-place grid
        menu: (selObjs) => {
          const glyphs = (selObjs || []).filter(o => o.type === 'glyph');
          const cur = glyphs.length ? glyphs[0] : null;
          if (!cur) return [];
          return [
            {
              html: '<div class="glyphs-menu-swatches">' + COLORS.map(c =>
                `<button class="glyphs-menu-swatch${cur.glyphColor === c ? ' active' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`
              ).join('') + '</div>',
              onClick(e, ctx2) {
                const b = e.target.closest('.glyphs-menu-swatch');
                if (!b) return;
                ctx2.pushUndo();
                for (const o of glyphs) o.glyphColor = b.dataset.color;
                ctx2.renderObjects(); ctx2.markDirty();
                b.parentElement.querySelectorAll('.glyphs-menu-swatch').forEach(sw =>
                  sw.classList.toggle('active', sw === b));
              },
            },
            {
              html: '<div class="glyphs-menu-grid">' + GLYPH_IDS.map(id =>
                `<button class="glyphs-menu-cell${cur.glyphId === id ? ' active' : ''}" data-glyph="${id}" title="${GLYPHS[id].name}">${glyphSvg(id, 'currentColor', 18)}</button>`
              ).join('') + '</div>',
              onClick(e, ctx2) {
                const b = e.target.closest('.glyphs-menu-cell');
                if (!b) return;
                ctx2.pushUndo();
                for (const o of glyphs) o.glyphId = b.dataset.glyph; // box, color, position stay — the drawing swaps
                ctx2.renderObjects(); ctx2.markDirty();
                b.parentElement.querySelectorAll('.glyphs-menu-cell').forEach(cell =>
                  cell.classList.toggle('active', cell === b));
              },
            },
          ];
        },
      },
    },

    // ── THE TOOL (modal, Annotate family) ──────────────────────────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><path d="M12 2 L14.9 8.6 L22 9.3 L16.7 14 L18.2 21.2 L12 17.5 L5.8 21.2 L7.3 14 L2 9.3 L9.1 8.6 Z"/></svg>',
      title: 'Glyphs',
      family: 'Annotate',
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 8,
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L14.9 8.6 L22 9.3 L16.7 14 L18.2 21.2 L12 17.5 L5.8 21.2 L7.3 14 L2 9.3 L9.1 8.6 Z"/></svg>',
      cursor: 'crosshair',
      onActivate(ctx2) { syncBar(); ctx2.showBar(bar); },
      onDeactivate(ctx2) { ctx2.hideBar(); },
      onPointerDown(e, ctx2) {
        if (e.target.closest('.resize-handle') || e.target.closest('[contenteditable="true"]')) return false;
        e.preventDefault();
        ctx2.clearSelection();
        const p = ctx2.screenToWorld(e.clientX, e.clientY);
        ctx2.pushUndo();
        const obj = ctx2.createObject({
          type: 'glyph',
          x: p.x - PLACE_SIZE / 2, y: p.y - PLACE_SIZE / 2,
          w: PLACE_SIZE, h: PLACE_SIZE,
          glyphId: curGlyph(),
          glyphColor: curColor(),
        });
        ctx2.selectObject(obj.id);
        ctx2.renderObjects();
        ctx2.markDirty();
        return true; // the tool chains — keep stamping
      },
    },

    // ── MENUS ── entry in the shared "Annotate ▶" submenu ──────────────
    canvasMenu: [
      {
        submenu: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Glyphs',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 L14.9 8.6 L22 9.3 L16.7 14 L18.2 21.2 L12 17.5 L5.8 21.2 L7.3 14 L2 9.3 L9.1 8.6 Z"/></svg>',
            order: 8,
            action(ctx2) { ctx2.setTool('glyphs'); },
          },
        ],
      },
    ],
  };
}
