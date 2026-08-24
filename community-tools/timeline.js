/* ═══════════════════════════════════════════════════════════════════════
   timeline.js — Timeline, by santibraby

   The Gantt chart's 1-dimensional sibling: a single horizontal SPINE
   divided into equal parts (3 to start), with a TICK at every division —
   endpoints included. Ticks can be restyled as DOTS (filled grey), ORANGE
   DOTS (the brand mark, #F05300 — same dot, full saturation) or OPEN DOTS
   (not filled); the spine gaps around all three, metro-map style. They
   can also be made invisible, or deleted; every tick carries an optional label rotated
   90° CCW above it (same treatment as the Gantt's tick labels: shared
   baseline, ghost ··· on hover, click to type). Select a tick and
   right-click → Label Position to lay that label flat instead:
   Horizontal Above or Horizontal Below, centered on the mark. Works on
   a multi-selection, and the placement travels with the tick on reorder.

   EDITING — same grammar as the Gantt: double-click the timeline to
   enter TICK-EDIT mode (nearest tick preselected), click to select,
   Shift-click to multi-select, right-click for Tick / Filled Dot /
   Orange Dot / Open Dot / Invisible / Delete, Esc or click-away to finish. DELETE
   removes the whole DIVISION — the tick, its label, its label style and
   the span that collapses with it — so divs drops and the survivors
   re-space evenly across the same width (a multi-selection goes in one
   undo step; a timeline always keeps at least one part). To drop the
   mark but KEEP its slot and spacing, use Invisible instead. DRAG a tick left/right
   to REORDER it, spreadsheet-column style: crossing a slot midpoint
   slides the neighbor into your old place and opens the space for you —
   positions stay equally spaced, the tick's style + label travel with
   it, and the whole drag is one undo step. Hover the right end for
   the +/− pair: + adds a division (equally re-spaced, boundary fixed) —
   or, with exactly ONE tick selected, inserts the new tick right AFTER
   it (styles and labels shift with their ticks); − removes from the end.

   DATA: obj.divs (parts), obj.tickStyles ('t2' → 'dot'|'orange'|
   'circle'|'invisible'; 'tick' is the default and stored implicitly, and
   a legacy 'none' migrates to 'invisible' on load),
   obj.tickLabels ('t2' → text), obj.labelStyles ('t2' → { preset?,
   font?, color?, pos? } — pos 'above'|'below' lays a tick label flat,
   'up' is the rotated default and is stored implicitly),
   obj.segLabels ('s0' → horizontal
   SEGMENT HEADERS centered between ticks at the same baseline — tick
   labels name the moments, segment headers name the spans between
   them). Kernel-standard move/resize; width re-spaces the divisions,
   height re-centers the spine.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'timeline',
  name: 'Timeline',
  version: '1.0.0',
  authors: ['santibraby'],
  basedOn: null,
  description: 'A one-dimensional Gantt: a divided spine with labeled ticks that can become filled or open dots — same editing grammar as the Gantt chart.',
};

export function register(ctx) {
  const GREY = '#CCCCCC';       // the marks — spine, ticks, dots
  const LABEL_GREY = '#999999'; // label default (the grey in the swatch row)
  const SPINE_W = 3;       // the spine — the chart's primary rule
  const TICK_W = 1.5;      // tick stroke
  const TICK_H = 24;       // tick height (world px, centered on the spine)
  const BRAND = '#F05300'; // full-saturation orange — the brand mark
  const DOT_R = 10;        // dot / open-dot radius
  const GAP_R = 16;        // spine gap radius around dot-style ticks —
                           // scales WITH DOT_R, or the spine cuts the dot
  const LABEL_GAP = 6;     // between tick top and its label
  const TICK_FONT = 13;
  const MAXDIVS = 60;
  const DEF_DIVS = 3, DEF_W = 900, DEF_H = 44;
  // 'none' was a SOFT delete — mark gone, slot kept — which is exactly
  // what 'invisible' already does. Delete now removes the division itself,
  // so 'none' is retired: old projects migrate to 'invisible' on load,
  // which is byte-for-byte how they already looked.
  const TICK_STYLES = ['tick', 'dot', 'orange', 'circle', 'invisible'];
  // Where a tick's label sits relative to its mark. 'up' (rotated 90° CCW
  // above the tick) is the default and is stored implicitly.
  const LABEL_POS = ['up', 'above', 'below'];

  function objectEl(id) {
    return ctx.getObjectElement
      ? ctx.getObjectElement(id)
      : ctx.worldEl.querySelector(`.canvas-obj[data-id="${id}"]`);
  }

  const styleOf = (o, k) => (o.tickStyles || {})[k] || 'tick';
  // filled grey, filled orange and open dots all break the spine
  const isRound = (st) => st === 'dot' || st === 'orange' || st === 'circle';

  function pruneTicks(o) {
    const ts = (o.tickStyles && typeof o.tickStyles === 'object') ? o.tickStyles : {};
    const clean = {};
    for (const [k, v] of Object.entries(ts)) {
      const m = /^t(\d+)$/.exec(k);
      const val = (v === 'none') ? 'invisible' : v; // legacy soft-delete
      if (!m || !TICK_STYLES.includes(val) || val === 'tick') continue;
      const n = parseInt(m[1], 10);
      if (n < 0 || n > o.divs) continue;
      clean[k] = val;
    }
    o.tickStyles = clean;
    const tl = (o.tickLabels && typeof o.tickLabels === 'object') ? o.tickLabels : {};
    const cleanTl = {};
    for (const [k, v] of Object.entries(tl)) {
      const m = /^t(\d+)$/.exec(k);
      if (!m || typeof v !== 'string' || !v.trim()) continue;
      const n = parseInt(m[1], 10);
      if (n < 0 || n > o.divs) continue;
      cleanTl[k] = v;
    }
    o.tickLabels = cleanTl;
    // segment headers are SEGMENT-keyed ('s0' → text over part 0)
    const sl = (o.segLabels && typeof o.segLabels === 'object') ? o.segLabels : {};
    const cleanSl = {};
    for (const [k, v] of Object.entries(sl)) {
      const m = /^s(\d+)$/.exec(k);
      if (!m || typeof v !== 'string' || !v.trim()) continue;
      const n = parseInt(m[1], 10);
      if (n < 0 || n >= o.divs) continue;
      cleanSl[k] = v;
    }
    o.segLabels = cleanSl;
    // per-label style overrides ride the same keys (t* ticks, s* segments)
    const lsm = (o.labelStyles && typeof o.labelStyles === 'object') ? o.labelStyles : {};
    const cleanLs = {};
    for (const [k, v] of Object.entries(lsm)) {
      const m = /^([ts])(\d+)$/.exec(k);
      if (!m || !v || typeof v !== 'object') continue;
      const n = parseInt(m[2], 10);
      if (m[1] === 't' && (n < 0 || n > o.divs)) continue;
      if (m[1] === 's' && (n < 0 || n >= o.divs)) continue;
      const o2 = {};
      if (typeof v.preset === 'string' && LABEL_PRESETS[v.preset]) o2.preset = v.preset;
      if (typeof v.font === 'string' && v.font) o2.font = v.font;
      if (typeof v.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(v.color)) o2.color = v.color;
      // placement is a TICK-label affair; 'up' is the default, stored
      // implicitly like every other deviation in this file
      if (m[1] === 't' && typeof v.pos === 'string' && LABEL_POS.includes(v.pos) && v.pos !== 'up') o2.pos = v.pos;
      if (Object.keys(o2).length) cleanLs[k] = o2;
    }
    o.labelStyles = cleanLs;
  }

  function addTimeline(wx, wy) {
    ctx.pushUndo();
    const center = (wx !== undefined) ? { x: wx, y: wy } : ctx.viewportCenter();
    const obj = ctx.createObject({
      type: 'timeline',
      x: center.x - DEF_W / 2, y: center.y - DEF_H / 2,
      w: DEF_W, h: DEF_H,
      divs: DEF_DIVS, tickStyles: {}, tickLabels: {},
    });
    ctx.selectObject(obj.id);
    ctx.renderObjects();
    ctx.markDirty();
  }

  // ── TICK-EDIT MODE (the Gantt's line-edit grammar, one axis) ─────────
  let tickEdit = null; // { objId, sel: Set<'t0'|…> }

  function enterTickEdit(o, selKey) {
    if (ctx.getActiveTool()) ctx.setTool(null);
    ctx.clearSelection();
    ctx.updateSelectionVisuals();
    tickEdit = { objId: o.id, sel: new Set(selKey ? [selKey] : []) };
    document.addEventListener('keydown', onTickKey, true);
    ctx.renderObjects();
    ctx.showToast('Editing ticks — click selects · Shift-click adds · right-click for style · Delete removes · Esc done');
  }
  function exitTickEdit() {
    if (!tickEdit) return;
    tickEdit = null;
    document.removeEventListener('keydown', onTickKey, true);
    ctx.renderObjects();
  }
  function onTickKey(e) {
    if (!tickEdit) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      exitTickEdit();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && tickEdit.sel.size) {
      e.preventDefault(); e.stopPropagation(); // never delete the TIMELINE from tick-edit
      const o = ctx.findObject(tickEdit.objId);
      if (o && o.type === 'timeline') deleteTicks(o, [...tickEdit.sel]);
    }
  }

  // ── delete a whole DIVISION ─────────────────────────────────────────
  // Not a style — the slot itself goes: the tick, its label, its label
  // style, and the span that collapses with it. divs drops by one, so the
  // survivors re-space evenly across the same width. (To hide a mark but
  // KEEP its slot and spacing, that's the Invisible style.)
  function removeSlot(map, prefix, idx) {
    const out = {};
    const re = new RegExp('^' + prefix + '(\\d+)$');
    for (const [k, v] of Object.entries(map || {})) {
      const m = re.exec(k);
      if (!m) { out[k] = v; continue; }   // other prefixes pass through
      const n = parseInt(m[1], 10);
      if (n === idx) continue;            // gone with its slot
      out[prefix + (n > idx ? n - 1 : n)] = v;
    }
    return out;
  }
  function deleteOneTick(o, j) {
    const N = o.divs; // ticks t0..tN, segments s0..s(N-1)
    // removing a tick merges the spans either side of it — the one that
    // STARTS at j collapses (at the far end, the one that ENDS there)
    const segIdx = Math.min(j, N - 1);
    o.tickStyles = removeSlot(o.tickStyles, 't', j);
    o.tickLabels = removeSlot(o.tickLabels, 't', j);
    o.segLabels = removeSlot(o.segLabels, 's', segIdx);
    o.labelStyles = removeSlot(removeSlot(o.labelStyles, 't', j), 's', segIdx);
    o.divs = N - 1;
  }
  function deleteTicks(o, keys) {
    const idxs = [...new Set(keys
      .map(k => parseInt(String(k).slice(1), 10))
      .filter(n => Number.isFinite(n) && n >= 0 && n <= o.divs))]
      .sort((a, b) => b - a); // high → low, so lower indices stay valid
    if (!idxs.length) return;
    if (o.divs - idxs.length < 1) {
      ctx.showToast('A timeline needs at least one part');
      return;
    }
    ctx.pushUndo();
    for (const j of idxs) deleteOneTick(o, j);
    pruneTicks(o);
    if (tickEdit && tickEdit.objId === o.id) {
      // keep a neighbour selected so you can carry on deleting
      tickEdit.sel = new Set(['t' + Math.max(0, Math.min(idxs[idxs.length - 1], o.divs))]);
    }
    ctx.renderObjects();
    ctx.markDirty();
  }
  // ── spreadsheet-style tick reorder ──────────────────────────────────
  // Move a tick's DRESS (style + label) from slot `from` to slot `to`;
  // everything between shifts one slot toward the vacated space. The
  // positions stay equally spaced — only the ORDER changes. Segment
  // headers stay positional (they name the parts, not the marks).
  function reorderTick(o, from, to) {
    if (from === to) return;
    const N = o.divs;
    const styles = [], labels = [], lstyles = [];
    for (let i = 0; i <= N; i++) {
      styles.push((o.tickStyles || {})['t' + i] || 'tick');
      labels.push((o.tickLabels || {})['t' + i] || '');
      lstyles.push((o.labelStyles || {})['t' + i] || null);
    }
    const [ds] = styles.splice(from, 1); styles.splice(to, 0, ds);
    const [dl] = labels.splice(from, 1); labels.splice(to, 0, dl);
    const [dls] = lstyles.splice(from, 1); lstyles.splice(to, 0, dls);
    const ts = {}, tl = {};
    // label-STYLE overrides travel with their tick; segment ('s') styles
    // stay positional — carry them over untouched
    const ls = {};
    for (const [k, v] of Object.entries(o.labelStyles || {})) {
      if (k[0] === 's') ls[k] = v;
    }
    for (let i = 0; i <= N; i++) {
      if (styles[i] !== 'tick') ts['t' + i] = styles[i];
      if (labels[i]) tl['t' + i] = labels[i];
      if (lstyles[i]) ls['t' + i] = lstyles[i];
    }
    o.tickStyles = ts;
    o.tickLabels = tl;
    o.labelStyles = ls;
  }
  // Live drag: crossing a slot midpoint reorders immediately (the
  // neighbor slides into your old slot — the space "opens up"). One
  // undo step for the whole drag, pushed lazily on first movement.
  function beginTickDrag(o, key, downEv) {
    let idx = parseInt(key.slice(1), 10);
    if (!Number.isFinite(idx)) return;
    const startX = downEv.clientX;
    let pushed = false;
    const onMove = (ev) => {
      if (!pushed && Math.abs(ev.clientX - startX) < 4) return; // still a click
      const p = ctx.screenToWorld(ev.clientX, ev.clientY);
      const step = o.w / o.divs;
      const slot = Math.max(0, Math.min(o.divs, Math.round((p.x - o.x) / step)));
      if (slot === idx) return;
      if (!pushed) { ctx.pushUndo(); pushed = true; }
      reorderTick(o, idx, slot);
      idx = slot;
      if (tickEdit) tickEdit.sel = new Set(['t' + idx]);
      ctx.renderObjects();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (pushed) { ctx.renderObjects(); ctx.markDirty(); }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function setTickStyles(o, keys, style) {
    ctx.pushUndo();
    const ts = { ...(o.tickStyles || {}) };
    for (const key of keys) {
      if (style === 'tick') delete ts[key]; else ts[key] = style;
    }
    o.tickStyles = ts;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function openTickMenu(o, keys, ev) {
    const all = (want) => keys.every(k => styleOf(o, k) === want);
    const many = keys.length > 1;
    const items = [
      { label: 'Tick', checked: all('tick'), action() { setTickStyles(o, keys, 'tick'); } },
      { label: 'Filled Dot', checked: all('dot'), action() { setTickStyles(o, keys, 'dot'); } },
      { label: 'Orange Dot', checked: all('orange'), action() { setTickStyles(o, keys, 'orange'); } },
      { label: 'Open Dot', checked: all('circle'), action() { setTickStyles(o, keys, 'circle'); } },
      { label: 'Invisible', checked: all('invisible'), action() { setTickStyles(o, keys, 'invisible'); } },
    ];
    // where this tick's LABEL sits — rotated above (default), or
    // horizontal centered above / below the spine
    const allPos = (want) => keys.every(k => resolveLabelStyle(o, k).pos === want);
    items.push({ divider: true });
    items.push({
      label: many ? `Label Position (${keys.length})` : 'Label Position',
      submenu: [
        { label: 'Vertical', checked: allPos('up'), action() { setLabelPos(o, keys, 'up'); } },
        { label: 'Horizontal Above', checked: allPos('above'), action() { setLabelPos(o, keys, 'above'); } },
        { label: 'Horizontal Below', checked: allPos('below'), action() { setLabelPos(o, keys, 'below'); } },
      ],
    });
    items.push({ divider: true });
    items.push({
      label: many ? `Delete ${keys.length} Ticks` : 'Delete Tick',
      danger: true,
      action() { deleteTicks(o, keys); },
    });
    ctx.openMenu(items, ev.clientX, ev.clientY);
  }

  // ── +/− (boundary fixed; + inserts after a single selected tick) ─────
  function changeDivs(o, delta) {
    const next = o.divs + delta;
    if (next < 1) { ctx.showToast('A timeline needs at least one part'); return; }
    if (next > MAXDIVS) { ctx.showToast(`${MAXDIVS} is plenty`); return; }
    ctx.pushUndo();
    const selOnAxis = (delta > 0 && tickEdit && tickEdit.objId === o.id)
      ? [...tickEdit.sel] : [];
    const selIdx = selOnAxis.length === 1 ? parseInt(selOnAxis[0].slice(1), 10) : null;
    o.divs = next;
    if (selIdx != null && Number.isFinite(selIdx)) {
      const k = selIdx; // new tick lands right AFTER tick k
      // ticks shift from k+1 (tick k stays); SEGMENTS shift from k (the
      // new part slots in at k)
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
      o.tickStyles = shiftKeys(o.tickStyles, 't', k + 1);
      o.tickLabels = shiftKeys(o.tickLabels, 't', k + 1);
      o.segLabels = shiftKeys(o.segLabels, 's', k);
      o.labelStyles = shiftKeys(shiftKeys(o.labelStyles, 't', k + 1), 's', k);
      tickEdit.sel = new Set(['t' + (k + 1)]); // the fresh tick takes the selection
    }
    pruneTicks(o);
    ctx.renderObjects();
    ctx.markDirty();
  }

  // ── labels (the Gantt's rotated tick labels, verbatim grammar) ───────
  function setTickLabel(o, key, text) {
    ctx.pushUndo();
    const tl = { ...(o.tickLabels || {}) };
    const v = String(text || '').trim();
    if (v) tl[key] = v; else delete tl[key];
    o.tickLabels = tl;
    ctx.renderObjects();
    ctx.markDirty();
  }
  // ── per-label TEXT STYLE (right-click a label — the text tool's menu) ─
  // Overrides live in obj.labelStyles keyed like the label ('t2'/'s0'):
  // { preset?, font?, color? }. Presets are the app's canonical text
  // identities; font/color refine on top. Tick-label styles travel with
  // their tick on reorder; segment styles stay positional.
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
  function resolveLabelStyle(o, key) {
    const ov = (o.labelStyles || {})[key] || {};
    const p = ov.preset ? LABEL_PRESETS[ov.preset] : null;
    return {
      size: p ? p.size : TICK_FONT,
      weight: p ? p.weight : 500,
      fstyle: p ? p.fstyle : 'normal',
      family: ov.font || (p ? p.family : '"JetBrains Mono", monospace'),
      color: ov.color || (p ? p.color : LABEL_GREY),
      pos: LABEL_POS.includes(ov.pos) ? ov.pos : 'up',
    };
  }
  // Placement rides labelStyles alongside preset/font/color, so it travels
  // with its tick on reorder and shifts with the +/− insert for free.
  function setLabelPos(o, keys, pos) {
    ctx.pushUndo();
    const map = { ...(o.labelStyles || {}) };
    for (const key of keys) {
      const next = { ...(map[key] || {}) };
      if (pos === 'up') delete next.pos; else next.pos = pos;
      if (Object.keys(next).length) map[key] = next; else delete map[key];
    }
    o.labelStyles = map;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function setLabelStyle(o, key, patch) {
    ctx.pushUndo();
    const map = { ...(o.labelStyles || {}) };
    const next = { ...(map[key] || {}), ...patch };
    for (const k of Object.keys(next)) if (next[k] == null) delete next[k];
    if (Object.keys(next).length) map[key] = next; else delete map[key];
    o.labelStyles = map;
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
  function openLabelStyleMenu(o, key, ev) {
    const cur = (o.labelStyles || {})[key] || {};
    ctx.openMenu([
      {
        label: 'Change Style',
        submenu: [
          { label: 'Label', checked: cur.preset === 'label', action() { setLabelStyle(o, key, { preset: 'label' }); } },
          { label: 'Title', checked: cur.preset === 'title', action() { setLabelStyle(o, key, { preset: 'title' }); } },
          { label: 'Subtitle', checked: cur.preset === 'subtitle', action() { setLabelStyle(o, key, { preset: 'subtitle' }); } },
          { label: 'Description', checked: cur.preset === 'description', action() { setLabelStyle(o, key, { preset: 'description' }); } },
          { divider: true },
          { label: 'Chart Default', checked: !cur.preset && !cur.font, action() { setLabelStyle(o, key, { preset: null, font: null }); } },
          { divider: true },
          ...LABEL_FONTS.map(([name, css]) => ({
            label: name, checked: cur.font === css,
            action() { setLabelStyle(o, key, { font: css }); },
          })),
          { divider: true },
          { label: 'Default Color', action() { setLabelStyle(o, key, { color: null }); } },
          {
            html: '<div class="tml-swatches">' + LABEL_SWATCHES.map(c =>
              `<button class="tml-swatch${cur.color === c ? ' active' : ''}" data-color="${c}" title="${c}" style="background:${c}"></button>`
            ).join('') + '</div>',
            onClick(e, ctx2) {
              const b = e.target.closest('.tml-swatch');
              if (!b) return;
              ctx2.closeMenus();
              setLabelStyle(o, key, { color: b.dataset.color });
            },
          },
          { label: 'Custom Color…', action() { pickLabelColor((c) => setLabelStyle(o, key, { color: c })); } },
        ],
      },
    ], ev.clientX, ev.clientY);
  }

  function setSegLabel(o, key, text) {
    ctx.pushUndo();
    const sl = { ...(o.segLabels || {}) };
    const v = String(text || '').trim();
    if (v) sl[key] = v; else delete sl[key];
    o.segLabels = sl;
    ctx.renderObjects();
    ctx.markDirty();
  }
  function editSegLabel(o, key) {
    const el = objectEl(o.id);
    const div = el && el.querySelector(`.tml-seghead[data-key="${key}"]`);
    if (!div) return;
    const orig = (o.segLabels || {})[key] || '';
    div.classList.remove('tml-seghead-empty');
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
      if (v !== orig) setSegLabel(o, key, v);
      else ctx.renderObjects();
    };
    div.addEventListener('blur', () => finish(true));
    div.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); div.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }
  function editTickLabel(o, key) {
    const el = objectEl(o.id);
    const div = el && el.querySelector(`.tml-label[data-key="${key}"]`);
    if (!div) return;
    const orig = (o.tickLabels || {})[key] || '';
    div.classList.remove('tml-label-empty');
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
      if (v !== orig) setTickLabel(o, key, v);
      else ctx.renderObjects();
    };
    div.addEventListener('blur', () => finish(true));
    div.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter') { ev.preventDefault(); div.blur(); }
      if (ev.key === 'Escape') { ev.preventDefault(); finish(false); }
    });
  }

  const TML_ICON = '<svg viewBox="0 0 24 24"><line x1="2" y1="12" x2="22" y2="12"/><line x1="7" y1="8" x2="7" y2="16"/><circle cx="15" cy="12" r="2.5"/></svg>';
  const TML_ICON_14 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + TML_ICON.slice(TML_ICON.indexOf('>') + 1);

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      .canvas-obj.tml-obj { overflow: visible; }
      .canvas-obj.tml-obj svg {
        display: block; width: 100%; height: 100%;
        overflow: visible; pointer-events: none;
      }
      .tml-hit { stroke: transparent; stroke-width: 16; pointer-events: stroke; cursor: grab; }
      .tml-mark { stroke: ${GREY}; }
      .tml-ghost { stroke: rgba(204, 204, 204, 0.22); stroke-dasharray: 3 6; }
      .tml-markg:hover .tml-mark { stroke: #F0F0F0; }
      .tml-sel .tml-mark { stroke: #F0C4A0 !important; }
      .tml-sel circle.tml-mark[data-filled] { fill: #F0C4A0 !important; }
      .canvas-obj.tml-obj.tml-editing {
        outline: 1px dashed #F0C4A0;
        outline-offset: 5px;
      }
      /* +/− pair (self-contained — rule 1: no other tool's CSS) */
      .tml-ctl {
        position: absolute;
        right: -30px; top: 50%;
        transform: translateY(-50%);
        display: flex; flex-direction: column; gap: 3px;
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.tml-obj:hover .tml-ctl,
      .canvas-obj.tml-obj.selected .tml-ctl,
      .canvas-obj.tml-obj.tml-editing .tml-ctl { opacity: 1; }
      .tml-btn {
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
      .tml-btn:hover { border-color: #F0A178; color: #F0F0F0; }

      /* labels: identical grammar to the Gantt tick labels */
      .tml-label {
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
      /* horizontal placements — must follow .tml-label to beat its
         rotation (same specificity, source order decides) */
      .tml-label-flat {
        transform: translateX(-50%);
        transform-origin: center center;
      }
      .tml-label-empty {
        color: rgba(204, 204, 204, 0.35);
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.tml-obj:hover .tml-label-empty,
      .canvas-obj.tml-obj.selected .tml-label-empty,
      .canvas-obj.tml-obj.tml-editing .tml-label-empty { opacity: 1; }
      .tml-label[contenteditable="true"] {
        user-select: text;
        color: #F0F0F0;
        opacity: 1;
      }
      .tml-swatches { display: flex; gap: 6px; align-items: center; padding: 8px 14px; }
      .tml-swatch {
        box-sizing: border-box;
        width: 20px; height: 20px; padding: 0;
        border-radius: 50%;
        border: 2px solid rgba(255, 255, 255, 0.18);
        cursor: pointer;
        transition: transform 0.1s, border-color 0.1s;
      }
      .tml-swatch:hover { transform: scale(1.18); border-color: #F0C4A0; }
      .tml-swatch.active { border-color: #F0F0F0; }
      /* segment headers: horizontal, centered between ticks */
      .tml-seghead {
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
      .tml-seghead-empty {
        color: rgba(204, 204, 204, 0.35);
        opacity: 0;
        transition: opacity 140ms ease;
      }
      .canvas-obj.tml-obj:hover .tml-seghead-empty,
      .canvas-obj.tml-obj.selected .tml-seghead-empty,
      .canvas-obj.tml-obj.tml-editing .tml-seghead-empty { opacity: 1; }
      .tml-seghead[contenteditable="true"] {
        user-select: text;
        color: #F0F0F0;
        opacity: 1;
      }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      timeline: {
        defaults: { divs: DEF_DIVS, tickStyles: {}, tickLabels: {}, segLabels: {}, labelStyles: {} },
        rotatable: false, // tick math is axis-aligned
        normalize(obj) {
          obj.divs = Math.max(1, Math.min(MAXDIVS, Math.round(Number(obj.divs) || DEF_DIVS)));
          pruneTicks(obj);
        },
        render(obj, el) {
          el.classList.add('tml-obj');
          const editing = !!(tickEdit && tickEdit.objId === obj.id);
          if (editing) el.classList.add('tml-editing');
          const w = obj.w, h = obj.h;
          const cy = h / 2;
          const tickHalf = Math.min(TICK_H, h) / 2;
          const step = w / obj.divs;

          // the spine, gapped around dot-style ticks (metro-map read)
          const gaps = [];
          for (let i = 0; i <= obj.divs; i++) {
            const st = styleOf(obj, 't' + i);
            if (isRound(st)) gaps.push([i * step - GAP_R, i * step + GAP_R]);
          }
          gaps.sort((a, b) => a[0] - b[0]);
          let spine = '';
          let cursor = 0;
          for (const [g0, g1] of gaps) {
            if (g0 > cursor) spine += `<line class="tml-mark" x1="${cursor}" y1="${cy}" x2="${Math.min(g0, w)}" y2="${cy}" stroke-width="${SPINE_W}"/>`;
            cursor = Math.max(cursor, g1);
          }
          if (cursor < w) spine += `<line class="tml-mark" x1="${cursor}" y1="${cy}" x2="${w}" y2="${cy}" stroke-width="${SPINE_W}"/>`;

          // the ticks
          let marks = '';
          for (let i = 0; i <= obj.divs; i++) {
            const key = 't' + i;
            const st = styleOf(obj, key);
            const hidden = st === 'invisible' || st === 'none';
            if (hidden && !editing) continue;
            const x = i * step;
            const selCls = editing && tickEdit.sel.has(key) ? ' tml-sel' : '';
            let mark = '';
            if (st === 'dot' || st === 'orange') {
              mark = `<circle class="tml-mark" data-filled="1" cx="${x}" cy="${cy}" r="${DOT_R}" fill="${st === 'orange' ? BRAND : GREY}" stroke="none"/>`;
            } else if (st === 'circle') {
              mark = `<circle class="tml-mark" cx="${x}" cy="${cy}" r="${DOT_R}" fill="none" stroke-width="${TICK_W}"/>`;
            } else { // 'tick' — and ghosts for hidden ones while editing
              mark = `<line class="tml-mark${hidden ? ' tml-ghost' : ''}" x1="${x}" y1="${cy - tickHalf}" x2="${x}" y2="${cy + tickHalf}" stroke-width="${TICK_W}"/>`;
            }
            marks += `<g class="tml-markg${selCls}" data-key="${key}">` + mark +
              (editing ? `<line class="tml-hit" x1="${x}" y1="${cy - tickHalf - 8}" x2="${x}" y2="${cy + tickHalf + 8}"/>` : '') +
              `</g>`;
          }
          el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">${spine}${marks}</svg>`;

          // labels — every tick, any style, one shared baseline
          for (let i = 0; i <= obj.divs; i++) {
            const key = 't' + i;
            const text = (obj.tickLabels || {})[key] || '';
            const st = resolveLabelStyle(obj, key);
            const lineH = Math.round(st.size * 1.35);
            const div = document.createElement('div');
            div.className = 'tml-label' + (text ? '' : ' tml-label-empty')
              + (st.pos === 'up' ? '' : ' tml-label-flat');
            div.dataset.key = key;
            div.textContent = text || '···';
            const off = Math.min(TICK_H, h) / 2 + LABEL_GAP;
            if (st.pos === 'up') {
              // rotate(-90) about left-bottom grows the text UP from the
              // pivot and pushes the box LEFT by its line height — so the
              // pivot sits half a line right of the tick to center the band
              div.style.left = (i * step + lineH / 2) + 'px';
              div.style.bottom = `calc(50% + ${off}px)`;
            } else {
              // horizontal, centered on the tick (translateX(-50%)), sitting
              // above or below the spine at the same offset
              div.style.left = (i * step) + 'px';
              if (st.pos === 'above') div.style.bottom = `calc(50% + ${off}px)`;
              else div.style.top = `calc(50% + ${off}px)`;
            }
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

          // segment headers: horizontal, centered between ticks, same
          // baseline as the tick labels
          for (let i = 0; i < obj.divs; i++) {
            const key = 's' + i;
            const text = (obj.segLabels || {})[key] || '';
            const st = resolveLabelStyle(obj, key);
            const div = document.createElement('div');
            div.className = 'tml-seghead' + (text ? '' : ' tml-seghead-empty');
            div.dataset.key = key;
            div.textContent = text || '···';
            div.style.left = ((i + 0.5) * step) + 'px';
            div.style.bottom = `calc(50% + ${Math.min(TICK_H, h) / 2 + LABEL_GAP}px)`;
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
              editSegLabel(obj, key);
            });
            el.appendChild(div);
          }

          // hover +/− (right end)
          const mkBtn = (label, title, fn) => {
            const b = document.createElement('button');
            b.className = 'tml-btn';
            b.type = 'button';
            b.textContent = label;
            b.title = title;
            b.addEventListener('mousedown', (ev) => ev.stopPropagation());
            b.addEventListener('click', (ev) => { ev.stopPropagation(); fn(); });
            return b;
          };
          const ctl = document.createElement('div');
          ctl.className = 'tml-ctl';
          ctl.appendChild(mkBtn('+', 'Add a tick — after the selected one, or at the end', () => changeDivs(obj, +1)));
          ctl.appendChild(mkBtn('−', 'Remove a tick (from the end)', () => changeDivs(obj, -1)));
          el.appendChild(ctl);

          if (editing) {
            el.querySelectorAll('.tml-markg').forEach(gEl => {
              const key = gEl.dataset.key;
              gEl.addEventListener('mousedown', (ev) => {
                ev.stopPropagation();
                if (ev.button === 2) {
                  ev.preventDefault();
                  if (!tickEdit.sel.has(key)) tickEdit.sel = new Set([key]);
                  openTickMenu(obj, [...tickEdit.sel], ev);
                  ctx.renderObjects();
                  return;
                }
                if (ev.button !== 0) return;
                if (ev.shiftKey) {
                  // shift-click toggles membership — never starts a drag
                  if (tickEdit.sel.has(key)) tickEdit.sel.delete(key);
                  else tickEdit.sel.add(key);
                  ctx.renderObjects();
                  return;
                }
                // plain press: select, and become a reorder drag on movement
                tickEdit.sel = new Set([key]);
                ctx.renderObjects();
                beginTickDrag(obj, key, ev);
              });
              gEl.addEventListener('contextmenu', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
            });
          }
        },
        // double-click → tick-edit mode, nearest tick preselected
        onDoubleClick(obj, e, ctx2) {
          const p = ctx2.screenToWorld(e.clientX, e.clientY);
          const step = obj.w / obj.divs;
          const tol = 10 / Math.max(0.05, ctx2.getZoom());
          let nearKey = null, nearD = Infinity;
          for (let i = 0; i <= obj.divs; i++) {
            const d = Math.abs(p.x - (obj.x + i * step));
            if (d < nearD) { nearD = d; nearKey = 't' + i; }
          }
          enterTickEdit(obj, nearD <= tol ? nearKey : null);
          return true;
        },
        exportDraw(c2d, obj, t) {
          const x = t.x, y = t.y, w = obj.w * t.scaleX, h = obj.h * t.scaleY;
          const s = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
          const cy = y + h / 2;
          const tickHalf = (Math.min(TICK_H, obj.h) / 2) * t.scaleY;
          const step = w / obj.divs;
          c2d.save();
          c2d.strokeStyle = GREY;
          c2d.fillStyle = GREY;
          c2d.setLineDash([]);
          // gapped spine
          const gaps = [];
          for (let i = 0; i <= obj.divs; i++) {
            const st = styleOf(obj, 't' + i);
            if (isRound(st)) gaps.push([i * step - GAP_R * t.scaleX, i * step + GAP_R * t.scaleX]);
          }
          gaps.sort((a, b) => a[0] - b[0]);
          c2d.lineWidth = Math.max(1, SPINE_W * s);
          c2d.beginPath();
          let cursor = 0;
          for (const [g0, g1] of gaps) {
            if (g0 > cursor) { c2d.moveTo(x + cursor, cy); c2d.lineTo(x + Math.min(g0, w), cy); }
            cursor = Math.max(cursor, g1);
          }
          if (cursor < w) { c2d.moveTo(x + cursor, cy); c2d.lineTo(x + w, cy); }
          c2d.stroke();
          // ticks / dots / circles
          for (let i = 0; i <= obj.divs; i++) {
            const st = styleOf(obj, 't' + i);
            if (st === 'invisible' || st === 'none') continue;
            const tx = x + i * step;
            if (st === 'dot' || st === 'orange') {
              c2d.fillStyle = st === 'orange' ? BRAND : GREY;
              c2d.beginPath(); c2d.arc(tx, cy, DOT_R * s, 0, Math.PI * 2); c2d.fill();
              c2d.fillStyle = GREY; // hand the brush back for the labels
            } else if (st === 'circle') {
              c2d.lineWidth = Math.max(1, TICK_W * s);
              c2d.beginPath(); c2d.arc(tx, cy, DOT_R * s, 0, Math.PI * 2); c2d.stroke();
            } else {
              c2d.lineWidth = Math.max(1, TICK_W * s);
              c2d.beginPath(); c2d.moveTo(tx, cy - tickHalf); c2d.lineTo(tx, cy + tickHalf); c2d.stroke();
            }
          }
          // labels — per-label placement + styles, mirroring the display
          const labelFont = (st2) =>
            `${st2.fstyle === 'italic' ? 'italic ' : ''}${st2.weight} ${st2.size * s}px ${st2.family}`;
          const gap = LABEL_GAP * t.scaleY;
          for (let i = 0; i <= obj.divs; i++) {
            const text = (obj.tickLabels || {})['t' + i];
            if (!text) continue;
            const st2 = resolveLabelStyle(obj, 't' + i);
            c2d.fillStyle = st2.color;
            c2d.font = labelFont(st2);
            const tx = x + i * step;
            if (st2.pos === 'up') {          // rotated 90° CCW, above
              c2d.textAlign = 'left';
              c2d.textBaseline = 'middle';
              c2d.save();
              c2d.translate(tx, cy - tickHalf - gap);
              c2d.rotate(-Math.PI / 2);
              c2d.fillText(text, 0, 0);
              c2d.restore();
            } else if (st2.pos === 'above') { // horizontal, centered above
              c2d.textAlign = 'center';
              c2d.textBaseline = 'bottom';
              c2d.fillText(text, tx, cy - tickHalf - gap);
            } else {                          // horizontal, centered below
              c2d.textAlign = 'center';
              c2d.textBaseline = 'top';
              c2d.fillText(text, tx, cy + tickHalf + gap);
            }
          }
          // segment headers: horizontal, centered per part, same baseline
          c2d.textAlign = 'center';
          c2d.textBaseline = 'bottom';
          for (let i = 0; i < obj.divs; i++) {
            const text = (obj.segLabels || {})['s' + i];
            if (!text) continue;
            const st2 = resolveLabelStyle(obj, 's' + i);
            c2d.fillStyle = st2.color;
            c2d.font = labelFont(st2);
            c2d.fillText(text, x + (i + 0.5) * step, cy - tickHalf - LABEL_GAP * t.scaleY);
          }
          c2d.restore();
        },
        // right-click the timeline → the tick editor, one hop away
        menu: [
          {
            label: 'Edit Ticks…',
            action(ctx2) {
              ctx2.closeMenus();
              for (const id of ctx2.selectedIds) {
                const o = ctx2.findObject(id);
                if (o && o.type === 'timeline') { enterTickEdit(o); return; }
              }
            },
          },
        ],
      },
    },

    // ── RAW POINTER ── tick-edit owns clicks while open ────────────────
    pointer: [{
      priority: 240,
      handler(e) {
        if (!tickEdit || e.button !== 0) return false;
        const o = ctx.findObject(tickEdit.objId);
        if (!o || o.type !== 'timeline') { exitTickEdit(); return false; }
        const el = e.target.closest && e.target.closest('.canvas-obj');
        if (el && parseInt(el.dataset.id) === o.id) {
          if (tickEdit.sel.size) { tickEdit.sel = new Set(); ctx.renderObjects(); }
          return true; // the timeline never drags while its ticks are open
        }
        exitTickEdit();
        return true; // the first click out just closes the mode
      },
    }],

    // ── UI ── rail button + canvas menu, beside the Gantt ──────────────
    toolbar: [
      { icon: TML_ICON, title: 'Add Timeline', order: 36, action() { addTimeline(); } },
    ],
    canvasMenu: [
      {
        label: 'Add Timeline',
        icon: TML_ICON_14,
        order: 36,
        action(ctx2) { addTimeline(ctx2.contextWorld.x, ctx2.contextWorld.y); },
      },
    ],
  };
}
