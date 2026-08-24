/* ═══════════════════════════════════════════════════════════════════════
   shapes.polygon.js — REMIX of the Rectangle tool by santibraby

   Illustrator-pen-style polygons: click a series of points; click back
   on the FIRST point to close the shape. The fill is 50% opacity with a
   MULTIPLY blend — overlapping shapes mix like printing inks. Inks:
   salmon, brand peach (orange @25%), pale lime, mint, two greys (bar at
   the bottom while active; right-click a shape for the swatch row).

   Escape (or switching tools) cancels an in-progress path. The tool
   stays active after closing a shape — pen tools should chain.
   Hold SHIFT to lock the next segment to 45° steps (placing points and
   dragging vertices both honor it, like Illustrator's pen).

   IMAGE TEXTURES (1.7.0): right-click a shape → Add Image Texture. The
   picked image fills the polygon and its four corners drag to fit any
   perspective (a real homography — matrix3d on screen, a subdivided
   affine mesh on export, same math both sides). The polygon itself is
   the crop shape. Adding a texture zeroes the ink (pure material);
   click a swatch to multiply a tint back over it. "Multiply onto
   Canvas" (1.8.0) sinks the material into whatever sits beneath —
   place marble over a black-and-white line drawing and the linework
   comes through, exactly like a multiply layer in Photoshop.

   HOLES (1.7.0): right-click → Cut Hole, then click points inside the
   shape and close on the first point — donuts, frames, windows. Fill,
   texture clip, and export all honor holes (even-odd). Double-click
   point editing covers hole vertices too; deleting a hole ring below
   three points removes the hole.

   Object type 'polyshape': { points (relative to the box, at the frozen
   viewW/viewH), holes?: [ring, …] (same space), fillColor, fillOpacity,
   texture?: { src, corners: [tl,tr,br,bl] (same space) } }. Resizing
   scales everything; rotation and export are kernel-standard.
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'shapes.polygon',
  name: 'Polygon',
  version: '1.9.2',
  authors: ['Forma Rosa Creative', 'santibraby'], // append-only ledger
  basedOn: 'shapes',
  description: 'Pen-style polygons with multiply inks, perspective-mapped image textures (drag 4 corners to fit), and donut holes — the polygon is the crop shape.',
};

export function register(ctx) {
  // op = fill opacity (0.5 default). Inks carry ids because hexes can
  // repeat: Orange Solid is the brand orange at FULL strength, still
  // multiplied — a real ink flood. Opacity lives on the OBJECT
  // (fillOpacity), set from the ink at creation / recolor.
  const INKS = [
    { id: 'osolid', name: 'Orange Solid (100%)', hex: '#F05300', op: 1 },
    // the FRC peach scale, vivid → light
    { id: 'o100',   name: 'Orange 100',  hex: '#F05300' },
    { id: 'o75',    name: 'Orange 75',   hex: '#F07A3C' },
    { id: 'o50',    name: 'Orange 50',   hex: '#F0A178' },
    { id: 'p25',    name: 'Peach 25',    hex: '#F0C9B4' },
    // the wash set
    { id: 'salmon', name: 'Salmon',      hex: '#FF9D9D' },
    { id: 'lime',   name: 'Pale Lime',   hex: '#EEF8CD', op: 0.6 },
    { id: 'mint',   name: 'Mint',        hex: '#BBF1D2' },
    { id: 'lgrey',  name: 'Light Grey',  hex: '#CCCCCC' },
    { id: 'dgrey',  name: 'Dark Grey',   hex: '#4A4A4A' },
  ];
  const INK_HEXES = INKS.map(i => i.hex);
  const inkOp = (ink) => (ink && ink.op ? ink.op : 0.5);
  // legacy fallback: objects saved before fillOpacity existed
  const inkOpacityByHex = (hex) => {
    const ink = INKS.find(i => i.hex === hex && !i.op) || INKS.find(i => i.hex === hex);
    return ink && ink.op ? ink.op : 0.5;
  };
  // swatch buttons show each ink as it prints ON WHITE (multiply at its
  // opacity) — a SOLID color, so the dark bar can't muddy it: the solid
  // orange shows full-strength, the washes show as their true tints
  const swatchBg = (ink) => {
    const op = inkOp(ink);
    const n = parseInt(ink.hex.slice(1), 16);
    const mix = (c) => Math.round(c * op + 255 * (1 - op));
    const r = mix((n >> 16) & 255), g = mix((n >> 8) & 255), b = mix(n & 255);
    return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1).toUpperCase();
  };
  const STATE_KEY = 'shapes.polygon.ink';
  const CLOSE_PX = 12;   // screen px within which a click closes the path
  const currentInkDef = () => {
    const v = ctx.state.get(STATE_KEY);
    return INKS.find(i => i.id === v)     // current format: ink id
      || INKS.find(i => i.hex === v)      // legacy format: hex
      || INKS.find(i => i.id === 'p25');
  };

  // ── geometry: rings and the perspective map ─────────────────────────
  // Path data for outer ring + holes (even-odd). sx/sy scale view-space
  // coords into the caller's space (1,1 for the svg's viewBox; w/viewW
  // for the CSS clip-path, which lives in element pixels).
  const r2 = (v) => Math.round(v * 100) / 100;
  function ringsD(obj, sx, sy) {
    const ring = (pts) => pts.length >= 3
      ? 'M' + pts.map(p => `${r2(p.x * sx)} ${r2(p.y * sy)}`).join(' L') + ' Z'
      : '';
    return [ring(obj.points || []), ...((obj.holes || []).map(ring))].filter(Boolean).join(' ');
  }

  // Homography: unit square (0,0)(1,0)(1,1)(0,1) → 4 corners [tl,tr,br,bl].
  // Returns [a,b,c,d,e,f,g,h]: x' = (a·u + b·v + c)/(g·u + h·v + 1),
  // y' = (d·u + e·v + f)/(same). Classic projective quad mapping — the
  // SAME numbers drive the CSS matrix3d and the export mesh, so what you
  // see is what prints.
  function solveHomography(c) {
    const x0 = c[0].x, y0 = c[0].y, x1 = c[1].x, y1 = c[1].y;
    const x2 = c[2].x, y2 = c[2].y, x3 = c[3].x, y3 = c[3].y;
    const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2;
    const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3;
    const den = (dx1 * dy2 - dx2 * dy1) || 1e-12;
    const g = (sx * dy2 - dx2 * sy) / den;
    const h = (dx1 * sy - sx * dy1) / den;
    return [
      x1 - x0 + g * x1,  // a
      x3 - x0 + h * x3,  // b
      x0,                // c
      y1 - y0 + g * y1,  // d
      y3 - y0 + h * y3,  // e
      y0,                // f
      g, h,
    ];
  }
  const applyH = (H, u, v) => {
    const w = H[6] * u + H[7] * v + 1 || 1e-12;
    return { x: (H[0] * u + H[1] * v + H[2]) / w, y: (H[3] * u + H[4] * v + H[5]) / w };
  };

  // The texture <img> is laid out at TEX_BASE×TEX_BASE px; the matrix3d
  // maps that square onto the corner quad (compose H with a 1/B scale).
  const TEX_BASE = 100;
  function matrix3dOf(H) {
    const B = TEX_BASE;
    const m = [
      H[0] / B, H[3] / B, 0, H[6] / B,
      H[1] / B, H[4] / B, 0, H[7] / B,
      0, 0, 1, 0,
      H[2], H[5], 0, 1,
    ];
    // significant digits, not fixed decimals: the perspective terms
    // (g/B, h/B) live around 1e-6 — toFixed would flatten them to zero
    return m.map(v => +v.toPrecision(12)).join(',');
  }

  // EXPORT: canvas 2d has no perspective, so the quad is subdivided into
  // an N×N grid of triangle pairs, each drawn with the affine transform
  // fitting its three corners (destination triangles expand ~2% from
  // their centroid so the seams disappear under each other).
  function drawTexTri(c2d, img, s0, s1, s2, d0, d1, d2) {
    const A1 = s1.x - s0.x, B1 = s1.y - s0.y, A2 = s2.x - s0.x, B2 = s2.y - s0.y;
    const den = A1 * B2 - A2 * B1;
    if (!den) return;
    const X1 = d1.x - d0.x, X2 = d2.x - d0.x, Y1 = d1.y - d0.y, Y2 = d2.y - d0.y;
    const a = (X1 * B2 - X2 * B1) / den;
    const cJ = (X2 * A1 - X1 * A2) / den;
    const b = (Y1 * B2 - Y2 * B1) / den;
    const dJ = (Y2 * A1 - Y1 * A2) / den;
    const e = d0.x - a * s0.x - cJ * s0.y;
    const f = d0.y - b * s0.x - dJ * s0.y;
    const cx = (d0.x + d1.x + d2.x) / 3, cy = (d0.y + d1.y + d2.y) / 3;
    const ex = (p) => ({ x: cx + (p.x - cx) * 1.02, y: cy + (p.y - cy) * 1.02 });
    const e0 = ex(d0), e1 = ex(d1), e2 = ex(d2);
    c2d.save();
    c2d.beginPath();
    c2d.moveTo(e0.x, e0.y); c2d.lineTo(e1.x, e1.y); c2d.lineTo(e2.x, e2.y);
    c2d.closePath();
    c2d.clip();
    c2d.transform(a, b, cJ, dJ, e, f);
    c2d.drawImage(img, 0, 0);
    c2d.restore();
  }
  function drawTextureMesh(c2d, img, quad) {
    const TW = img.naturalWidth, TH = img.naturalHeight;
    if (!TW || !TH) return;
    const H = solveHomography(quad);
    const side = Math.max(
      Math.hypot(quad[1].x - quad[0].x, quad[1].y - quad[0].y),
      Math.hypot(quad[3].x - quad[0].x, quad[3].y - quad[0].y),
      Math.hypot(quad[2].x - quad[1].x, quad[2].y - quad[1].y));
    const N = Math.max(8, Math.min(28, Math.round(side / 90)));
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const u0 = i / N, u1 = (i + 1) / N, v0 = j / N, v1 = (j + 1) / N;
        const d00 = applyH(H, u0, v0), d10 = applyH(H, u1, v0);
        const d11 = applyH(H, u1, v1), d01 = applyH(H, u0, v1);
        const s00 = { x: u0 * TW, y: v0 * TH }, s10 = { x: u1 * TW, y: v0 * TH };
        const s11 = { x: u1 * TW, y: v1 * TH }, s01 = { x: u0 * TW, y: v1 * TH };
        drawTexTri(c2d, img, s00, s10, s11, d00, d10, d11);
        drawTexTri(c2d, img, s00, s11, s01, d00, d11, d01);
      }
    }
  }

  // ── in-progress path overlay (world space, pointer-transparent) ─────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const overlay = document.createElementNS(SVG_NS, 'svg');
  overlay.setAttribute('class', 'polyshape-overlay');
  overlay.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:9998;display:none;';
  const previewPoly = document.createElementNS(SVG_NS, 'polygon');
  const previewLine = document.createElementNS(SVG_NS, 'polyline');
  const firstDot = document.createElementNS(SVG_NS, 'circle');
  overlay.appendChild(previewPoly);
  overlay.appendChild(previewLine);
  overlay.appendChild(firstDot);
  ctx.worldEl.appendChild(overlay);

  let pts = [];          // in-progress points (world coords)
  let cursorPt = null;   // rubber-band end
  let overlayInk = null; // forced preview ink (hole cuts draw Orange 50)

  function paintOverlay() {
    const def = overlayInk || currentInkDef();
    const ink = def.hex;
    const all = cursorPt ? [...pts, cursorPt] : pts;
    previewPoly.setAttribute('points', all.map(p => `${p.x},${p.y}`).join(' '));
    previewPoly.setAttribute('fill', ink);
    previewPoly.setAttribute('fill-opacity', String(inkOp(def) / 2));
    previewPoly.setAttribute('stroke', 'none');
    previewLine.setAttribute('points', all.map(p => `${p.x},${p.y}`).join(' '));
    previewLine.setAttribute('fill', 'none');
    previewLine.setAttribute('stroke', ink);
    previewLine.setAttribute('stroke-width', String(2 / Math.max(0.05, ctx.getZoom())));
    previewLine.setAttribute('stroke-dasharray', '6 4');
    if (pts.length) {
      const near = cursorPt && pts.length >= 3 && distScreen(cursorPt, pts[0]) <= CLOSE_PX;
      firstDot.setAttribute('cx', pts[0].x);
      firstDot.setAttribute('cy', pts[0].y);
      firstDot.setAttribute('r', String((near ? 8 : 5) / Math.max(0.05, ctx.getZoom())));
      firstDot.setAttribute('fill', near ? ink : '#111111');
      firstDot.setAttribute('stroke', ink);
      firstDot.setAttribute('stroke-width', String(2 / Math.max(0.05, ctx.getZoom())));
      firstDot.style.display = 'block';
    } else {
      firstDot.style.display = 'none';
    }
  }

  function distScreen(a, b) {
    const z = ctx.getZoom();
    return Math.hypot(a.x - b.x, a.y - b.y) * z;
  }

  // Shift = angle lock: snap the segment from `from` to the nearest 45°
  // direction, keeping its length (Illustrator pen behavior).
  function constrain45(from, to) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const len = Math.hypot(dx, dy);
    if (!len) return { x: to.x, y: to.y };
    const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
    return { x: from.x + Math.cos(a) * len, y: from.y + Math.sin(a) * len };
  }

  function onMove(ev) {
    let p = ctx.screenToWorld(ev.clientX, ev.clientY);
    if (ev.shiftKey && pts.length) p = constrain45(pts[pts.length - 1], p);
    cursorPt = p;
    paintOverlay();
  }

  function startPath() {
    pts = [];
    cursorPt = null;
    overlay.style.display = 'block';
    document.addEventListener('mousemove', onMove);
    paintOverlay();
  }

  function cancelPath() {
    pts = [];
    cursorPt = null;
    overlay.style.display = 'none';
    document.removeEventListener('mousemove', onMove);
  }

  function closePath() {
    const xs = pts.map(p => p.x), ys = pts.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(10, Math.max(...xs) - minX);
    const h = Math.max(10, Math.max(...ys) - minY);
    ctx.pushUndo();
    const obj = ctx.createObject({
      type: 'polyshape',
      x: minX, y: minY, w, h,
      viewW: w, viewH: h,
      points: pts.map(p => ({ x: p.x - minX, y: p.y - minY })),
      fillColor: currentInkDef().hex,
      fillOpacity: inkOp(currentInkDef()),
    });
    ctx.selectObject(obj.id);
    ctx.renderObjects();
    ctx.markDirty();
    // pen tools chain: stay active, ready for the next shape
    cancelPath();
    startPath();
  }

  // ── ink bar (bottom center while the tool is active) ────────────────
  const bar = document.createElement('div');
  bar.className = 'polyshape-bar';
  bar.innerHTML = INKS.map(i =>
    `<button class="polyshape-swatch" data-ink="${i.id}" title="${i.name}" style="background:${swatchBg(i)}"></button>`).join('');
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('.polyshape-swatch');
    if (!b) return;
    ctx.state.set(STATE_KEY, b.dataset.ink);
    syncBar();
    paintOverlay();
  });
  function syncBar() {
    bar.querySelectorAll('.polyshape-swatch').forEach(b =>
      b.classList.toggle('active', b.dataset.ink === currentInkDef().id));
  }

  // ── shared ring helpers ─────────────────────────────────────────────
  const viewScale = (o) => ({ sx: o.w / (o.viewW || o.w), sy: o.h / (o.viewH || o.h) });
  function ringsWorld(o) {
    const { sx, sy } = viewScale(o);
    const map = (ring) => ring.map(p => ({ x: o.x + p.x * sx, y: o.y + p.y * sy }));
    return [map(o.points), ...((o.holes || []).map(map))];
  }
  function texCornersWorld(o) {
    const { sx, sy } = viewScale(o);
    return o.texture.corners.map(c => ({ x: o.x + c.x * sx, y: o.y + c.y * sy }));
  }
  // After structural edits the box hugs the OUTER ring again; holes and
  // texture corners re-express in the fresh view space so nothing moves.
  function renormRings(o, ringsW) {
    const texW = (o.texture && o.texture.corners) ? texCornersWorld(o) : null;
    const outer = ringsW[0];
    const xs = outer.map(p => p.x), ys = outer.map(p => p.y);
    const minX = Math.min(...xs), minY = Math.min(...ys);
    const w = Math.max(10, Math.max(...xs) - minX);
    const h = Math.max(10, Math.max(...ys) - minY);
    o.x = minX; o.y = minY; o.w = w; o.h = h;
    o.viewW = w; o.viewH = h;
    const toView = (p) => ({ x: p.x - minX, y: p.y - minY });
    o.points = outer.map(toView);
    const holes = ringsW.slice(1).map(r => r.map(toView));
    if (holes.length) o.holes = holes; else delete o.holes;
    if (texW) o.texture = { ...o.texture, corners: texW.map(toView) };
  }
  // FAST PATH shared by the drag loops: rewrite only this shape's path
  // (and its texture clip) instead of a full renderObjects() per frame.
  function paintDragShape(o) {
    const host = ctx.getObjectElement
      ? ctx.getObjectElement(o.id)
      : ctx.worldEl.querySelector(`.canvas-obj[data-id="${o.id}"]`);
    if (!host) { ctx.renderObjects(); return; }
    const pathEl = host.querySelector('svg path');
    if (pathEl) pathEl.setAttribute('d', ringsD(o, 1, 1));
    const clipEl = host.querySelector('.pstex-clip');
    if (clipEl) {
      const { sx, sy } = viewScale(o);
      clipEl.style.clipPath = `path(evenodd, '${ringsD(o, sx, sy)}')`;
    }
  }

  // ── POINT-EDIT MODE (double-click a polygon) ────────────────────────
  // Dots for every vertex — outer ring AND hole rings. Click a dot to
  // select (click again to deselect; clicks are additive). Drag moves
  // every selected dot. Delete removes selected dots (outer keeps a
  // floor of 3; a hole ring falling below 3 is removed whole). With
  // nothing selected, 'x' toggles add-mode: click any edge — outer or
  // hole — to insert a dot there. Escape or clicking off the shape exits.
  let edit = null; // { objId, sel:Set('r:i'), addMode }

  const editOverlay = document.createElementNS(SVG_NS, 'svg');
  editOverlay.setAttribute('class', 'polyshape-edit-overlay');
  editOverlay.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:9999;display:none;';
  ctx.worldEl.appendChild(editOverlay);

  function editObj() {
    if (!edit) return null;
    const o = ctx.findObject(edit.objId);
    if (!o || o.type !== 'polyshape') { exitEdit(); return null; }
    return o;
  }
  const rk = (r, i) => `${r}:${i}`;

  function paintEdit() {
    const o = editObj();
    if (!o) return;
    const z = Math.max(0.05, ctx.getZoom());
    const rings = ringsWorld(o);
    const ink = o.fillColor || '#F0C9B4';
    let svg = '';
    rings.forEach((ring, r) => {
      svg += `<polyline points="${[...ring, ring[0]].map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="${ink}" stroke-width="${1.5 / z}" stroke-dasharray="4 3"/>`;
      ring.forEach((p, i) => {
        const seld = edit.sel.has(rk(r, i));
        svg += `<circle cx="${p.x}" cy="${p.y}" r="${(seld ? 7 : 5) / z}" fill="${seld ? ink : '#111111'}" stroke="${seld ? '#F0F0F0' : ink}" stroke-width="${2 / z}"/>`;
      });
    });
    editOverlay.innerHTML = svg;
  }

  function setAddCursor(on) {
    ctx.viewportEl.style.cursor = on ? 'copy' : '';
  }

  function enterEdit(obj) {
    exitTexEdit();
    endHoleDraw();
    if (ctx.getActiveTool() === 'shapes.polygon') ctx.setTool(null);
    ctx.clearSelection();
    ctx.updateSelectionVisuals();
    edit = { objId: obj.id, sel: new Set(), addMode: false };
    editOverlay.style.display = 'block';
    document.addEventListener('keydown', onEditKey, true);
    document.addEventListener('wheel', paintEdit, { passive: true });
    paintEdit();
    ctx.showToast('Editing points — click dots to select · Delete removes · X adds on an edge · Esc done');
  }

  function exitEdit() {
    if (!edit) return;
    edit = null;
    editOverlay.style.display = 'none';
    editOverlay.innerHTML = '';
    setAddCursor(false);
    document.removeEventListener('keydown', onEditKey, true);
    document.removeEventListener('wheel', paintEdit);
  }

  function onEditKey(e) {
    if (!edit) return;
    const o = editObj();
    if (!o) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      exitEdit();
      return;
    }
    if ((e.key === 'Delete' || e.key === 'Backspace')) {
      e.preventDefault(); e.stopPropagation(); // never delete the OBJECT from edit mode
      if (edit.sel.size === 0) return;
      const rings = ringsWorld(o);
      const byRing = rings.map(() => new Set());
      for (const key of edit.sel) {
        const [r, i] = key.split(':').map(Number);
        if (byRing[r]) byRing[r].add(i);
      }
      if (rings[0].length - byRing[0].size < 3) {
        ctx.showToast('A polygon needs at least 3 points');
        return;
      }
      ctx.pushUndo();
      let droppedHoles = 0;
      const next = [];
      rings.forEach((ring, r) => {
        const kept = ring.filter((_, i) => !byRing[r].has(i));
        if (r === 0) { next.push(kept); return; }
        if (kept.length >= 3) next.push(kept);
        else droppedHoles++;                    // a hole can't survive on 2 points
      });
      renormRings(o, next);
      edit.sel.clear();
      ctx.renderObjects();
      ctx.markDirty();
      paintEdit();
      if (droppedHoles) ctx.showToast(`Removed ${droppedHoles} hole${droppedHoles === 1 ? '' : 's'}`);
      return;
    }
    if ((e.key === 'x' || e.key === 'X') && edit.sel.size === 0) {
      e.preventDefault(); e.stopPropagation();
      edit.addMode = !edit.addMode;
      setAddCursor(edit.addMode);
      ctx.showToast(edit.addMode ? 'Add mode — click an edge to insert a point' : 'Add mode off');
    }
  }

  // distance from point P to segment AB (screen px) + projection point
  function segHit(P, A, B) {
    const abx = B.x - A.x, aby = B.y - A.y;
    const len2 = abx * abx + aby * aby || 1;
    let t = ((P.x - A.x) * abx + (P.y - A.y) * aby) / len2;
    t = Math.max(0, Math.min(1, t));
    const proj = { x: A.x + t * abx, y: A.y + t * aby };
    return { dist: Math.hypot(P.x - proj.x, P.y - proj.y) * ctx.getZoom(), proj };
  }

  function onEditPointerDown(e) {
    if (!edit) return false;
    const o = editObj();
    if (!o) return false;
    const P = ctx.screenToWorld(e.clientX, e.clientY);
    const rings = ringsWorld(o);

    // 1. dot hit? (any ring)
    let hitR = -1, hitI = -1, best = 9;
    rings.forEach((ring, r) => ring.forEach((p, i) => {
      const d = Math.hypot(P.x - p.x, P.y - p.y) * ctx.getZoom();
      if (d <= 9 && d < best) { best = d; hitR = r; hitI = i; }
    }));
    if (hitR >= 0) {
      e.preventDefault();
      const key = rk(hitR, hitI);
      const wasSelected = edit.sel.has(key);
      if (!wasSelected) edit.sel.add(key);
      paintEdit();
      // drag all selected dots together; a still click toggles instead
      const startX = e.clientX, startY = e.clientY;
      const orig = ringsWorld(o);
      let dragging = false, pushed = false;
      const onMoveDrag = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 3) return;
        dragging = true;
        if (!pushed) { ctx.pushUndo(); pushed = true; }
        const now = ctx.screenToWorld(ev.clientX, ev.clientY);
        let dx = now.x - P.x, dy = now.y - P.y;
        // Shift = the drag itself locks to 45° steps
        if (ev.shiftKey) { const c = constrain45({ x: 0, y: 0 }, { x: dx, y: dy }); dx = c.x; dy = c.y; }
        const moved = orig.map((ring, r) => ring.map((p, i) =>
          edit.sel.has(rk(r, i)) ? { x: p.x + dx, y: p.y + dy } : p));
        const { sx, sy } = viewScale(o);
        const toV = (p) => ({ x: (p.x - o.x) / sx, y: (p.y - o.y) / sy });
        o.points = moved[0].map(toV);
        if (moved.length > 1) o.holes = moved.slice(1).map(r => r.map(toV));
        paintDragShape(o);
        paintEdit();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMoveDrag);
        document.removeEventListener('mouseup', onUp);
        if (dragging) {
          renormRings(o, ringsWorld(o));
          ctx.renderObjects();
          ctx.markDirty();
          paintEdit();
        } else if (wasSelected) {
          edit.sel.delete(key); // still click on a selected dot deselects
          paintEdit();
        }
      };
      document.addEventListener('mousemove', onMoveDrag);
      document.addEventListener('mouseup', onUp);
      return true;
    }

    // 2. add-mode: click an edge (outer or hole) → insert a point there
    if (edit.addMode) {
      let bestR = -1, bestSeg = -1, bestDist = 9, bestProj = null;
      rings.forEach((ring, r) => {
        for (let i = 0; i < ring.length; i++) {
          const res = segHit(P, ring[i], ring[(i + 1) % ring.length]);
          if (res.dist <= bestDist) { bestDist = res.dist; bestR = r; bestSeg = i; bestProj = res.proj; }
        }
      });
      if (bestR >= 0) {
        e.preventDefault();
        ctx.pushUndo();
        const next = rings.map((ring, r) => r === bestR
          ? [...ring.slice(0, bestSeg + 1), bestProj, ...ring.slice(bestSeg + 1)]
          : ring);
        renormRings(o, next);
        ctx.renderObjects();
        ctx.markDirty();
        paintEdit();
        return true;
      }
      return true; // add-mode clicks never fall through
    }

    // 3. off the shape (with margin) → done editing; inside → swallow
    const pad = 20 / Math.max(0.05, ctx.getZoom());
    const inside = P.x >= o.x - pad && P.x <= o.x + o.w + pad &&
                   P.y >= o.y - pad && P.y <= o.y + o.h + pad;
    if (!inside) { exitEdit(); return true; }
    return true;
  }

  // ── TEXTURE CORNER-EDIT MODE ("Edit Texture Corners") ───────────────
  // Four square handles on the texture's corner quad. Drag a corner and
  // the image re-maps live — this is how a marble slab lies down into a
  // photo's perspective. Escape or clicking well off the shape exits.
  let texEdit = null; // { objId }

  const texOverlay = document.createElementNS(SVG_NS, 'svg');
  texOverlay.setAttribute('class', 'polyshape-tex-overlay');
  texOverlay.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:9999;display:none;';
  ctx.worldEl.appendChild(texOverlay);

  function texObj() {
    if (!texEdit) return null;
    const o = ctx.findObject(texEdit.objId);
    if (!o || o.type !== 'polyshape' || !o.texture) { exitTexEdit(); return null; }
    return o;
  }

  function paintTexEdit() {
    const o = texObj();
    if (!o) return;
    const z = Math.max(0.05, ctx.getZoom());
    const c = texCornersWorld(o);
    const ink = o.fillColor || '#F0C9B4';
    const s = 6 / z;
    let svg = `<polygon points="${c.map(p => `${p.x},${p.y}`).join(' ')}" fill="none" stroke="#F0F0F0" stroke-width="${1.5 / z}" stroke-dasharray="5 4"/>`;
    c.forEach((p) => {
      svg += `<rect x="${p.x - s}" y="${p.y - s}" width="${s * 2}" height="${s * 2}" fill="#111111" stroke="#F0F0F0" stroke-width="${2 / z}"/>`;
    });
    svg += `<circle cx="${c[0].x}" cy="${c[0].y}" r="${2.5 / z}" fill="${ink}"/>`; // tl marker: know which corner is which
    texOverlay.innerHTML = svg;
  }

  function enterTexEdit(obj) {
    exitEdit();
    endHoleDraw();
    if (ctx.getActiveTool() === 'shapes.polygon') ctx.setTool(null);
    ctx.clearSelection();
    ctx.updateSelectionVisuals();
    texEdit = { objId: obj.id };
    texOverlay.style.display = 'block';
    ctx.viewportEl.style.cursor = 'move';
    document.addEventListener('keydown', onTexKey, true);
    document.addEventListener('wheel', paintTexEdit, { passive: true });
    paintTexEdit();
    ctx.showToast('Texture — drag slides · a corner scales · Ctrl+drag stretches the perspective · Esc done');
  }

  function exitTexEdit() {
    if (!texEdit) return;
    texEdit = null;
    texOverlay.style.display = 'none';
    texOverlay.innerHTML = '';
    ctx.viewportEl.style.cursor = '';
    document.removeEventListener('keydown', onTexKey, true);
    document.removeEventListener('wheel', paintTexEdit);
  }

  function onTexKey(e) {
    if (!texEdit) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      exitTexEdit();
    }
  }

  // Drives like an image: drag anywhere on the shape to SLIDE the whole
  // texture under the polygon window; grab a CORNER handle to SCALE the
  // image uniformly about the opposite corner (exactly how any image
  // resizes); Ctrl (or Cmd) + drag grabs the NEAREST corner and
  // stretches the PERSPECTIVE — no precision required with Ctrl held.
  function onTexPointerDown(e) {
    if (!texEdit) return false;
    const o = texObj();
    if (!o) return false;
    if (e.button !== 0) return false;
    const P = ctx.screenToWorld(e.clientX, e.clientY);
    const corners = texCornersWorld(o);

    // nearest corner: Ctrl/Cmd grabs it from anywhere (stretch); a plain
    // click only when landing right on the handle (scale)
    let hit = 0, best = Infinity;
    corners.forEach((p, i) => {
      const d = Math.hypot(P.x - p.x, P.y - p.y) * ctx.getZoom();
      if (d < best) { best = d; hit = i; }
    });
    const mode = (e.ctrlKey || e.metaKey) ? 'stretch' : (best <= 12 ? 'scale' : 'slide');

    if (mode === 'slide') {
      // off the shape AND off the quad → done; inside → slide
      const xs = corners.map(p => p.x), ys = corners.map(p => p.y);
      const pad = 20 / Math.max(0.05, ctx.getZoom());
      const inside = P.x >= Math.min(...xs, o.x) - pad && P.x <= Math.max(...xs, o.x + o.w) + pad &&
                     P.y >= Math.min(...ys, o.y) - pad && P.y <= Math.max(...ys, o.y + o.h) + pad;
      if (!inside) { exitTexEdit(); return true; }
    }

    e.preventDefault();
    let pushed = false;
    const { sx, sy } = viewScale(o);
    const startCorners = o.texture.corners.map(c => ({ x: c.x, y: c.y }));
    // scale mode anchors at the OPPOSITE corner, like any image resize
    const anchorIdx = (hit + 2) % 4;
    const anchorW = corners[anchorIdx];
    const d0 = Math.max(1e-6, Math.hypot(P.x - anchorW.x, P.y - anchorW.y));
    const onMoveDrag = (ev) => {
      if (!pushed) { ctx.pushUndo(); pushed = true; }
      const now = ctx.screenToWorld(ev.clientX, ev.clientY);
      let next;
      if (mode === 'stretch') {
        next = startCorners.map((c, i) => i === hit
          ? { x: (now.x - o.x) / sx, y: (now.y - o.y) / sy }
          : c);
      } else if (mode === 'scale') {
        const s = Math.max(0.05, Math.hypot(now.x - anchorW.x, now.y - anchorW.y) / d0);
        const a = startCorners[anchorIdx];
        next = startCorners.map(c => ({ x: a.x + (c.x - a.x) * s, y: a.y + (c.y - a.y) * s }));
      } else {
        const dvx = (now.x - P.x) / sx, dvy = (now.y - P.y) / sy;
        next = startCorners.map(c => ({ x: c.x + dvx, y: c.y + dvy }));
      }
      o.texture = { ...o.texture, corners: next };
      // live re-map without a full render
      const host = ctx.getObjectElement
        ? ctx.getObjectElement(o.id)
        : ctx.worldEl.querySelector(`.canvas-obj[data-id="${o.id}"]`);
      const img = host && host.querySelector('.pstex-img');
      if (img) {
        const px = next.map(c => ({ x: c.x * sx, y: c.y * sy }));
        img.style.transform = `matrix3d(${matrix3dOf(solveHomography(px))})`;
      }
      paintTexEdit();
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMoveDrag);
      document.removeEventListener('mouseup', onUp);
      if (pushed) { ctx.renderObjects(); ctx.markDirty(); }
      paintTexEdit();
    };
    document.addEventListener('mousemove', onMoveDrag);
    document.addEventListener('mouseup', onUp);
    return true;
  }

  // ── HOLE-DRAW MODE ("Cut Hole") ─────────────────────────────────────
  // The pen flow, aimed at an existing shape: click points, close on the
  // first one, and the ring becomes a hole (even-odd). Escape cancels.
  let holeDraw = null; // { objId }

  function startHoleDraw(obj) {
    exitEdit();
    exitTexEdit();
    if (ctx.getActiveTool()) ctx.setTool(null);
    holeDraw = { objId: obj.id };
    overlayInk = INKS.find(i => i.id === 'o50'); // cut preview always reads: Orange 50 over any fill
    startPath();
    document.addEventListener('keydown', onHoleKey, true);
    ctx.renderObjects(); // repaint: the host shape ghosts to the Orange 50 wash
    ctx.showToast('Cutting a hole — the shape ghosts so you can see beneath · close on the first point · Esc cancels');
  }

  function endHoleDraw() {
    if (!holeDraw) return;
    holeDraw = null;
    overlayInk = null;
    cancelPath();
    document.removeEventListener('keydown', onHoleKey, true);
    ctx.renderObjects(); // un-ghost the host shape
  }

  function onHoleKey(e) {
    if (!holeDraw) return;
    if (e.key === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      endHoleDraw();
    }
  }

  // ── texture fade (live slider in the shape's right-click menu) ──────
  // Bipolar, same grammar as the images tool's Fade: 50 = off, toward
  // 100 washes toward white (softer material, lower contrast), toward 0
  // sinks toward black. Undo coalesces per drag.
  let texFadeUndoTimer = null;
  const fmtFade = (v) => v === 50 ? 'off' : (v < 50 ? `black ${(50 - v) * 2}%` : `white ${(v - 50) * 2}%`);
  function setTexFade(o, v) {
    if (!texFadeUndoTimer) ctx.pushUndo();
    clearTimeout(texFadeUndoTimer);
    texFadeUndoTimer = setTimeout(() => { texFadeUndoTimer = null; }, 600);
    o.texture = { ...o.texture, fade: v };
    ctx.markDirty();
    // live veil without a full render per slider tick
    const host = ctx.getObjectElement
      ? ctx.getObjectElement(o.id)
      : ctx.worldEl.querySelector(`.canvas-obj[data-id="${o.id}"]`);
    const clip = host && host.querySelector('.pstex-clip');
    if (!clip) { ctx.renderObjects(); return; }
    let veil = clip.querySelector('.pstex-veil');
    if (v === 50) { if (veil) veil.remove(); return; }
    if (!veil) {
      veil = document.createElement('div');
      veil.className = 'pstex-veil';
      clip.appendChild(veil);
    }
    veil.style.background = v < 50 ? '#000000' : '#ffffff';
    veil.style.opacity = String(Math.abs(v - 50) / 50);
  }

  function onHolePointerDown(e) {
    if (!holeDraw) return false;
    const o = ctx.findObject(holeDraw.objId);
    if (!o || o.type !== 'polyshape') { endHoleDraw(); return false; }
    if (e.button !== 0) return false;
    e.preventDefault();
    let p = ctx.screenToWorld(e.clientX, e.clientY);
    if (e.shiftKey && pts.length) p = constrain45(pts[pts.length - 1], p);
    if (pts.length >= 3 && distScreen(p, pts[0]) <= CLOSE_PX) {
      ctx.pushUndo();
      const { sx, sy } = viewScale(o);
      const ring = pts.map(q => ({ x: (q.x - o.x) / sx, y: (q.y - o.y) / sy }));
      o.holes = [...(o.holes || []), ring];
      endHoleDraw();
      ctx.renderObjects();
      ctx.markDirty();
      ctx.showToast('Hole cut — double-click the shape to edit its points');
    } else {
      pts.push(p);
      paintOverlay();
    }
    return true;
  }

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      /* The blend must sit on the OBJECT element: every .canvas-obj is
         its own stacking context (z-indexed), so a blend on the inner
         svg would only see its own transparent box — never the images
         beneath. On the element, the backdrop is the real canvas. */
      .canvas-obj.polyshape-obj {
        mix-blend-mode: multiply; /* black under ink stays 100% black */
      }
      /* While selected, blend off so the peach outline reads true —
         deselect and the ink sinks back into the image */
      .canvas-obj.polyshape-obj.selected {
        mix-blend-mode: normal;
      }
      /* A TEXTURED shape is material, not ink: the element stops
         multiplying into the canvas. The ink svg instead multiplies
         INSIDE the element — pick a swatch and it tints the texture. */
      .canvas-obj.polyshape-obj.pstex-solid,
      .canvas-obj.polyshape-obj.pstex-solid.selected { mix-blend-mode: normal; }
      .canvas-obj.polyshape-obj.pstex-solid svg { mix-blend-mode: multiply; }
      /* Multiplied material: the ELEMENT keeps its native multiply (the
         drawing beneath comes through the marble; selected still reverts
         so the outline reads), and the ink svg multiplies INSIDE first —
         (ink × texture) × canvas, exactly what the export composites. */
      .canvas-obj.polyshape-obj.pstex-mult svg { mix-blend-mode: multiply; }
      /* Hit area = the actual polygon, not the bounding box: the element
         and svg are click-transparent; only the painted fill catches the
         mouse (SVG hit-testing follows the shape). Clicks in the empty
         corners of the box pass through to objects beneath. */
      .canvas-obj.polyshape-obj { pointer-events: none; }
      .canvas-obj.polyshape-obj svg {
        display: block;
        width: 100%; height: 100%;
        overflow: visible;
        pointer-events: none;
      }
      .canvas-obj.polyshape-obj svg polygon,
      .canvas-obj.polyshape-obj svg path { pointer-events: visiblePainted; }
      /* the kernel's corner handles sit at the box corners — keep them live */
      .canvas-obj.polyshape-obj .resize-handle { pointer-events: auto; }
      /* texture layer: clipped to the polygon (holes included) by a CSS
         path(evenodd); the img is a TEX_BASE square that the matrix3d
         throws into perspective */
      .canvas-obj.polyshape-obj .pstex-clip {
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: none;
      }
      .canvas-obj.polyshape-obj .pstex-img {
        width: 100px; height: 100px;
        max-width: none; max-height: none;
        transform-origin: 0 0;
        will-change: transform;
      }
      /* fade veil: a black/white wash over the texture (clipped with it) */
      .canvas-obj.polyshape-obj .pstex-veil {
        position: absolute; left: 0; top: 0; width: 100%; height: 100%;
        pointer-events: none;
      }
      .polyshape-fade { padding: 6px 14px 8px; width: 208px; cursor: default; font-family: var(--font-sans); }
      .polyshape-fade .pf-head { display: flex; justify-content: space-between; font-size: 12px; color: #bbb; margin-bottom: 5px; }
      .polyshape-fade .pf-val { color: #F0C4A0; font-variant-numeric: tabular-nums; }
      .polyshape-fade input[type=range] {
        width: 100%; height: 4px; -webkit-appearance: none; appearance: none;
        background: #444; border-radius: 2px; outline: none; cursor: pointer; accent-color: #F0C4A0;
      }
      .polyshape-fade input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%;
        background: #F0C4A0; cursor: pointer; border: none;
      }
      .polyshape-bar {
        display: flex; gap: 8px; align-items: center;
        background: #171614; border: 1px solid #29251f; border-radius: 8px;
        padding: 8px 10px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.5);
      }
      .polyshape-swatch {
        width: 26px; height: 26px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .polyshape-swatch:hover { transform: scale(1.12); }
      .polyshape-swatch.active { border-color: #F0F0F0; }
      .polyshape-menu-swatches {
        display: flex; gap: 6px; align-items: center;
        padding: 8px 14px;
      }
      .polyshape-menu-swatch {
        width: 20px; height: 20px; border: 2px solid transparent; border-radius: 4px;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .polyshape-menu-swatch:hover { transform: scale(1.15); }
      .polyshape-menu-swatch.active { border-color: #F0F0F0; }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      polyshape: {
        defaults: { points: [], viewW: 0, viewH: 0, fillColor: '#F0C9B4', fillOpacity: 0.5 },
        normalize(obj) {
          const fin = (p) => p && isFinite(p.x) && isFinite(p.y);
          const cp = (p) => ({ x: p.x, y: p.y });
          // Deep-rebuild every array: the kernel's clone shares references
          // until normalize (which runs BEFORE onDuplicate) replaces them.
          obj.points = Array.isArray(obj.points) ? obj.points.filter(fin).map(cp) : [];
          const holes = Array.isArray(obj.holes)
            ? obj.holes
              .map(r => (Array.isArray(r) ? r.filter(fin).map(cp) : null))
              .filter(r => r && r.length >= 3)
            : [];
          if (holes.length) obj.holes = holes; else delete obj.holes;
          const t = obj.texture;
          if (t && typeof t.src === 'string' && t.src &&
              Array.isArray(t.corners) && t.corners.length === 4 && t.corners.every(fin)) {
            obj.texture = {
              src: t.src,
              corners: t.corners.map(cp),
              // 'multiply' sinks the material into whatever's beneath —
              // black linework comes through marble; 'normal' is opaque
              blend: t.blend === 'multiply' ? 'multiply' : 'normal',
              // bipolar like the images Fade: 50 = off, toward 100 washes
              // the material toward white (softer, lower contrast),
              // toward 0 sinks it toward black
              fade: isFinite(+t.fade) ? Math.max(0, Math.min(100, Math.round(+t.fade))) : 50,
            };
          } else {
            delete obj.texture;
          }
          if (!INK_HEXES.includes(obj.fillColor)) obj.fillColor = '#F0C9B4';
          // legacy shapes (pre-fillOpacity) adopt their ink's strength
          if (!isFinite(obj.fillOpacity)) obj.fillOpacity = inkOpacityByHex(obj.fillColor);
          // a textured shape may run its ink to ZERO (pure material);
          // a plain shape keeps the 0.05 floor so it can't go invisible
          obj.fillOpacity = Math.max(obj.texture ? 0 : 0.05, Math.min(1, obj.fillOpacity));
          if (!isFinite(obj.viewW) || obj.viewW <= 0) obj.viewW = obj.w;
          if (!isFinite(obj.viewH) || obj.viewH <= 0) obj.viewH = obj.h;
        },
        render(obj, el) {
          el.classList.add('polyshape-obj');
          // While a hole is being cut in THIS shape, it GHOSTS: the
          // texture drops out and the fill becomes an Orange 50 multiply
          // wash — you can see the drawing beneath to trace the cut.
          const cutting = !!(holeDraw && holeDraw.objId === obj.id);
          const tex = (!cutting && obj.texture && obj.texture.src) ? obj.texture : null;
          const mult = !!tex && tex.blend === 'multiply';
          // solid material lifts the element out of the ink blend;
          // multiplied material rides the element's native multiply, so
          // the drawing beneath comes through the texture
          el.classList.toggle('pstex-solid', !!tex && !mult);
          el.classList.toggle('pstex-mult', mult);
          let html = '';
          if (tex) {
            const { sx, sy } = viewScale(obj);
            const dPx = ringsD(obj, sx, sy);
            const px = tex.corners.map(c => ({ x: c.x * sx, y: c.y * sy }));
            const m = matrix3dOf(solveHomography(px));
            const fv = isFinite(+tex.fade) ? +tex.fade : 50;
            const veil = fv !== 50
              ? `<div class="pstex-veil" style="background:${fv < 50 ? '#000000' : '#ffffff'};opacity:${(Math.abs(fv - 50) / 50).toFixed(4)}"></div>`
              : '';
            html += `<div class="pstex-clip" style="clip-path: path(evenodd, '${dPx}')">` +
              `<img class="pstex-img" draggable="false" src="${ctx.io.assetUrl(tex.src)}" style="transform: matrix3d(${m})">${veil}</div>`;
          }
          const fillColor = cutting ? '#F0A178' : obj.fillColor;
          const fillOp = cutting ? 0.5 : obj.fillOpacity;
          html += `<svg viewBox="0 0 ${obj.viewW} ${obj.viewH}" preserveAspectRatio="none">` +
            `<path d="${ringsD(obj, 1, 1)}" fill-rule="evenodd" fill="${fillColor}" fill-opacity="${fillOp}"/></svg>`;
          el.innerHTML = html;
        },
        exportDraw(c2d, obj, t) {
          if (obj.points.length < 3) return;
          const sx = (obj.w / obj.viewW) * t.scaleX;
          const sy = (obj.h / obj.viewH) * t.scaleY;
          const trace = () => {
            const ring = (rp) => {
              rp.forEach((p, i) => {
                const x = t.x + p.x * sx, y = t.y + p.y * sy;
                if (i === 0) c2d.moveTo(x, y); else c2d.lineTo(x, y);
              });
              c2d.closePath();
            };
            ring(obj.points);
            for (const hr of (obj.holes || [])) if (hr.length >= 3) ring(hr);
          };
          // texture first, clipped to the shape + holes
          if (obj.texture && obj.texture.src) {
            const host = ctx.getObjectElement
              ? ctx.getObjectElement(obj.id)
              : ctx.worldEl.querySelector(`.canvas-obj[data-id="${obj.id}"]`);
            const img = host && host.querySelector('.pstex-img');
            if (img && img.complete && img.naturalWidth) {
              // Warp into an OFFSCREEN first: the mesh triangles overlap
              // ~2% to hide seams, and composited directly with multiply
              // those overlaps would double-darken into visible ribs.
              // The finished warp then lays onto the canvas in ONE pass —
              // source-over for solid material, multiply so a line
              // drawing beneath comes through the marble.
              const ringPts = [obj.points, ...(obj.holes || [])].flat();
              const xs2 = ringPts.map(p => t.x + p.x * sx);
              const ys2 = ringPts.map(p => t.y + p.y * sy);
              const bx = Math.floor(Math.min(...xs2)) - 2;
              const by = Math.floor(Math.min(...ys2)) - 2;
              const bw = Math.ceil(Math.max(...xs2)) + 2 - bx;
              const bh = Math.ceil(Math.max(...ys2)) + 2 - by;
              if (bw > 0 && bh > 0) {
                const off = document.createElement('canvas');
                off.width = bw; off.height = bh;
                const og = off.getContext('2d');
                if (!og) return;
                drawTextureMesh(og, img,
                  obj.texture.corners.map(c => ({ x: t.x + c.x * sx - bx, y: t.y + c.y * sy - by })));
                // fade veil, clipped to the warped pixels (same curve as
                // the display's overlay and the images tool's Fade)
                const fv = isFinite(+obj.texture.fade) ? +obj.texture.fade : 50;
                if (fv !== 50) {
                  const op = (Math.abs(fv - 50) / 50).toFixed(4);
                  og.globalCompositeOperation = 'source-atop';
                  og.fillStyle = fv < 50 ? `rgba(0,0,0,${op})` : `rgba(255,255,255,${op})`;
                  og.fillRect(0, 0, bw, bh);
                  og.globalCompositeOperation = 'source-over';
                }
                c2d.save();
                c2d.beginPath();
                trace();
                c2d.clip('evenodd');
                if (obj.texture.blend === 'multiply') c2d.globalCompositeOperation = 'multiply';
                c2d.drawImage(off, bx, by);
                c2d.restore();
              }
            }
          }
          // ink on top: multiply at its opacity — over canvas for plain
          // shapes, over the texture as a tint for material ones
          if (obj.fillOpacity > 0) {
            c2d.save();
            c2d.globalCompositeOperation = 'multiply';
            c2d.globalAlpha = obj.fillOpacity;
            c2d.fillStyle = obj.fillColor;
            c2d.beginPath();
            trace();
            c2d.fill('evenodd');
            c2d.restore();
          }
        },
        // Cross-project paste: localize the texture asset into this project
        async onPaste(obj) {
          if (!obj.texture || !obj.texture.src) return;
          try {
            const res = await ctx.io.importExternalAsset(obj.texture.src, ctx.pasteSourceProject);
            if (res && res.path) obj.texture = { ...obj.texture, src: res.path };
          } catch (_) { /* keep original path; absolute paths still resolve */ }
        },
        // Double-click → point-edit mode
        onDoubleClick(obj) { enterEdit(obj); return true; },
        // Right-click a shape → swatch row (live) + texture and hole ops
        menu: (selObjs) => {
          const cur = selObjs.length === 1 ? selObjs[0] : null;
          const isCur = (i) => cur && cur.fillColor === i.hex && Math.abs((cur.fillOpacity || 0.5) - inkOp(i)) < 0.01;
          const items = [{
            html: '<div class="polyshape-menu-swatches">' + INKS.map(i =>
              `<button class="polyshape-menu-swatch${isCur(i) ? ' active' : ''}" data-ink="${i.id}" title="${i.name}" style="background:${swatchBg(i)}"></button>`
            ).join('') + '</div>',
            onClick(e, ctx2) {
              const b = e.target.closest('.polyshape-menu-swatch');
              if (!b) return;
              const ink = INKS.find(i => i.id === b.dataset.ink);
              if (!ink) return;
              ctx2.pushUndo();
              for (const o of selObjs) if (o.type === 'polyshape') {
                o.fillColor = ink.hex;
                o.fillOpacity = inkOp(ink);
              }
              ctx2.renderObjects();
              ctx2.markDirty();
              b.parentElement.querySelectorAll('.polyshape-menu-swatch').forEach(s =>
                s.classList.toggle('active', s === b));
            },
          }];
          if (!cur) return items;
          const TEX_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
          items.push({ divider: true });
          items.push({
            label: cur.texture ? 'Replace Image Texture' : 'Add Image Texture',
            icon: TEX_ICON,
            async action(ctx2) {
              ctx2.closeMenus();
              const results = await ctx2.io.importImages({ hiRes: false });
              if (!results || !results[0] || results[0].error || !results[0].assetPath) return;
              ctx2.pushUndo();
              const had = !!cur.texture;
              cur.texture = {
                src: results[0].assetPath,
                corners: had ? cur.texture.corners.map(c => ({ x: c.x, y: c.y })) : [
                  { x: 0, y: 0 }, { x: cur.viewW, y: 0 },
                  { x: cur.viewW, y: cur.viewH }, { x: 0, y: cur.viewH },
                ],
              };
              if (!had) cur.fillOpacity = 0; // material replaces ink; a swatch brings the tint back
              ctx2.renderObjects();
              ctx2.markDirty();
              enterTexEdit(cur); // set the perspective right away
            },
          });
          if (cur.texture) {
            items.push({
              label: 'Edit Texture Corners',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6l4-2 12 3-2 13-4 2L4 19z" stroke-dasharray="4 3"/><rect x="2" y="4" width="4" height="4"/><rect x="18" y="5" width="4" height="4"/><rect x="16" y="18" width="4" height="4"/><rect x="2" y="17" width="4" height="4"/></svg>',
              action(ctx2) { ctx2.closeMenus(); enterTexEdit(cur); },
            });
            const fv = isFinite(+cur.texture.fade) ? +cur.texture.fade : 50;
            items.push({
              html:
                `<div class="polyshape-fade">` +
                `<div class="pf-head"><span>Texture Fade</span><span class="pf-val">${fmtFade(fv)}</span></div>` +
                `<input type="range" min="0" max="100" step="1" value="${fv}">` +
                `</div>`,
              onMount(el) {
                const inp = el.querySelector('input');
                const val = el.querySelector('.pf-val');
                inp.addEventListener('input', () => {
                  const v = +inp.value;
                  val.textContent = fmtFade(v);
                  setTexFade(cur, v);
                });
              },
            });
            items.push({
              label: 'Multiply onto Canvas',
              checked: cur.texture.blend === 'multiply',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="12" r="6"/><circle cx="15" cy="12" r="6"/></svg>',
              action(ctx2) {
                ctx2.closeMenus(); ctx2.pushUndo();
                cur.texture = { ...cur.texture, blend: cur.texture.blend === 'multiply' ? 'normal' : 'multiply' };
                ctx2.renderObjects(); ctx2.markDirty();
              },
            });
            if (cur.fillOpacity > 0) {
              items.push({
                label: 'Clear Ink Tint',
                icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="5.5" y1="5.5" x2="18.5" y2="18.5"/></svg>',
                action(ctx2) {
                  ctx2.closeMenus(); ctx2.pushUndo();
                  cur.fillOpacity = 0;
                  ctx2.renderObjects(); ctx2.markDirty();
                },
              });
            }
            items.push({
              label: 'Remove Texture',
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="8" y1="8" x2="16" y2="16"/><line x1="16" y1="8" x2="8" y2="16"/></svg>',
              action(ctx2) {
                ctx2.closeMenus(); ctx2.pushUndo();
                delete cur.texture;
                if (!(cur.fillOpacity > 0)) cur.fillOpacity = inkOpacityByHex(cur.fillColor);
                ctx2.renderObjects(); ctx2.markDirty();
              },
            });
          }
          items.push({
            label: 'Cut Hole',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4" stroke-dasharray="3 2"/></svg>',
            action(ctx2) { ctx2.closeMenus(); startHoleDraw(cur); },
          });
          if (cur.holes && cur.holes.length) {
            items.push({
              label: cur.holes.length === 1 ? 'Remove Hole' : `Remove Holes (${cur.holes.length})`,
              icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
              action(ctx2) {
                ctx2.closeMenus(); ctx2.pushUndo();
                delete cur.holes;
                ctx2.renderObjects(); ctx2.markDirty();
              },
            });
          }
          return items;
        },
      },
    },

    // ── THE PEN (modal tool) ───────────────────────────────────────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><path d="M4 20L8 6l9-2 3 8-7 9z"/><circle cx="8" cy="6" r="1.5"/><circle cx="17" cy="4" r="1.5"/><circle cx="20" cy="12" r="1.5"/><circle cx="13" cy="21" r="1.5"/><circle cx="4" cy="20" r="1.5"/></svg>',
      title: 'Polygon (P)',
      family: 'Annotate',
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 5,                  // after the stock annotate members
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L8 6l9-2 3 8-7 9z"/></svg>',
      shortcut: 'p',
      cursor: 'crosshair',

      onActivate(ctx2) {
        syncBar();
        ctx2.showBar(bar);
        startPath();
      },
      onDeactivate(ctx2) {
        cancelPath();
        ctx2.hideBar();
      },

      onPointerDown(e, ctx2) {
        if (e.target.closest('.resize-handle') || e.target.closest('[contenteditable="true"]')) return false;
        e.preventDefault();
        ctx2.clearSelection();
        let p = ctx2.screenToWorld(e.clientX, e.clientY);
        if (e.shiftKey && pts.length) p = constrain45(pts[pts.length - 1], p);
        if (pts.length >= 3 && distScreen(p, pts[0]) <= CLOSE_PX) {
          closePath();  // returned to the first point → the shape is born
        } else {
          pts.push(p);
          paintOverlay();
        }
        return true; // consumed
      },
    },

    // ── RAW POINTER ── the edit modes own the mouse while active
    // (before markup note-drag at 250 and resize at 300)
    pointer: [
      { priority: 238, handler: (e) => onHolePointerDown(e) },
      { priority: 239, handler: (e) => onTexPointerDown(e) },
      { priority: 240, handler: (e) => onEditPointerDown(e) },
    ],

    // ── MENUS ── entry in the shared "Annotate ▶" submenu ──────────────
    canvasMenu: [
      {
        submenu: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Polygon',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20L8 6l9-2 3 8-7 9z"/></svg>',
            order: 5,
            action(ctx2) { ctx2.setTool('shapes.polygon'); },
          },
        ],
      },
    ],
  };
}
