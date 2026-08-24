/* ═══════════════════════════════════════════════════════════════════════
   gantt.js — Gantt Chart, by santibraby

   A grid of equally-spaced cells + task bars that live IN the cells.

   THE GRID (type 'gantt'): vertical and horizontal lines forming cells.
   Move it and its bars ride along; resize it (kernel corner handles) and
   the cells — and every bar — rescale live. Hover the bottom-right: a
   +/− pair on the RIGHT edge adds/removes VERTICAL lines (columns) and
   a +/− pair on the BOTTOM edge adds/removes HORIZONTAL lines (rows).
   The boundary never moves — lines redistribute equally (bars clamp).

   THE BARS (type 'gantt-bar'): double-click an empty cell and type — the
   cell becomes a filled rectangle with text on top, styled like the
   flowchart boxes (same fill palette, same type, right-click for the
   swatch row). The last swatch is CLEAR — no fill and no boundary
   rectangle, just the task text in the cell; pick it for several selected
   bars at once to strip a whole chart back to text. Cell TEXT is one
   colour (BAR_INK) whatever the fill under it, clear included.
   TEXT SIZE is a property of the CHART, not the bar: right-click the
   grid → Text Size − / + steps every cell on it at once (8–40, stored in
   obj.barFontSize as a deviation from the 15px default) and any cell
   added later matches. The menu stays open while you step, and one visit
   to it is one undo entry however many times you click. The same menu
   carries CHANGE CASE ▶ UPPERCASE / lowercase / Title Case, which
   rewrites every cell label on the chart in one undo step (bar labels are
   plain strings, so this is a straight rewrite — undo restores).
   Bars store their position LOGICALLY (col/row/colsSpan/
   rowsSpan) and derive x/y/w/h from the grid on every render — the
   flowchart-connector pattern (bbox derived, not authored) — so grid
   moves, grid resizes, and line add/remove all reflow bars for free.
   Drag a bar to move it cell to cell (live magnetic snapping via
   onObjectsMoved); drag its bottom-right grip to span multiple cells.
   Alt-drag duplicates a bar into another cell. Deleting a grid deletes
   its bars (onDelete cascade, like flowchart connectors).

   THE LINES (1.1.0): drawn in the app's light grey (#CCCCCC) at full
   opacity. No border around the chart except the TOP line, which runs
   2× weight; SOLID verticals tick 15px past it (dashed ones stay flush)
   — a timeline-ruler read. EVERY vertical (any style, edges included)
   carries an optional TEXT LABEL rotated 90° CCW, reading bottom-to-top
   from one shared baseline height above the top edge: click one to
   type (empty ones ghost as ··· on hover), Enter/blur commits, stored
   in obj.tickLabels keyed like the lines ('v3'). Labels are
   independent of line dress — restyle or delete a line and its label
   stays put. COLUMN HEADERS live alongside them: horizontal text
   centered over each column at the same baseline height (obj.colLabels,
   cell-keyed 'c0'…), same click-to-type/ghost grammar — line labels
   name the BOUNDARIES, column headers name the SPANS. Double-click
   ON a line (±8 screen px) — or right-click the grid → Edit Lines… — to
   enter LINE-EDIT mode: click a line to select it (Shift-click adds —
   multi-select works for styling and deleting alike), right-click for
   Solid / Dashed / Invisible / Delete, Esc (or click away) to finish.
   DELETE removes the whole DIVISION — a vertical takes its COLUMN, a
   horizontal takes its ROW, along with that line's label, the column
   header, and any bar whose only cell was in it (the toast says how
   many). cols/rows drop, so the survivors re-space evenly inside the
   same boundary and spanning bars shorten. A mixed selection goes in one
   undo step; a chart always keeps at least one cell. To drop a line but
   KEEP its cell — merging two cells visually while the bar math stays
   put — use Invisible instead. With
   exactly ONE line selected, the +/− controls' + inserts the new line
   right AFTER it (bars shift over, spanning bars stretch, styles and
   labels ride their lines); otherwise + appends at the end as always. Invisible and deleted lines ghost while
   editing so they can be found and restored. EVERY line exists,
   edges included. DEFAULT DRESS: the top edge solid-thick, interior
   VERTICALS solid (they carry the ticks), interior HORIZONTALS dashed
   (row guides read softer than time boundaries), and the left/right/
   bottom edges INVISIBLE (restyle them to bring the border back). Styles live per-line in obj.lineStyles as
   deviations from each line's own default; the CELL math never changes
   — bars still snap to the logical grid, a hidden line just merges
   cells visually. Double-clicking cell INTERIORS still creates bars.

   ALT-DRAG a grid and the WHOLE CHART duplicates — every bar comes
   along, re-homed to the new grid (each grid carries a selfId field so
   its clone can still find the source's bars; kernel-cloned bars in a
   mixed selection re-home via a microtask remap after the kernel's
   duplicate loop finishes). Alt-dragging just a BAR still copies the
   task within its own grid.

   V1 boundaries (by design, remix away): bars stay on their own grid;
   labels are plain text.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'gantt',
  name: 'Gantt Chart',
  version: '1.1.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'A cell grid with flowchart-style task bars: double-click a cell to type, drag bars between cells, stretch them across cells, +/− lines on hover, double-click a line to edit it (solid/dashed/delete).',
};

export function register(ctx) {
  // flowchart's palette + box look (bars must read as family)
  const COLORS = ['#F05300', '#F07A3C', '#F0A178', '#F0C9B4', '#F0F0F0'];
  const DEFAULT_FILL = '#F0C9B4';
  // CLEAR: no chip at all — no fill, no boundary rectangle, just the task
  // text in the cell. Stored as fillColor 'none', the same vocabulary the
  // line styles use for "absent". Its label flips to the app's light ink,
  // since the dark chip text would vanish against the canvas.
  const CLEAR = 'none';
  // Cell text is ONE colour whatever the fill under it — a clear cell
  // reads the same as a peach one. (Change these two and every bar,
  // on canvas and in export, follows.)
  const BAR_INK = '#222222';       // very dark grey — near-black, not black
  const BAR_INK_GHOST = '#8A8A8A'; // the 'Task' placeholder, same family
  const FILLS = [...COLORS, CLEAR];
  const GREY = '#CCCCCC';  // the LINES — the app's light grey, 100% opacity
  const LABEL_GREY = '#999999'; // label default (the grey in the swatch row),
                                // matching the timeline
  const DASH = 7;          // dashed-line period (world px)
  const LINE_W = 1.5;      // regular line weight (world px)
  const TOP_W = 3;         // the top edge — 2× the regular weight
  const TICK = 15;         // SOLID verticals extend this far past the top edge
  const TICK_GAP = 6;      // gap between a tick's tip and its label
  const TICK_FONT = 13;    // tick-label size (world px, JetBrains Mono)
  const INSET = 4;         // bar chip inset inside its cells (world px)
  // Bar-label size lives on the CHART, not the bar: one setting drives
  // every cell and any cell added later. Stored as a deviation — null
  // means BAR_FONT, like every other default in this file.
  const BAR_FONT = 15;
  const BAR_FONT_MIN = 8, BAR_FONT_MAX = 40;
  const MAXLINES = 60;

  const DEF_COLS = 8, DEF_ROWS = 5;
  const DEF_W = 1040, DEF_H = 280; // 130 × 56 cells

  // 2.0.6+ kernels expose ctx.getObjectElement; fall back for older ones.
  function objectEl(id) {
    return ctx.getObjectElement
      ? ctx.getObjectElement(id)
      : ctx.worldEl.querySelector(`.canvas-obj[data-id="${id}"]`);
  }

  function darken(hex, f) {
    const n = parseInt(String(hex || DEFAULT_FILL).slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
    const r = c((n >> 16) & 255), g = c((n >> 8) & 255), b = c(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  }

  // ── logical → world geometry ─────────────────────────────────────────
  function gridOf(bar) {
    const g = ctx.findObject(bar.gridId);
    return g && g.type === 'gantt' ? g : null;
  }
  function barsOf(gridId) {
    return ctx.objects.filter(o => o.type === 'gantt-bar' && o.gridId === gridId);
  }
  function cellSize(g) { return { cw: g.w / g.cols, ch: g.h / g.rows }; }
  // the chart's bar-label size (falls back to the default, incl. for a
  // bar whose grid has gone missing)
  function barFont(g) {
    const n = g && g.barFontSize;
    return (typeof n === 'number' && Number.isFinite(n))
      ? Math.max(BAR_FONT_MIN, Math.min(BAR_FONT_MAX, n))
      : BAR_FONT;
  }
  // Stepping is a BURST: everything done in ONE open menu collapses into a
  // single undo entry, the way the kernel treats a run of arrow-key
  // nudges. The flag resets when the chart menu is built (see menu below),
  // so the boundary is "one visit to the menu" rather than a timing guess.
  let fontBurst = false;

  // ── CHANGE CASE (whole chart) ────────────────────────────────────────
  // Bar labels are plain strings, not the text tool's rich HTML, so this
  // is a straight string rewrite. Destructive, one undo step, and it runs
  // over every cell of every selected chart — the point is to restyle a
  // whole chart at once, not one bar at a time.
  const CASE_FNS = {
    upper: (s) => s.toUpperCase(),
    lower: (s) => s.toLowerCase(),
    // Title Case = every word capitalised (the Word/Figma reading). Split
    // on whitespace so "don't" → "Don't", not "Don'T".
    title: (s) => s.toLowerCase().replace(/(^|\s)(\S)/g, (_, sp, c) => sp + c.toUpperCase()),
  };
  function applyBarCase(ctx2, mode) {
    const fn = CASE_FNS[mode];
    if (!fn) return;
    const grids = [];
    for (const id of ctx2.selectedIds) {
      const g = ctx2.findObject(id);
      if (g && g.type === 'gantt') grids.push(g.id);
    }
    if (!grids.length) return;
    ctx2.pushUndo();
    let n = 0;
    for (const gid of grids) {
      for (const b of barsOf(gid)) {
        if (!b.label) continue;
        const next = fn(b.label);
        if (next !== b.label) { b.label = next; n++; }
      }
    }
    ctx2.renderObjects();
    ctx2.markDirty();
    ctx2.showToast(n ? `Recased ${n} cell${n > 1 ? 's' : ''}` : 'No cell text to change');
  }

  function stepBarFont(ctx2, step) {
    const targets = [];
    for (const id of ctx2.selectedIds) {
      const g = ctx2.findObject(id);
      if (g && g.type === 'gantt') targets.push(g);
    }
    if (!targets.length) return null;
    if (!fontBurst) { ctx2.pushUndo(); fontBurst = true; }
    let shown = null;
    for (const g of targets) {
      const next = Math.max(BAR_FONT_MIN, Math.min(BAR_FONT_MAX, barFont(g) + step));
      g.barFontSize = next;
      if (shown == null) shown = next;
    }
    ctx2.renderObjects();
    ctx2.markDirty();
    return shown;
  }
  function barRect(bar, g) {
    const { cw, ch } = cellSize(g);
    return {
      x: g.x + bar.col * cw + INSET,
      y: g.y + bar.row * ch + INSET,
      w: Math.max(10, bar.colsSpan * cw - INSET * 2),
      h: Math.max(10, bar.rowsSpan * ch - INSET * 2),
    };
  }
  // Derive the bar's box from its cells and write it back (object + el).
  function syncBar(bar, el) {
    const g = gridOf(bar);
    if (!g) return;
    const r = barRect(bar, g);
    bar.x = r.x; bar.y = r.y; bar.w = r.w; bar.h = r.h;
    if (el) {
      el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
      el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
    }
  }
  // After removing lines, every bar must still fit the grid.
  function clampBars(g) {
    for (const b of barsOf(g.id)) {
      b.col = Math.max(0, Math.min(b.col, g.cols - 1));
      b.row = Math.max(0, Math.min(b.row, g.rows - 1));
      b.colsSpan = Math.max(1, Math.min(b.colsSpan, g.cols - b.col));
      b.rowsSpan = Math.max(1, Math.min(b.rowsSpan, g.rows - b.row));
    }
  }

  // ── whole-chart duplication (alt-drag) ───────────────────────────────
  // The kernel clones only what's SELECTED. A grid clone finds its
  // source through selfId (copied from the source before the new id was
  // assigned) and brings every unselected bar along itself; bars the
  // kernel ALSO cloned (mixed selection) are flagged and re-homed in a
  // microtask once the grid clone's new id is known.
  let dupRemap = null; // { map: Map<srcGridId, newGridId> }
  function scheduleDupFix() {
    if (dupRemap) return;
    dupRemap = { map: new Map() };
    queueMicrotask(() => {
      const map = dupRemap ? dupRemap.map : new Map();
      dupRemap = null;
      let touched = false;
      for (const b of ctx.objects) {
        if (b.type !== 'gantt-bar') continue;
        if (b._dupPending) {
          if (map.has(b.gridId)) { b.gridId = map.get(b.gridId); touched = true; }
          delete b._dupPending;
        }
      }
      if (touched) { ctx.renderObjects(); ctx.markDirty(); }
    });
    return;
  }
  function dupMap() {
    scheduleDupFix();
    return dupRemap.map;
  }

  // ── add a chart ──────────────────────────────────────────────────────
  function addGantt(wx, wy) {
    ctx.pushUndo();
    const center = (wx !== undefined) ? { x: wx, y: wy } : ctx.viewportCenter();
    const obj = ctx.createObject({
      type: 'gantt',
      x: center.x - DEF_W / 2, y: center.y - DEF_H / 2,
      w: DEF_W, h: DEF_H,
      cols: DEF_COLS, rows: DEF_ROWS,
    });
    ctx.selectObject(obj.id);
    ctx.renderObjects();
    ctx.markDirty();
  }

  // per-line styles: 'v3' / 'h0' → 'solid' | 'dashed' | 'invisible' |
  // 'none' (deleted). EVERY line exists — v0..v{cols} and h0..h{rows},
  // edges included — and each key stores only its DEVIATION from its own
  // default: the top edge (h0) defaults solid-thick, the left/right/
  // bottom edges (v0, v{cols}, h{rows}) default INVISIBLE, interior
  // lines default solid. Invisible lines draw nothing but stay
  // addressable in line-edit mode (they ghost), unlike a deleted line
  // only in intent — both can be restored.
  function defaultStyleOf(g, k) {
    if (k === 'v0' || k === 'v' + g.cols || k === 'h' + g.rows) return 'invisible';
    if (k[0] === 'h' && k !== 'h0') return 'dashed'; // interior horizontals
    return 'solid'; // verticals + the 2×-thick top edge
  }
  function styleOf(g, k) {
    return (g.lineStyles || {})[k] || defaultStyleOf(g, k);
  }
  // 'none' was a SOFT delete — line gone, cell kept — which is exactly what
  // 'invisible' already does. Delete now removes the division itself, so
  // 'none' is retired: old projects migrate to 'invisible' on load, which
  // is byte-for-byte how they already looked.
  const LINE_STYLES = ['solid', 'dashed', 'invisible'];
  function pruneLineStyles(g) {
    const ls = (g.lineStyles && typeof g.lineStyles === 'object') ? g.lineStyles : {};
    const clean = {};
    for (const [k, v] of Object.entries(ls)) {
      const m = /^([vh])(\d+)$/.exec(k);
      const val = (v === 'none') ? 'invisible' : v; // legacy soft-delete
      if (!m || !LINE_STYLES.includes(val)) continue;
      const n = parseInt(m[2], 10);
      if (m[1] === 'v' && (n < 0 || n > g.cols)) continue;
      if (m[1] === 'h' && (n < 0 || n > g.rows)) continue;
      if (val === defaultStyleOf(g, k)) continue; // defaults are implicit
      clean[k] = val;
    }
    g.lineStyles = clean;
    // tick labels ride the same keys ('v3' → text above that tick)
    const tl = (g.tickLabels && typeof g.tickLabels === 'object') ? g.tickLabels : {};
    const cleanTl = {};
    for (const [k, v] of Object.entries(tl)) {
      const m = /^v(\d+)$/.exec(k);
      if (!m || typeof v !== 'string' || !v.trim()) continue;
      const n = parseInt(m[1], 10);
      if (n < 0 || n > g.cols) continue;
      cleanTl[k] = v;
    }
    g.tickLabels = cleanTl;
    // column headers are CELL-keyed ('c0' → text over column 0)
    const cl = (g.colLabels && typeof g.colLabels === 'object') ? g.colLabels : {};
    const cleanCl = {};
    for (const [k, v] of Object.entries(cl)) {
      const m = /^c(\d+)$/.exec(k);
      if (!m || typeof v !== 'string' || !v.trim()) continue;
      const n = parseInt(m[1], 10);
      if (n < 0 || n >= g.cols) continue;
      cleanCl[k] = v;
    }
    g.colLabels = cleanCl;
    // per-label style overrides ride the same keys (v* tick labels,
    // c* column headers)
    const lsm = (g.labelStyles && typeof g.labelStyles === 'object') ? g.labelStyles : {};
    const cleanLs = {};
    for (const [k, v] of Object.entries(lsm)) {
      const m = /^([vc])(\d+)$/.exec(k);
      if (!m || !v || typeof v !== 'object') continue;
      const n = parseInt(m[2], 10);
      if (m[1] === 'v' && (n < 0 || n > g.cols)) continue;
      if (m[1] === 'c' && (n < 0 || n >= g.cols)) continue;
      const o2 = {};
      if (typeof v.preset === 'string' && LABEL_PRESETS[v.preset]) o2.preset = v.preset;
      if (typeof v.font === 'string' && v.font) o2.font = v.font;
      if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) o2.color = v.color;
      if (Object.keys(o2).length) cleanLs[k] = o2;
    }
    g.labelStyles = cleanLs;
  }

  // ── per-label TEXT STYLE (right-click a label — the text tool's menu) ─
  // Overrides live in obj.labelStyles keyed like the label ('v3'/'c0'):
  // { preset?, font?, color? }. Presets are the app's canonical text
  // identities (the text tool's own table); font/color refine on top.
  const LABEL_PRESETS = {
    label:       { size: 168, weight: 700, fstyle: 'normal', family: 'Inter, -apple-system, sans-serif', color: '#F0F0F0' },
    title:       { size: 42,  weight: 600, fstyle: 'normal', family: '"Cormorant Garamond", Georgia, serif', color: '#F0F0F0' },
    subtitle:    { size: 24,  weight: 400, fstyle: 'italic', family: '"Cormorant Garamond", Georgia, serif', color: '#CCCCCC' },
    description: { size: 14,  weight: 400, fstyle: 'normal', family: '"JetBrains Mono", monospace', color: '#999999' },
  };
  const LABEL_FONTS = [
    ['JetBrains Mono', '"JetBrains Mono", monospace'],
    ['Inter', 'Inter, -apple-system, sans-serif'],
    ['Cormorant Garamond', '"Cormorant Garamond", Georgia, serif'],
    ['Georgia', 'Georgia, serif'],
    ['Arial', 'Arial, sans-serif'],
    ['Courier New', '"Courier New", monospace'],
  ];
  const LABEL_SWATCHES = ['#F05300', '#F07A3C', '#F0A178', '#F0C9B4', '#F0F0F0', '#999999', '#111111'];
  function resolveLabelStyle(g, key) {
    const ov = (g.labelStyles || {})[key] || {};
    const p = ov.preset ? LABEL_PRESETS[ov.preset] : null;
    return {
      size: p ? p.size : TICK_FONT,
      weight: p ? p.weight : 500,
      fstyle: p ? p.fstyle : 'normal',
      family: ov.font || (p ? p.family : '"JetBrains Mono", monospace'),
      color: ov.color || (p ? p.color : LABEL_GREY),
    };
  }
  function setLabelStyle(g, key, patch) {
    ctx.pushUndo();
    const map = { ...(g.labelStyles || {}) };
    const next = { ...(map[key] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
    if (Object.keys(next).length) map[key] = next; else delete map[key];
    g.labelStyles = map;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function pickLabelColor(cb) {
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.style.cssText = 'position:fixed;left:-9999px;top:-9999px;';
    document.body.appendChild(inp);
    inp.addEventListener('input', () => cb(inp.value.toUpperCase()), { once: true });
    inp.addEventListener('change', () => inp.remove());
    inp.click();
    setTimeout(() => { try { inp.remove(); } catch (_) {} }, 60000);
  }
  function openLabelStyleMenu(g, key, ev) {
    const cur = (g.labelStyles || {})[key] || {};
    ctx.openMenu([
      {
        label: 'Change Style',
        submenu: [
          { label: 'Label', checked: cur.preset === 'label', action() { setLabelStyle(g, key, { preset: 'label' }); } },
          { label: 'Title', checked: cur.preset === 'title', action() { setLabelStyle(g, key, { preset: 'title' }); } },
          { label: 'Subtitle', checked: cur.preset === 'subtitle', action() { setLabelStyle(g, key, { preset: 'subtitle' }); } },
          { label: 'Description', checked: cur.preset === 'description', action() { setLabelStyle(g, key, { preset: 'description' }); } },
          { divider: true },
          { label: 'Chart Default', checked: !cur.preset && !cur.font, action() { setLabelStyle(g, key, { preset: null, font: null }); } },
          { divider: true },
          ...LABEL_FONTS.map(([name, css]) => ({
            label: name, checked: cur.font === css,
            action() { setLabelStyle(g, key, { font: css }); },
          })),
          { divider: true },
          { label: 'Default Color', action() { setLabelStyle(g, key, { color: null }); } },
          {
            html: '<div class="gtt-swatches">' + LABEL_SWATCHES.map(c =>
              `<button class="gtt-swatch${cur.color === c ? ' active' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`
            ).join('') + '</div>',
            onClick(e, ctx2) {
              const b = e.target.closest('.gtt-swatch');
              if (!b) return;
              ctx2.closeMenus();
              setLabelStyle(g, key, { color: b.dataset.color });
            },
          },
          { label: 'Custom Color…', action() { pickLabelColor((c) => setLabelStyle(g, key, { color: c })); } },
        ],
      },
    ], ev.clientX, ev.clientY);
  }

  // ── tick labels (rotated 90° CCW, reading bottom-to-top off the tick) ─
  function setTickLabel(g, key, text) {
    ctx.pushUndo();
    const tl = { ...(g.tickLabels || {}) };
    const v = String(text || '').trim();
    if (v) tl[key] = v; else delete tl[key];
    g.tickLabels = tl;
    ctx.renderObjects();
    ctx.markDirty();
  }
  // ── column headers (horizontal, centered over each column) ──────────
  function setColLabel(g, key, text) {
    ctx.pushUndo();
    const cl = { ...(g.colLabels || {}) };
    const v = String(text || '').trim();
    if (v) cl[key] = v; else delete cl[key];
    g.colLabels = cl;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function editColLabel(g, key) {
    const el = objectEl(g.id);
    const div = el && el.querySelector(`.gtt-colhead[data-key="${key}"]`);
    if (!div) return;
    const orig = (g.colLabels || {})[key] || '';
    div.classList.remove('gtt-colhead-empty');
    div.textContent = orig;
    div.setAttribute('contenteditable', 'true');
    div.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(div);
    sel.removeAllRanges(); sel.addRange(range);
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true;
      div.removeAttribute('contenteditable');
      const v = commit ? (div.textContent || '').trim() : orig;
      if (v !== orig) setColLabel(g, key, v);
      else ctx.renderObjects();
    };
    div.addEventListener('blur', () => finish(true));
    div.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); div.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }
  function editTickLabel(g, key) {
    const el = objectEl(g.id);
    const div = el && el.querySelector(`.gtt-ticklabel[data-key="${key}"]`);
    if (!div) return;
    const orig = (g.tickLabels || {})[key] || '';
    div.classList.remove('gtt-ticklabel-empty');
    div.textContent = orig; // drop the ··· ghost
    div.setAttribute('contenteditable', 'true');
    div.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(div);
    sel.removeAllRanges(); sel.addRange(range);
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true;
      div.removeAttribute('contenteditable');
      const v = commit ? (div.textContent || '').trim() : orig;
      if (v !== orig) setTickLabel(g, key, v);
      else ctx.renderObjects();
    };
    div.addEventListener('blur', () => finish(true));
    div.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); div.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }

  // ── line +/− (boundary fixed, spacing redistributes) ─────────────────
  // Plain + appends a cell at the end. With a line SELECTED (line-edit
  // mode) and + on its own axis, the new line lands right AFTER the
  // selected one — a mid-chart insert: bars at/after the insertion point
  // shift over, bars SPANNING it stretch by one (they keep covering the
  // same cells), and per-line styles + tick labels shift with their
  // lines (a styled right/bottom edge stays the edge). The selection
  // hops to the new line, so repeated + marches a run of inserts in.
  function changeLines(g, key, delta) {
    const next = g[key] + delta;
    if (next < 1) { ctx.showToast('A chart needs at least one cell'); return; }
    if (next > MAXLINES) { ctx.showToast(`${MAXLINES} is plenty`); return; }
    ctx.pushUndo();
    const axis = key === 'cols' ? 'v' : 'h';
    // the insert anchor must be unambiguous: exactly ONE selected line on
    // this axis; otherwise (none, many, or wrong axis) append at the end
    const selOnAxis = (delta > 0 && lineEdit && lineEdit.gridId === g.id)
      ? [...lineEdit.sel].filter(kk => kk[0] === axis) : [];
    const selIdx = selOnAxis.length === 1 ? parseInt(selOnAxis[0].slice(1), 10) : null;
    g[key] = next;
    if (selIdx != null && Number.isFinite(selIdx)) {
      const k = selIdx; // the new CELL slots in at index k, after line axis+k
      for (const b of barsOf(g.id)) {
        if (axis === 'v') {
          if (b.col >= k) b.col += 1;
          else if (b.col + b.colsSpan > k) b.colsSpan += 1;
        } else {
          if (b.row >= k) b.row += 1;
          else if (b.row + b.rowsSpan > k) b.rowsSpan += 1;
        }
      }
      // shift keyed data past the insertion point (non-matching prefixes
      // pass through). Lines shift from k+1 (line k stays), CELLS shift
      // from k (the new cell slots in at k, like the bars above).
      const shiftKeys = (map, prefix, minIdx) => {
        const out = {};
        const re = new RegExp('^' + prefix + '(\\d+)$');
        for (const [mk, mv] of Object.entries(map || {})) {
          const m = re.exec(mk);
          if (!m) { out[mk] = mv; continue; }
          const n = parseInt(m[1], 10);
          out[prefix + (n >= minIdx ? n + 1 : n)] = mv;
        }
        return out;
      };
      g.lineStyles = shiftKeys(g.lineStyles, axis, k + 1);
      if (axis === 'v') {
        g.tickLabels = shiftKeys(g.tickLabels, 'v', k + 1);
        g.colLabels = shiftKeys(g.colLabels, 'c', k);
        g.labelStyles = shiftKeys(shiftKeys(g.labelStyles, 'v', k + 1), 'c', k);
      }
      lineEdit.sel = new Set([axis + (k + 1)]); // the fresh line takes the selection
    }
    clampBars(g);
    pruneLineStyles(g);
    ctx.renderObjects();
    ctx.markDirty();
  }

  // ── LINE-EDIT MODE (double-click a line, or grid menu → Edit Lines…) ─
  let lineEdit = null; // { gridId, sel: Set<'v3'|'h0'|…> }

  function enterLineEdit(g, selKey) {
    if (ctx.getActiveTool()) ctx.setTool(null);
    ctx.clearSelection();
    ctx.updateSelectionVisuals();
    lineEdit = { gridId: g.id, sel: new Set(selKey ? [selKey] : []) };
    document.addEventListener('keydown', onLineEditKey, true);
    ctx.renderObjects();
    ctx.showToast('Editing lines — click selects · Shift-click adds · right-click for style · Delete removes · Esc done');
  }
  function exitLineEdit() {
    if (!lineEdit) return;
    lineEdit = null;
    document.removeEventListener('keydown', onLineEditKey, true);
    ctx.renderObjects();
  }
  function onLineEditKey(e) {
    if (!lineEdit) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      exitLineEdit();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && lineEdit.sel.size) {
      e.preventDefault(); e.stopPropagation(); // never delete the GRID from line-edit
      const g = ctx.findObject(lineEdit.gridId);
      if (g && g.type === 'gantt') deleteLines(g, [...lineEdit.sel]);
    }
  }

  // ── delete a whole DIVISION ─────────────────────────────────────────
  // Not a style — the column or row itself goes: the line, its label, its
  // column header, and the cell that collapses with it. cols/rows drop, so
  // the survivors re-space evenly inside the same boundary and bars reflow.
  // (To drop a line but KEEP its cell and spacing — merging two cells
  // visually while the bar math stays put — that's the Invisible style.)
  function removeSlot(map, prefix, idx) {
    const out = {};
    const re = new RegExp('^' + prefix + '(\\d+)$');
    for (const [k, v] of Object.entries(map || {})) {
      const m = re.exec(k);
      if (!m) { out[k] = v; continue; } // other prefixes pass through
      const n = parseInt(m[1], 10);
      if (n === idx) continue;          // gone with its slot
      out[prefix + (n > idx ? n - 1 : n)] = v;
    }
    return out;
  }
  // The inverse of changeLines' insert: removing line axis+j collapses the
  // CELL that starts at j (at the far edge, the one that ends there).
  function deleteOneLine(g, axis, j, doomed) {
    const isV = axis === 'v';
    const N = isV ? g.cols : g.rows;
    const k = Math.min(j, N - 1);
    for (const b of barsOf(g.id)) {
      if (doomed.has(b.id)) continue;
      const pos = isV ? b.col : b.row;
      const span = isV ? b.colsSpan : b.rowsSpan;
      if (pos > k) {
        if (isV) b.col -= 1; else b.row -= 1;
      } else if (pos === k) {
        // a bar that spans further just gets shorter; one that lived ONLY
        // in this cell has nowhere left to be
        if (span > 1) { if (isV) b.colsSpan -= 1; else b.rowsSpan -= 1; }
        else doomed.add(b.id);
      } else if (pos + span > k) {      // spans across the removed cell
        if (isV) b.colsSpan -= 1; else b.rowsSpan -= 1;
      }
    }
    g.lineStyles = removeSlot(g.lineStyles, axis, j);
    if (isV) { // only verticals carry labels — tick labels 'v', headers 'c'
      g.tickLabels = removeSlot(g.tickLabels, 'v', j);
      g.colLabels = removeSlot(g.colLabels, 'c', k);
      g.labelStyles = removeSlot(removeSlot(g.labelStyles, 'v', j), 'c', k);
    }
    if (isV) g.cols = N - 1; else g.rows = N - 1;
  }
  function axisIdxs(keys, axis, max) {
    return [...new Set(keys
      .filter(k => String(k)[0] === axis)
      .map(k => parseInt(String(k).slice(1), 10))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= max))]
      .sort((a, b) => b - a); // high → low, so lower indices stay valid
  }
  function deleteLines(g, keys) {
    const vs = axisIdxs(keys, 'v', g.cols);
    const hs = axisIdxs(keys, 'h', g.rows);
    if (!vs.length && !hs.length) return;
    if (g.cols - vs.length < 1 || g.rows - hs.length < 1) {
      ctx.showToast('A chart needs at least one cell');
      return;
    }
    ctx.pushUndo();
    const doomed = new Set();
    for (const j of vs) deleteOneLine(g, 'v', j, doomed);
    for (const j of hs) deleteOneLine(g, 'h', j, doomed);
    // bars whose only cell went with a removed division (flowchart splices
    // dangling connectors the same way)
    if (doomed.size) {
      for (let i = ctx.objects.length - 1; i >= 0; i--) {
        if (doomed.has(ctx.objects[i].id)) ctx.objects.splice(i, 1);
      }
    }
    clampBars(g);
    pruneLineStyles(g);
    if (lineEdit && lineEdit.gridId === g.id) {
      // keep a neighbour selected so you can carry on deleting
      lineEdit.sel = new Set([vs.length
        ? 'v' + Math.min(vs[vs.length - 1], g.cols)
        : 'h' + Math.min(hs[hs.length - 1], g.rows)]);
    }
    ctx.renderObjects();
    ctx.markDirty();
    // never silent about the bars: deleting a column deletes its tasks
    const parts = [];
    if (vs.length) parts.push(`${vs.length} column${vs.length > 1 ? 's' : ''}`);
    if (hs.length) parts.push(`${hs.length} row${hs.length > 1 ? 's' : ''}`);
    ctx.showToast(`Removed ${parts.join(' and ')}`
      + (doomed.size ? ` and ${doomed.size} bar${doomed.size > 1 ? 's' : ''}` : ''));
  }
  // one undo step no matter how many lines the selection carries
  function setLineStyles(g, keys, style) {
    ctx.pushUndo();
    const ls = { ...(g.lineStyles || {}) };
    for (const key of keys) {
      if (style === defaultStyleOf(g, key)) delete ls[key]; else ls[key] = style;
    }
    g.lineStyles = ls;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function openLineMenu(g, keys, ev) {
    const all = (want) => keys.every(k => styleOf(g, k) === want);
    const many = keys.length > 1;
    const items = [
      { label: 'Solid', checked: all('solid'), action() { setLineStyles(g, keys, 'solid'); } },
      { label: 'Dashed', checked: all('dashed'), action() { setLineStyles(g, keys, 'dashed'); } },
      { label: 'Invisible', checked: all('invisible'), action() { setLineStyles(g, keys, 'invisible'); } },
    ];
    // Delete removes DIVISIONS, so name what actually goes
    const onlyV = keys.every(k => k[0] === 'v');
    const onlyH = keys.every(k => k[0] === 'h');
    const noun = onlyV ? 'Column' : onlyH ? 'Row' : 'Division';
    items.push({ divider: true });
    items.push({
      label: many ? `Delete ${keys.length} ${noun}s` : `Delete ${noun}`,
      danger: true,
      action() { deleteLines(g, keys); },
    });
    ctx.openMenu(items, ev.clientX, ev.clientY);
  }

  // ── label editing (flowchart-style: dblclick → type → blur commits) ──
  function editBarLabel(bar, isFresh) {
    const el = objectEl(bar.id);
    const txt = el && el.querySelector('.gtt-label');
    if (!txt) return;
    const orig = bar.label || '';
    txt.setAttribute('contenteditable', 'true');
    if (!orig) txt.textContent = ''; // drop the placeholder
    txt.focus();
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(txt);
    sel.removeAllRanges(); sel.addRange(range);

    let done = false;
    const finish = (commit) => {
      if (done) return; done = true;
      txt.removeAttribute('contenteditable');
      const v = commit ? (txt.textContent || '').trim() : orig;
      // a FRESH bar left empty never existed: remove it quietly — its
      // creation snapshot already carries the undo boundary
      if (isFresh && !v) {
        const i = ctx.objects.indexOf(bar);
        if (i >= 0) ctx.objects.splice(i, 1);
        ctx.renderObjects(); ctx.markDirty();
        return;
      }
      if (v !== orig) {
        if (!isFresh) ctx.pushUndo(); // fresh bars: creation snapshot is the boundary
        bar.label = v;
        ctx.markDirty();
      }
      ctx.renderObjects();
    };
    txt.addEventListener('blur', () => finish(true));
    txt.addEventListener('keydown', (ev) => {
      ev.stopPropagation(); // typing must never reach kernel shortcuts
      if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); txt.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }

  // ── span grip (own affordance — bars are resizable:false) ────────────
  function onGripDown(e) {
    if (e.button !== 0) return false;
    const grip = e.target.closest('.gtt-grip');
    if (!grip) return false;
    const objEl = e.target.closest('.canvas-obj');
    if (!objEl) return false;
    const bar = ctx.findObject(parseInt(objEl.dataset.id));
    if (!bar || bar.type !== 'gantt-bar') return false;
    const g = gridOf(bar);
    if (!g) return false;
    e.preventDefault(); e.stopPropagation();
    let pushed = false;
    const onMove = (ev) => {
      const p = ctx.screenToWorld(ev.clientX, ev.clientY);
      const { cw, ch } = cellSize(g);
      const endCol = Math.max(bar.col, Math.min(g.cols - 1, Math.floor((p.x - g.x) / cw)));
      const endRow = Math.max(bar.row, Math.min(g.rows - 1, Math.floor((p.y - g.y) / ch)));
      const nc = endCol - bar.col + 1, nr = endRow - bar.row + 1;
      if (nc === bar.colsSpan && nr === bar.rowsSpan) return;
      if (!pushed) { ctx.pushUndo(); pushed = true; }
      bar.colsSpan = nc; bar.rowsSpan = nr;
      syncBar(bar, objEl);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (pushed) { ctx.renderObjects(); ctx.markDirty(); }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return true;
  }

  const GANTT_ICON = '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="1"/><line x1="9" y1="4" x2="9" y2="20"/><line x1="15" y1="4" x2="15" y2="20"/><path d="M5 8h6M9 12h8M13 16h6" stroke-width="3"/></svg>';
  const GANTT_ICON_14 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + GANTT_ICON.slice(GANTT_ICON.indexOf('>') + 1);

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      .canvas-obj.gtt-grid { overflow: visible; }
      .canvas-obj.gtt-grid svg {
        display: block; width: 100%; height: 100%; overflow: visible;
        pointer-events: none; /* lines only bite in edit mode (hit bands) */
      }
      .gtt-line-vis { stroke: ${GREY}; stroke-width: ${LINE_W}; }
      .gtt-line-top { stroke-width: ${TOP_W}; } /* the top edge — 2× weight */
      .gtt-line-ghost { stroke: rgba(204, 204, 204, 0.22); stroke-dasharray: 3 9; }
      .gtt-line-hit { stroke: transparent; stroke-width: 14; pointer-events: stroke; cursor: pointer; }
      /* hover/selection feedback is COLOR-only so the top edge keeps its weight */
      .gtt-lineg:hover .gtt-line-vis { stroke: #F0F0F0; }
      .gtt-line-sel .gtt-line-vis { stroke: #F0C4A0 !important; }
      .canvas-obj.gtt-grid.gtt-editing {
        outline: 1px dashed #F0C4A0;
        outline-offset: 5px;
      }
      /* tick labels: anchored at the tick tip, rotated 90° CCW so they
         read bottom-to-top; centered ON the line (post-rotation, the
         18px line box extends screen-LEFT of the anchor, so the anchor
         sits half a box RIGHT of the line) */
      .gtt-ticklabel {
        position: absolute;
        transform: rotate(-90deg);
        transform-origin: left bottom;
        white-space: nowrap;
        width: max-content;
        line-height: 18px;
        font-family: "JetBrains Mono", monospace;
        font-size: ${TICK_FONT}px;
        font-weight: 500;
        letter-spacing: 0.04em;
        color: ${LABEL_GREY};
        cursor: text;
        outline: none;
      }
      .gtt-ticklabel-empty {
        color: rgba(204, 204, 204, 0.35);
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.gtt-grid:hover .gtt-ticklabel-empty,
      .canvas-obj.gtt-grid.selected .gtt-ticklabel-empty,
      .canvas-obj.gtt-grid.gtt-editing .gtt-ticklabel-empty { opacity: 1; }
      .gtt-ticklabel[contenteditable="true"] {
        user-select: text;
        color: #F0F0F0;
        opacity: 1;
      }
      /* column headers: horizontal, centered over each column, sharing
         the tick labels' baseline */
      .gtt-colhead {
        position: absolute;
        transform: translateX(-50%);
        white-space: nowrap;
        line-height: 18px;
        font-family: "JetBrains Mono", monospace;
        font-size: ${TICK_FONT}px;
        font-weight: 500;
        letter-spacing: 0.04em;
        color: ${LABEL_GREY};
        cursor: text;
        outline: none;
      }
      .gtt-colhead-empty {
        color: rgba(204, 204, 204, 0.35);
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.gtt-grid:hover .gtt-colhead-empty,
      .canvas-obj.gtt-grid.selected .gtt-colhead-empty,
      .canvas-obj.gtt-grid.gtt-editing .gtt-colhead-empty { opacity: 1; }
      .gtt-colhead[contenteditable="true"] {
        user-select: text;
        color: #F0F0F0;
        opacity: 1;
      }

      /* +/− line controls: live just OUTSIDE the bottom-right edges,
         appear on hover (or while the grid is selected) */
      .gtt-ctl {
        position: absolute;
        display: flex;
        gap: 3px;
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.gtt-grid:hover .gtt-ctl,
      .canvas-obj.gtt-grid.selected .gtt-ctl { opacity: 1; }
      .gtt-ctl-cols { right: -30px; bottom: 0; flex-direction: column; }
      .gtt-ctl-rows { bottom: -30px; right: 0; flex-direction: row; }
      .gtt-btn {
        width: 24px; height: 24px;
        display: flex; align-items: center; justify-content: center;
        background: #171614;
        border: 1px solid #29251f;
        border-radius: 4px;
        color: #F0C4A0;
        font-family: "JetBrains Mono", monospace;
        font-size: 14px;
        line-height: 1;
        cursor: pointer;
        padding: 0;
        transition: border-color 120ms ease, color 120ms ease;
      }
      .gtt-btn:hover { border-color: #F0A178; color: #F0F0F0; }
      /* text-size stepper in the chart's right-click menu */
      .gtt-size { display: flex; align-items: center; gap: 8px; padding: 7px 14px; }
      .gtt-size-name { flex: 1; white-space: nowrap; }
      .gtt-size-val {
        min-width: 26px;
        text-align: center;
        font-family: "JetBrains Mono", monospace;
        font-size: 12px;
        font-variant-numeric: tabular-nums;
        color: #F0F0F0;
      }

      /* the bars: flowchart-box look, chip-sized to their cells */
      .canvas-obj.gtt-bar {
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        padding: 2px 8px;
        border: 2px solid #C0A190;
        border-radius: 4px;
        background: ${DEFAULT_FILL};
        overflow: hidden;
      }
      .canvas-obj.gtt-bar .gtt-label {
        width: 100%;
        text-align: center;
        font-family: var(--font-sans);
        font-size: ${BAR_FONT}px;  /* per-chart override set inline on render */
        font-weight: 700;
        color: ${BAR_INK};
        line-height: 1.25;
        white-space: pre-wrap;    /* wraps like the flowchart boxes */
        word-break: break-word;
        overflow: hidden;         /* the bar clips what can't fit */
        outline: none;
      }
      .canvas-obj.gtt-bar .gtt-label .placeholder-text { color: ${BAR_INK_GHOST}; }
      /* CLEAR bars: no chip, no boundary — the text carries the cell, so
         it flips to light ink (the dark chip text would disappear) */
      .canvas-obj.gtt-bar.gtt-clear { background: transparent; border-color: transparent; }
      /* the swatch that turns a bar clear — a slashed empty circle */
      .gtt-swatch-clear { position: relative; background: transparent !important; border-color: rgba(240, 240, 240, 0.35); }
      .gtt-swatch-clear::after {
        content: '';
        position: absolute;
        left: 50%; top: -1px; bottom: -1px;
        width: 2px; margin-left: -1px;
        background: #F05300;
        transform: rotate(45deg);
      }
      .canvas-obj.gtt-bar .gtt-label[contenteditable="true"] {
        cursor: text;
        user-select: text;
      }
      /* span grip: bottom-right, visible while selected */
      .gtt-grip {
        position: absolute;
        right: -6px; bottom: -6px;
        width: 12px; height: 12px;
        background: #F0C4A0;
        border: 2px solid #1a1a1a;
        border-radius: 3px;
        cursor: nwse-resize;
        display: none;
        z-index: 5;
      }
      .canvas-obj.gtt-bar.selected { overflow: visible; }
      .canvas-obj.gtt-bar.selected .gtt-grip { display: block; }

      .gtt-swatches { display: flex; gap: 6px; align-items: center; padding: 8px 14px; }
      .gtt-swatch {
        box-sizing: border-box;
        width: 22px; height: 22px; padding: 0;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.18);
        cursor: pointer;
        transition: transform 0.1s, border-color 0.1s;
      }
      .gtt-swatch:hover { transform: scale(1.18); border-color: #F0C4A0; }
      .gtt-swatch.active { border-color: #F0F0F0; }
    `,

    // ── OBJECT TYPES ───────────────────────────────────────────────────
    objectTypes: {
      // THE GRID
      gantt: {
        defaults: { cols: DEF_COLS, rows: DEF_ROWS, lineStyles: {}, tickLabels: {}, colLabels: {}, labelStyles: {}, barFontSize: null },
        rotatable: false, // bar↔cell math is axis-aligned
        normalize(obj) {
          obj.cols = Math.max(1, Math.min(MAXLINES, Math.round(Number(obj.cols) || DEF_COLS)));
          obj.rows = Math.max(1, Math.min(MAXLINES, Math.round(Number(obj.rows) || DEF_ROWS)));
          // null = the default size; anything else clamps into range
          obj.barFontSize = (typeof obj.barFontSize === 'number' && Number.isFinite(obj.barFontSize))
            ? Math.max(BAR_FONT_MIN, Math.min(BAR_FONT_MAX, Math.round(obj.barFontSize)))
            : null;
          // Duplicate provenance (see onDuplicate). The kernel stamps the
          // clone's NEW id before it runs normalize, so claiming this
          // field unconditionally would erase the source id the clone
          // arrived carrying — only a fresh object adopts its own.
          if (!obj.selfId) obj.selfId = obj.id;
          delete obj._pasteSrc; // transient paste-remap flag, never saved
          pruneLineStyles(obj);
        },
        // Alt-drag: the clone arrives still carrying the SOURCE grid's id
        // in selfId (normalize leaves an existing one alone) — use it to
        // bring every bar along, then claim the field.
        onDuplicate(clone, ctx2) {
          const srcId = clone.selfId;
          clone.selfId = clone.id;
          if (!srcId || srcId === clone.id) return;
          dupMap().set(srcId, clone.id); // for kernel-cloned bars (mixed selection)
          // Stack the bars explicitly above the clone: the kernel pushes
          // the clone into ctx.objects only AFTER this hook, so
          // createObject's own "top z" would tie the grid — and a tied
          // bar renders behind it and loses its clicks to the grid div.
          let z = clone.zIndex;
          for (const b of barsOf(srcId)) {
            // bars ALSO selected clone themselves via the kernel — they
            // re-home through the microtask remap instead
            if (ctx2.selectedIds.has(b.id)) continue;
            const props = JSON.parse(JSON.stringify(b));
            delete props.id;      // createObject assigns a fresh one
            ctx2.createObject({ ...props, gridId: clone.id, zIndex: ++z });
          }
        },
        // A pasted grid must never keep pointing at the grid it was copied
        // from — that stale provenance would make a later alt-drag clone
        // the ORIGINAL chart's bars. Claim the field immediately, but hand
        // the source id to onPasteEnd first: that's where this paste's
        // bars get re-homed onto this clone. (onReady claims it too, for
        // anything that reached the project without a hook at all.)
        onPaste(obj) {
          if (obj.selfId && obj.selfId !== obj.id) obj._pasteSrc = obj.selfId;
          obj.selfId = obj.id;
        },
        render(obj, el) {
          el.classList.add('gtt-grid');
          const editing = !!(lineEdit && lineEdit.gridId === obj.id);
          if (editing) el.classList.add('gtt-editing');
          const w = obj.w, h = obj.h;

          // segments: EVERY line, edges included (v0..v{cols}, h0..h{rows}).
          // Edges other than the top default to 'invisible' — present and
          // editable, drawn only if restyled.
          const segs = [];
          for (let i = 0; i <= obj.cols; i++) {
            const x = (w / obj.cols) * i;
            segs.push({ key: 'v' + i, x1: x, y1: 0, x2: x, y2: h });
          }
          for (let j = 0; j <= obj.rows; j++) {
            const y = (h / obj.rows) * j;
            segs.push({ key: 'h' + j, x1: 0, y1: y, x2: w, y2: y });
          }
          let svg = '';
          for (const s of segs) {
            const st = styleOf(obj, s.key);
            const hidden = st === 'none' || st === 'invisible';
            if (hidden && !editing) continue; // ghosts only while editing
            // SOLID verticals tick past the (2×-thick) top edge
            const y1 = (s.key[0] === 'v' && st === 'solid') ? -TICK : s.y1;
            const coords = `x1="${s.x1}" y1="${y1}" x2="${s.x2}" y2="${s.y2}"`;
            const cls = 'gtt-line-vis'
              + (s.key === 'h0' ? ' gtt-line-top' : '')
              + (hidden ? ' gtt-line-ghost' : '');
            const dash = st === 'dashed' ? ` stroke-dasharray="${DASH} ${DASH}"` : '';
            svg += `<g class="gtt-lineg${editing && lineEdit.sel.has(s.key) ? ' gtt-line-sel' : ''}" data-key="${s.key}">` +
              `<line class="${cls}" ${coords}${dash}/>` +
              (editing ? `<line class="gtt-line-hit" ${coords}/>` : '') +
              `</g>`;
          }
          el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${svg}</svg>`;

          // tick labels: one per vertical — ANY style, edges included
          // (the label row belongs to the columns, not the line dress).
          // All share one baseline height whether or not a tick is
          // present. Rotated 90° CCW; empty ones ghost as ··· on hover —
          // click to type.
          for (let i = 0; i <= obj.cols; i++) {
            const key = 'v' + i;
            const text = (obj.tickLabels || {})[key] || '';
            const st = resolveLabelStyle(obj, key);
            const lineH = Math.round(st.size * 1.35);
            const div = document.createElement('div');
            div.className = 'gtt-ticklabel' + (text ? '' : ' gtt-ticklabel-empty');
            div.dataset.key = key;
            div.textContent = text || '···';
            // rotate(-90) about left-bottom puts the line box to the LEFT
            // of the anchor — anchor at line + half the box centers the
            // text ON the line (box height follows the label's style)
            div.style.left = ((w / obj.cols) * i + lineH / 2) + 'px';
            div.style.bottom = `calc(100% + ${TICK + TICK_GAP}px)`;
            if (text) { // ghosts keep the ghost dress
              div.style.fontFamily = st.family;
              div.style.fontSize = st.size + 'px';
              div.style.fontWeight = st.weight;
              div.style.fontStyle = st.fstyle;
              div.style.lineHeight = lineH + 'px';
              div.style.color = st.color;
            }
            // While TYPING in this label, a right-click belongs to the text:
            // hands off, so the event reaches main and the spelling menu
            // can appear. At rest it opens the label's style menu.
            const typing = () => div.getAttribute('contenteditable') === 'true';
            div.addEventListener('mousedown', (ev) => {
              ev.stopPropagation();
              if (ev.button === 2 && !typing()) { ev.preventDefault(); openLabelStyleMenu(obj, key, ev); }
            });
            div.addEventListener('contextmenu', (ev) => {
              if (typing()) return;
              ev.preventDefault(); ev.stopPropagation();
            });
            div.addEventListener('dblclick', (ev) => ev.stopPropagation());
            div.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (div.getAttribute('contenteditable') === 'true') return;
              editTickLabel(obj, key);
            });
            el.appendChild(div);
          }

          // column headers: horizontal, centered over each column, same
          // baseline height as the tick labels — boundaries read
          // vertically, spans read horizontally. Same ghost/click grammar.
          for (let i = 0; i < obj.cols; i++) {
            const key = 'c' + i;
            const text = (obj.colLabels || {})[key] || '';
            const st = resolveLabelStyle(obj, key);
            const div = document.createElement('div');
            div.className = 'gtt-colhead' + (text ? '' : ' gtt-colhead-empty');
            div.dataset.key = key;
            div.textContent = text || '···';
            div.style.left = ((w / obj.cols) * (i + 0.5)) + 'px';
            div.style.bottom = `calc(100% + ${TICK + TICK_GAP}px)`;
            if (text) { // ghosts keep the ghost dress
              div.style.fontFamily = st.family;
              div.style.fontSize = st.size + 'px';
              div.style.fontWeight = st.weight;
              div.style.fontStyle = st.fstyle;
              div.style.lineHeight = Math.round(st.size * 1.35) + 'px';
              div.style.color = st.color;
            }
            // While TYPING in this label, a right-click belongs to the text:
            // hands off, so the event reaches main and the spelling menu
            // can appear. At rest it opens the label's style menu.
            const typing = () => div.getAttribute('contenteditable') === 'true';
            div.addEventListener('mousedown', (ev) => {
              ev.stopPropagation();
              if (ev.button === 2 && !typing()) { ev.preventDefault(); openLabelStyleMenu(obj, key, ev); }
            });
            div.addEventListener('contextmenu', (ev) => {
              if (typing()) return;
              ev.preventDefault(); ev.stopPropagation();
            });
            div.addEventListener('dblclick', (ev) => ev.stopPropagation());
            div.addEventListener('click', (ev) => {
              ev.stopPropagation();
              if (div.getAttribute('contenteditable') === 'true') return;
              editColLabel(obj, key);
            });
            el.appendChild(div);
          }

          if (editing) {
            // line hits own the mouse: select on left, style menu on right
            el.querySelectorAll('.gtt-lineg').forEach(gEl => {
              const key = gEl.dataset.key;
              gEl.addEventListener('mousedown', (ev) => {
                ev.stopPropagation();
                if (ev.button === 2) {
                  ev.preventDefault();
                  // right-click INSIDE the selection acts on all of it;
                  // outside it, the clicked line takes over first
                  if (!lineEdit.sel.has(key)) lineEdit.sel = new Set([key]);
                  openLineMenu(obj, [...lineEdit.sel], ev);
                  ctx.renderObjects();
                  return;
                }
                if (ev.button !== 0) return;
                if (ev.shiftKey) {
                  // shift-click toggles membership (kernel convention)
                  if (lineEdit.sel.has(key)) lineEdit.sel.delete(key);
                  else lineEdit.sel.add(key);
                } else {
                  lineEdit.sel = new Set([key]);
                }
                ctx.renderObjects();
              });
              gEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            });
          }

          const mkBtn = (label, title, fn) => {
            const b = document.createElement('button');
            b.className = 'gtt-btn';
            b.type = 'button';
            b.textContent = label;
            b.title = title;
            // mousedown must not start a kernel grid-drag
            b.addEventListener('mousedown', (ev) => ev.stopPropagation());
            b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
            return b;
          };
          const colCtl = document.createElement('div');
          colCtl.className = 'gtt-ctl gtt-ctl-cols';
          colCtl.appendChild(mkBtn('+', 'Add a column — after the selected line, or at the end', () => changeLines(obj, 'cols', +1)));
          colCtl.appendChild(mkBtn('−', 'Remove a column (from the end)', () => changeLines(obj, 'cols', -1)));
          const rowCtl = document.createElement('div');
          rowCtl.className = 'gtt-ctl gtt-ctl-rows';
          rowCtl.appendChild(mkBtn('+', 'Add a row — after the selected line, or at the end', () => changeLines(obj, 'rows', +1)));
          rowCtl.appendChild(mkBtn('−', 'Remove a row (from the end)', () => changeLines(obj, 'rows', -1)));
          el.appendChild(colCtl);
          el.appendChild(rowCtl);
        },
        // double-click ON a line (±8 screen px) → line-edit mode with that
        // line selected; double-click an EMPTY cell → a fresh bar, ready
        // to type (a dblclick landing here missed every bar — they're on
        // top). Deleted lines still count as "near" so they can be found
        // and restored.
        onDoubleClick(obj, e, ctx2) {
          const p = ctx2.screenToWorld(e.clientX, e.clientY);
          const { cw, ch } = cellSize(obj);
          const tol = 8 / Math.max(0.05, ctx2.getZoom());
          let nearKey = null, nearD = tol;
          for (let i = 0; i <= obj.cols; i++) {
            const d = Math.abs(p.x - (obj.x + i * cw));
            if (d < nearD) { nearD = d; nearKey = 'v' + i; }
          }
          for (let j = 0; j <= obj.rows; j++) {
            const d = Math.abs(p.y - (obj.y + j * ch));
            if (d < nearD) { nearD = d; nearKey = 'h' + j; }
          }
          if (nearKey) { enterLineEdit(obj, nearKey); return true; }
          const col = Math.max(0, Math.min(obj.cols - 1, Math.floor((p.x - obj.x) / cw)));
          const row = Math.max(0, Math.min(obj.rows - 1, Math.floor((p.y - obj.y) / ch)));
          ctx2.pushUndo();
          const bar = ctx2.createObject({
            type: 'gantt-bar',
            gridId: obj.id, col, row, colsSpan: 1, rowsSpan: 1,
            label: '', fillColor: null,
            x: obj.x, y: obj.y, w: 10, h: 10, // derived on render
          });
          ctx2.selectObject(bar.id);
          ctx2.renderObjects();
          ctx2.markDirty();
          requestAnimationFrame(() => editBarLabel(bar, true));
          return true;
        },
        exportDraw(c2d, obj, t) {
          const x = t.x, y = t.y, w = obj.w * t.scaleX, h = obj.h * t.scaleY;
          const s = (t.scaleX + t.scaleY) / 2;
          c2d.save();
          c2d.strokeStyle = GREY;
          const seg = (key, x1, y1, x2, y2, wd) => {
            const st = styleOf(obj, key);
            if (st === 'none' || st === 'invisible') return;
            c2d.lineWidth = Math.max(1, wd * s);
            c2d.setLineDash(st === 'dashed' ? [DASH * s, DASH * s] : []);
            c2d.beginPath(); c2d.moveTo(x1, y1); c2d.lineTo(x2, y2); c2d.stroke();
          };
          for (let i = 0; i <= obj.cols; i++) {
            const lx = x + (w / obj.cols) * i;
            // SOLID verticals tick past the top edge (mirrors the display)
            const vy = styleOf(obj, 'v' + i) === 'solid' ? y - TICK * t.scaleY : y;
            seg('v' + i, lx, vy, lx, y + h, LINE_W);
          }
          seg('h0', x, y, x + w, y, TOP_W); // the 2×-thick top edge
          for (let j = 1; j <= obj.rows; j++) {
            const ly = y + (h / obj.rows) * j;
            seg('h' + j, x, ly, x + w, ly, LINE_W);
          }
          // tick labels: rotated 90° CCW, any line style, one shared
          // baseline height (mirrors the display, per-label styles too)
          c2d.setLineDash([]);
          c2d.textAlign = 'left';
          c2d.textBaseline = 'middle';
          const labelFont = (st2) =>
            `${st2.fstyle === 'italic' ? 'italic ' : ''}${st2.weight} ${st2.size * s}px ${st2.family}`;
          for (let i = 0; i <= obj.cols; i++) {
            const text = (obj.tickLabels || {})['v' + i];
            if (!text) continue;
            const st2 = resolveLabelStyle(obj, 'v' + i);
            c2d.fillStyle = st2.color;
            c2d.font = labelFont(st2);
            const lx = x + (w / obj.cols) * i; // w is already canvas-scaled
            c2d.save();
            c2d.translate(lx, y - (TICK + TICK_GAP) * t.scaleY);
            c2d.rotate(-Math.PI / 2);
            c2d.fillText(text, 0, 0);
            c2d.restore();
          }
          // column headers: horizontal, centered per column, same baseline
          c2d.textAlign = 'center';
          c2d.textBaseline = 'bottom';
          for (let i = 0; i < obj.cols; i++) {
            const text = (obj.colLabels || {})['c' + i];
            if (!text) continue;
            const st2 = resolveLabelStyle(obj, 'c' + i);
            c2d.fillStyle = st2.color;
            c2d.font = labelFont(st2);
            c2d.fillText(text, x + (w / obj.cols) * (i + 0.5), y - (TICK + TICK_GAP) * t.scaleY);
          }
          c2d.restore();
        },
        // right-click the grid → the text-size stepper, then the line
        // editor one hop away
        menu: (selObjs) => {
          const g0 = (selObjs || []).find(o => o.type === 'gantt');
          const many = (selObjs || []).filter(o => o.type === 'gantt').length;
          fontBurst = false; // a fresh menu starts a fresh undo entry
          return [
            {
              html: '<div class="gtt-size">'
                + `<span class="gtt-size-name">Text Size${many > 1 ? ` (${many} charts)` : ''}</span>`
                + '<button class="gtt-btn gtt-size-btn" data-step="-1" title="Smaller">−</button>'
                + `<span class="gtt-size-val">${barFont(g0)}</span>`
                + '<button class="gtt-btn gtt-size-btn" data-step="1" title="Bigger">+</button>'
                + '</div>',
              // steps live — the menu stays open so you can hold a size up
              // or down and watch the chart follow
              onClick(e, ctx2) {
                const b = e.target.closest('.gtt-size-btn');
                if (!b) return;
                const shown = stepBarFont(ctx2, parseInt(b.dataset.step, 10));
                if (shown == null) return;
                const val = b.parentElement.querySelector('.gtt-size-val');
                if (val) val.textContent = shown;
              },
            },
            {
              label: many > 1 ? `Change Case (${many} charts)` : 'Change Case',
              submenu: [
                { label: 'UPPERCASE', action(ctx2) { ctx2.closeMenus(); applyBarCase(ctx2, 'upper'); } },
                { label: 'lowercase', action(ctx2) { ctx2.closeMenus(); applyBarCase(ctx2, 'lower'); } },
                { label: 'Title Case', action(ctx2) { ctx2.closeMenus(); applyBarCase(ctx2, 'title'); } },
              ],
            },
            { divider: true },
            {
              label: 'Edit Lines…',
              action(ctx2) {
                ctx2.closeMenus();
                for (const id of ctx2.selectedIds) {
                  const g = ctx2.findObject(id);
                  if (g && g.type === 'gantt') { enterLineEdit(g); return; }
                }
              },
            },
          ];
        },
      },

      // THE BARS
      'gantt-bar': {
        defaults: { gridId: 0, col: 0, row: 0, colsSpan: 1, rowsSpan: 1, label: '', fillColor: null },
        resizable: false, // spans via the cell grip, not free pixels
        rotatable: false,
        normalize(obj) {
          obj.gridId = Number(obj.gridId) || 0;
          obj.col = Math.max(0, Math.round(Number(obj.col) || 0));
          obj.row = Math.max(0, Math.round(Number(obj.row) || 0));
          obj.colsSpan = Math.max(1, Math.round(Number(obj.colsSpan) || 1));
          obj.rowsSpan = Math.max(1, Math.round(Number(obj.rowsSpan) || 1));
          if (typeof obj.label !== 'string') obj.label = '';
          if (obj.fillColor && !FILLS.includes(obj.fillColor)) obj.fillColor = null;
          delete obj._dupPending; // transient duplicate-remap flag
        },
        // In a mixed alt-drag (grid + bars selected) the kernel clones
        // this bar itself — flag it so the grid clone's new id can
        // re-home it right after the kernel's duplicate loop.
        onDuplicate(clone, ctx2) {
          if (ctx2.selectedIds.has(clone.gridId)) {
            clone._dupPending = true;
            scheduleDupFix();
          }
        },
        render(obj, el) {
          syncBar(obj, el); // derive the box from the grid FIRST
          el.classList.add('gtt-bar');
          if (obj.fillColor === CLEAR) {
            el.classList.add('gtt-clear'); // chip + boundary both drop out
            el.style.background = 'transparent';
            el.style.borderColor = 'transparent';
          } else {
            const fill = obj.fillColor || DEFAULT_FILL;
            el.style.background = fill;
            el.style.borderColor = darken(fill, 0.8);
          }
          const txt = document.createElement('div');
          txt.className = 'gtt-label';
          txt.style.fontSize = barFont(gridOf(obj)) + 'px'; // the CHART's setting
          if (obj.label) {
            txt.textContent = obj.label;
          } else {
            const span = document.createElement('span');
            span.className = 'placeholder-text';
            span.textContent = 'Task';
            txt.appendChild(span);
          }
          el.appendChild(txt);
          const grip = document.createElement('div');
          grip.className = 'gtt-grip';
          grip.title = 'Drag to span cells';
          el.appendChild(grip);
        },
        onDoubleClick(obj) { editBarLabel(obj, false); return true; },
        menu: (selObjs) => {
          const cur = (selObjs || []).find(o => o.type === 'gantt-bar') || null;
          const isCur = (c) => cur && (cur.fillColor || DEFAULT_FILL) === c;
          return [{
            html: '<div class="gtt-swatches">' + FILLS.map(c => (c === CLEAR
              ? `<button class="gtt-swatch gtt-swatch-clear${isCur(c) ? ' active' : ''}" data-color="${c}" title="Clear — no fill, no boundary"></button>`
              : `<button class="gtt-swatch${isCur(c) ? ' active' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`)
            ).join('') + '</div>',
            onClick(e, ctx2) {
              const b = e.target.closest('.gtt-swatch');
              if (!b) return;
              ctx2.pushUndo();
              for (const id of ctx2.selectedIds) {
                const o = ctx2.findObject(id);
                if (o && o.type === 'gantt-bar') o.fillColor = b.dataset.color;
              }
              ctx2.renderObjects();
              ctx2.markDirty();
              b.parentElement.querySelectorAll('.gtt-swatch').forEach(s =>
                s.classList.toggle('active', s === b));
            },
          }];
        },
        exportDraw(c2d, obj, t) {
          const g = gridOf(obj);
          if (g) { const r = barRect(obj, g); obj.x = r.x; obj.y = r.y; obj.w = r.w; obj.h = r.h; }
          const x = t.x, y = t.y, w = obj.w * t.scaleX, h = obj.h * t.scaleY;
          const s = (t.scaleX + t.scaleY) / 2;
          const clear = obj.fillColor === CLEAR;
          const fill = obj.fillColor || DEFAULT_FILL;
          c2d.save();
          if (!clear) { // a clear bar draws no chip and no boundary
            c2d.beginPath();
            if (c2d.roundRect) c2d.roundRect(x, y, w, h, 4 * s);
            else c2d.rect(x, y, w, h);
            c2d.fillStyle = fill;
            c2d.fill();
            c2d.lineWidth = Math.max(1, 2 * s);
            c2d.strokeStyle = darken(fill, 0.8);
            c2d.stroke();
          }
          if (obj.label) {
            const fSize = barFont(g) * s, lh = fSize * 1.25;
            c2d.fillStyle = BAR_INK;
            c2d.font = `700 ${fSize}px Inter, -apple-system, BlinkMacSystemFont, sans-serif`;
            c2d.textAlign = 'center';
            c2d.textBaseline = 'middle';
            const maxW = Math.max(10, w - 16 * s);
            const fits = (str) => c2d.measureText(str).width <= maxW;
            // word-wrap (mirrors the display); over-wide words hard-break
            const lines = [];
            let cur = '';
            for (const raw of String(obj.label).split(/\s+/).filter(Boolean)) {
              let word = raw;
              const attempt = cur ? cur + ' ' + word : word;
              if (fits(attempt)) { cur = attempt; continue; }
              if (cur) { lines.push(cur); cur = ''; }
              if (fits(word)) { cur = word; continue; }
              while (word.length > 1 && !fits(word)) {
                let chunk = word;
                while (chunk.length > 1 && !fits(chunk)) chunk = chunk.slice(0, -1);
                lines.push(chunk);
                word = word.slice(chunk.length);
              }
              cur = word;
            }
            if (cur) lines.push(cur);
            // as many lines as the bar can hold, centered as a block
            const maxLines = Math.max(1, Math.floor(h / lh));
            const shown = lines.slice(0, maxLines);
            let ty = y + h / 2 - (shown.length * lh) / 2 + lh / 2;
            for (const ln of shown) { c2d.fillText(ln, x + w / 2, ty); ty += lh; }
          }
          c2d.restore();
        },
      },
    },

    // ── RAW POINTER ── the span grip pre-empts select/move (like the
    // flowchart endpoint re-drag at 245); line-edit mode owns clicks
    // while it's open (line hits stopPropagation and never land here —
    // anything arriving is a click elsewhere: inside the grid box just
    // deselects, outside closes the mode; either way the click is spent)
    pointer: [{
      priority: 240,
      handler(e) {
        if (onGripDown(e)) return true;
        if (!lineEdit || e.button !== 0) return false;
        const g = ctx.findObject(lineEdit.gridId);
        if (!g || g.type !== 'gantt') { exitLineEdit(); return false; }
        const el = e.target.closest && e.target.closest('.canvas-obj');
        if (el && parseInt(el.dataset.id) === g.id) {
          if (lineEdit.sel.size) { lineEdit.sel = new Set(); ctx.renderObjects(); }
          return true; // the grid never drags while its lines are open
        }
        exitLineEdit();
        return true; // the first click out just closes the mode
      },
    }],

    // ── LIVE FOLLOW + CELL SNAP (fires during kernel drags + nudges) ───
    onObjectsMoved(movedIds, ctx2) {
      for (const id of movedIds) {
        const o = ctx2.findObject(id);
        if (!o) continue;
        if (o.type === 'gantt') {
          // grid moved → its bars ride along (derive from the new origin)
          for (const b of barsOf(o.id)) {
            if (movedIds.has ? movedIds.has(b.id) : false) continue; // it'll snap itself below
            syncBar(b, objectEl(b.id));
          }
        } else if (o.type === 'gantt-bar') {
          // bar dragged free → magnetic-snap to the nearest cell(s)
          const g = gridOf(o);
          if (!g) continue;
          const { cw, ch } = cellSize(g);
          o.col = Math.max(0, Math.min(g.cols - o.colsSpan, Math.round((o.x - INSET - g.x) / cw)));
          o.row = Math.max(0, Math.min(g.rows - o.rowsSpan, Math.round((o.y - INSET - g.y) / ch)));
          syncBar(o, objectEl(o.id));
        }
      }
    },

    // after load: every bar must fit its grid (hand-edited or imported
    // projects may carry out-of-range cells), then re-derive positions
    // ── CLIPBOARD ── a chart is a grid PLUS its bars ────────────────────
    // Ctrl+C copies only what's selected, so a grid on its own would land
    // as an empty chart. Bring its bars along the way alt-drag's
    // onDuplicate does — then onPasteEnd re-homes them onto the clone.
    onCopy(payload, ctx2) {
      const objs = payload.objects || [];
      const grids = objs.filter(o => o.type === 'gantt').map(o => o.id);
      if (!grids.length) return;
      const have = new Set(objs.filter(o => o.type === 'gantt-bar').map(o => o.id));
      for (const gid of grids) {
        for (const b of ctx2.objects) {
          if (b.type !== 'gantt-bar' || b.gridId !== gid || have.has(b.id)) continue;
          objs.push(JSON.parse(JSON.stringify(b)));
          have.add(b.id);
        }
      }
    },
    // Every clone exists and its id is known: point this paste's bars at
    // this paste's grid. A bar pasted WITHOUT its grid finds no entry and
    // keeps its gridId, which correctly re-attaches it to that grid if it
    // still exists.
    onPasteEnd(pasted) {
      const map = new Map();
      for (const o of pasted) {
        if (o.type !== 'gantt' || !o._pasteSrc) continue;
        map.set(o._pasteSrc, o.id);
        delete o._pasteSrc;
      }
      if (!map.size) return;
      for (const o of pasted) {
        if (o.type === 'gantt-bar' && map.has(o.gridId)) o.gridId = map.get(o.gridId);
      }
    },

    onReady(ctx2) {
      let touched = false;
      for (const g of ctx2.objects) {
        if (g.type !== 'gantt') continue;
        g.selfId = g.id; // heal provenance that arrived via a hookless path
        clampBars(g);
        touched = true;
      }
      if (touched) ctx2.renderObjects();
    },

    // deleting a grid deletes its bars (flowchart-connector cascade)
    onDelete(del, ctx2) {
      for (const id of Array.from(del)) {
        const o = ctx2.findObject(id);
        if (o && o.type === 'gantt') {
          for (const b of barsOf(id)) del.add(b.id);
        }
      }
    },

    // ── UI ── own family button on the rail + canvas menu entry
    toolbar: [
      { icon: GANTT_ICON, title: 'Add Gantt Chart', order: 35, action() { addGantt(); } },
    ],
    canvasMenu: [
      {
        label: 'Add Gantt Chart',
        icon: GANTT_ICON_14,
        order: 35,
        action(ctx2) { addGantt(ctx2.contextWorld.x, ctx2.contextWorld.y); },
      },
    ],
  };
}
