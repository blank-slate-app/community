/* ═══════════════════════════════════════════════════════════════════════
   markup.sketch.js — REMIX of the Markup tool by santibraby

   A SKETCHED note: drag an arrow like you'd draw it with a pen — wobbly
   shaft, a little bow, an open hand-drawn head — and a handwritten note
   at the tail. No revision cloud, no bubble: it reads like someone
   annotated the drawing by hand.

   The wobble is DETERMINISTIC: each arrow carries a seed, and every
   render — canvas, JPEG/PDF export, PowerPoint bake — regenerates the
   exact same stroke from it. What you sketch is what ships.

   FLOW: activate → drag from where the note sits to the thing you're
   pointing at → type the note. Drag the note to move the tail; grab the
   arrowhead to re-aim it; double-click the note to edit. Right-click
   for ink colors and arrow styles.

   FIVE ARROWS, one key: with a sketch note selected, tap X to cycle
   swoop → loop → circle back → s-fold → squiggle — each traced from
   the reference sheet (the circle-back and s-fold carry the sheet's
   SOLID dart heads; the rest are open pen heads). The style also lives
   in the right-click menu, and pre-1.2 styles migrate on load.

   OBJECT: type 'sketchnote' — { arrow: {ax,ay,bx,by} (local coords,
   a = tail/note, b = head), noteText, seed, inkColor, arrowStyle }.
   ═══════════════════════════════════════════════════════════════════════ */

// ── MANIFEST ────────────────────────────────────────────────────────────
export const manifest = {
  id: 'markup.sketch',
  name: 'Sketch Note',
  version: '1.2.0',
  authors: ['Forma Rosa Creative', 'santibraby'], // append-only ledger
  basedOn: 'markup',
  description: 'Hand-sketched arrows with handwritten notes — a wobbly pen stroke, an open drawn head, no bubble. Deterministic: exports exactly as drawn.',
};

// ── REGISTER ────────────────────────────────────────────────────────────
export function register(ctx) {
  const INKS = ['#111111', '#F05300', '#ff4444', '#999999', '#F0F0F0'];
  const DEFAULT_INK = '#111111';
  // The five arrows, traced from the reference sheet, in cycle order:
  // swoop   — one soft asymmetric crest, small open head
  // loop    — a flat early loop-de-loop, long straight exit, open head
  // circle  — the grand flat oval that curls ~300° and lands pointing
  //           BACK toward where it came from; solid dart head
  // fold    — a tight flattened S-fold at the tail, then a straight run;
  //           solid dart head
  // squiggle— two rounded zigzag humps up front, then a clean run out
  const STYLES = ['swoop', 'loop', 'circle', 'fold', 'squiggle'];
  const STYLE_NAMES = { swoop: 'Swoop', loop: 'Loop', circle: 'Circle Back', fold: 'S-Fold', squiggle: 'Squiggle' };
  // pre-1.2.0 styles map to their nearest new shape on load
  const STYLE_MIGRATE = { sketch: 'swoop', curve: 'circle', wave: 'squiggle' };
  const FONT = "'Caveat', cursive";
  const FONT_SIZE = 26;
  const NOTE_MAX_W = 260;
  const TEXT_RESERVE = { w: 150, h: 30 }; // bbox reserve, same idea as markup
  const PAD = 24;

  // Load the handwriting face once (same Google Fonts route as the text
  // tool; export uses it too once the browser has it cached)
  if (!document.getElementById('sknote-font')) {
    const link = document.createElement('link');
    link.id = 'sknote-font';
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Caveat:wght@600;700&display=swap';
    document.head.appendChild(link);
  }

  // ── the pen: seeded, deterministic ──────────────────────────────────
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // The whole drawing, from the seed: shaft points, the head, and the
  // note's little tilt. Each shape is traced from the reference sheet.
  // "up" is a consistent handedness (above the stroke for a left→right
  // drag), so every arrow carries the same attitude as the sheet.
  // The rng call ORDER within a style is fixed — never reorder.
  function sketchGeom(obj) {
    const { ax, ay, bx, by } = obj.arrow;
    const rng = mulberry32(((obj.seed || 1) * 2654435761) % 2147483647);
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const upx = dy / len, upy = -dx / len; // unit "above the stroke"
    const style = STYLES.includes(obj.arrowStyle) ? obj.arrowStyle : 'swoop';
    const pts = [];
    const put = (t, off) => pts.push({ x: ax + dx * t + upx * off, y: ay + dy * t + upy * off });
    const wob = () => (rng() - 0.5) * Math.min(2.4, len * 0.01);

    if (style === 'swoop') {
      // one soft crest, early and asymmetric, easing flat into the head
      const A = len * (0.13 + rng() * 0.05);
      const k = 0.28 + rng() * 0.1;
      const N = Math.max(12, Math.min(22, Math.round(len / 26)));
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        const env = Math.sin(Math.PI * t);
        put(t, A * (env + k * Math.sin(2 * Math.PI * t)) * 0.62 + wob() * env);
      }
    } else if (style === 'loop') {
      // flat loop-de-loop EARLY in the stroke, long straight exit
      const cT = 0.3 + rng() * 0.06;                       // loop center along the line
      const rl = Math.max(16, Math.min(46, len * (0.15 + rng() * 0.04))); // along-line radius
      const rp = rl * (0.5 + rng() * 0.12);                // flattened
      const N1 = Math.max(3, Math.round(len / 90));
      for (let i = 0; i < N1; i++) put((i / N1) * cT, wob());
      // enter at the bottom of the ellipse moving forward, swing up the
      // far side, over the top backward, down and out — the path crosses
      const ex = ax + dx * cT, ey = ay + dy * cT;
      const cx0 = ex + upx * rp, cy0 = ey + upy * rp;
      for (let i = 0; i <= 14; i++) {
        const a = Math.PI / 2 - (i / 14) * Math.PI * 2;
        pts.push({
          x: cx0 + (dx / len) * rl * Math.cos(a) + upx * rp * Math.sin(a) * -1,
          y: cy0 + (dy / len) * rl * Math.cos(a) + upy * rp * Math.sin(a) * -1,
        });
      }
      const N2 = Math.max(5, Math.round(len / 55));
      for (let i = 1; i <= N2; i++) {
        const t = cT + (i / N2) * (1 - cT);
        put(t, wob() * Math.sin(Math.PI * t) + Math.sin(Math.PI * ((t - cT) / (1 - cT))) * len * 0.015);
      }
    } else if (style === 'circle') {
      // the grand flat oval: out from the tail, ~300° around, landing at
      // the head pointing BACK toward where it came from
      const rl = len * (0.62 + rng() * 0.08);
      const rp = rl * (0.4 + rng() * 0.06);
      const cx0 = ax + dx * 0.5 + upx * rp * 0.9;
      const cy0 = ay + dy * 0.5 + upy * rp * 0.9;
      const angOf = (X, Y2) => {
        const vx = X - cx0, vy = Y2 - cy0;
        return Math.atan2((vx * upx + vy * upy) / rp, (vx * (dx / len) + vy * (dy / len)) / rl);
      };
      const a0 = angOf(ax, ay);
      let a1 = angOf(bx, by);
      while (a1 > a0 - Math.PI * 1.15) a1 -= Math.PI * 2; // the LONG way around
      const raw = [];
      const NN = 24;
      for (let i = 0; i <= NN; i++) {
        const a = a0 + (a1 - a0) * (i / NN);
        raw.push({
          x: cx0 + (dx / len) * rl * Math.cos(a) + upx * rp * Math.sin(a),
          y: cy0 + (dy / len) * rl * Math.cos(a) + upy * rp * Math.sin(a),
        });
      }
      // endpoint-exact warp: the oval keeps its shape, A and B stay pinned
      const e0x = ax - raw[0].x, e0y = ay - raw[0].y;
      const e1x = bx - raw[NN].x, e1y = by - raw[NN].y;
      for (let i = 0; i <= NN; i++) {
        const s = i / NN;
        pts.push({
          x: raw[i].x + e0x * (1 - s) + e1x * s + (rng() - 0.5) * Math.min(2, len * 0.006) * Math.sin(Math.PI * s),
          y: raw[i].y + e0y * (1 - s) + e1y * s,
        });
      }
    } else if (style === 'fold') {
      // a tight flattened S-fold at the tail — the along-line progress
      // BACKTRACKS through it — then a long clean run to the head
      const amp = Math.max(6, Math.min(16, len * 0.055)) * (0.9 + rng() * 0.2);
      const F = [ // control polygon: [along-line t, off in amps]
        [0.00, 0.0], [0.13, -0.75], [0.27, -1.0], [0.33, -0.45],
        [0.20, 0.15], [0.11, 0.65], [0.22, 1.0], [0.38, 0.7],
        [0.55, 0.2], [0.75, 0.05], [1.00, 0.0],
      ];
      for (const [t, o] of F) put(t, o * amp + wob() * Math.sin(Math.PI * t));
    } else {
      // squiggle: two rounded zigzag humps in the first 45%, then out
      const amp = Math.max(8, Math.min(20, len * 0.085)) * (0.9 + rng() * 0.2);
      const FRONT = 0.45;
      const N = Math.max(18, Math.min(34, Math.round(len / 16)));
      for (let i = 0; i <= N; i++) {
        const t = i / N;
        if (t < FRONT) {
          const s = t / FRONT;
          put(t, amp * Math.sin(2 * Math.PI * 2 * s) * Math.pow(Math.sin(Math.PI * s), 0.4) + wob() * Math.sin(Math.PI * t));
        } else {
          put(t, wob() * Math.sin(Math.PI * t));
        }
      }
    }

    // ── the head, from the final stroke direction ──
    const p1 = pts[pts.length - 2], p2 = pts[pts.length - 1];
    const ha = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const headFill = style === 'circle' || style === 'fold'; // the sheet's solid darts
    const hl = (headFill ? Math.max(12, Math.min(24, len * 0.11)) : Math.max(11, Math.min(26, len * 0.16)));
    const spread = (headFill ? 0.26 : 0.42) + rng() * 0.1;
    const asym = 0.85 + rng() * 0.3;
    const wing = (sgn, l) => {
      const a = ha + Math.PI + sgn * spread; // swept back from the tip
      const j = (rng() - 0.5) * 2.2;         // a little mid-stroke kink
      return [
        p2,
        { x: p2.x + Math.cos(a) * l * 0.55 + upx * j, y: p2.y + Math.sin(a) * l * 0.55 + upy * j },
        { x: p2.x + Math.cos(a) * l, y: p2.y + Math.sin(a) * l },
      ];
    };
    const wing1 = wing(1, hl);
    const wing2 = wing(-1, hl * asym);
    const textRot = (rng() - 0.5) * 5; // −2.5°…2.5°, like a resting hand
    return { pts, wing1, wing2, headFill, textRot, len };
  }

  // Smooth polyline → path data (quadratics through midpoints)
  function pathD(pts) {
    if (pts.length < 2) return '';
    let d = `M ${r1(pts[0].x)} ${r1(pts[0].y)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      d += ` Q ${r1(pts[i].x)} ${r1(pts[i].y)} ${r1(mx)} ${r1(my)}`;
    }
    const last = pts[pts.length - 1];
    d += ` L ${r1(last.x)} ${r1(last.y)}`;
    return d;
  }
  const r1 = (v) => Math.round(v * 10) / 10;

  function tracePts(c2d, pts, X, Y) {
    c2d.moveTo(X(pts[0].x), Y(pts[0].y));
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      c2d.quadraticCurveTo(X(pts[i].x), Y(pts[i].y), X(mx), Y(my));
    }
    const last = pts[pts.length - 1];
    c2d.lineTo(X(last.x), Y(last.y));
  }

  // Note anchor: just past the tail, on the side AWAY from the arrow
  function noteAnchor(obj) {
    const { ax, ay, bx, by } = obj.arrow;
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    return {
      x: ax - (dx / len) * 12,
      y: ay - (dy / len) * 12,
      rightAligned: bx >= ax, // arrow points right → the note hangs left
    };
  }

  // Re-hug the box around arrow geometry + the note reserve
  function rehugBox(obj) {
    const g = sketchGeom(obj);
    const all = [...g.pts, ...g.wing1, ...g.wing2];
    const na = noteAnchor(obj);
    all.push({ x: na.x, y: na.y });
    all.push({ x: na.x + (na.rightAligned ? -TEXT_RESERVE.w : TEXT_RESERVE.w), y: na.y + TEXT_RESERVE.h });
    const xs = all.map(p => p.x), ys = all.map(p => p.y);
    const minX = Math.min(...xs) - PAD, minY = Math.min(...ys) - PAD;
    const maxX = Math.max(...xs) + PAD, maxY = Math.max(...ys) + PAD;
    obj.x += minX; obj.y += minY;
    obj.arrow = {
      ax: obj.arrow.ax - minX, ay: obj.arrow.ay - minY,
      bx: obj.arrow.bx - minX, by: obj.arrow.by - minY,
    };
    obj.w = maxX - minX;
    obj.h = maxY - minY;
  }

  function startEditNote(obj, textEl) {
    textEl.contentEditable = 'true';
    if (!obj.noteText) textEl.textContent = '';
    textEl.focus();
    const range = document.createRange();
    range.selectNodeContents(textEl);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    function onBlur() {
      textEl.contentEditable = 'false';
      const newT = textEl.textContent.trim();
      if (newT !== obj.noteText) ctx.pushUndo();
      obj.noteText = newT || 'note';
      textEl.removeEventListener('blur', onBlur);
      ctx.renderObjects();
      ctx.markDirty();
    }
    textEl.addEventListener('blur', onBlur);
    textEl.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') textEl.blur(); });
  }

  // ── drag preview: the real sketch, live under the hand ──────────────
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const preview = document.createElementNS(SVG_NS, 'svg');
  preview.setAttribute('class', 'sknote-preview');
  preview.style.cssText = 'position:absolute;left:0;top:0;width:1px;height:1px;overflow:visible;pointer-events:none;z-index:9998;display:none;';
  const previewPath = document.createElementNS(SVG_NS, 'path');
  previewPath.setAttribute('fill', 'none');
  previewPath.setAttribute('stroke-width', '2.5');
  previewPath.setAttribute('stroke-linecap', 'round');
  previewPath.setAttribute('stroke-linejoin', 'round');
  preview.appendChild(previewPath);
  ctx.worldEl.appendChild(preview);

  const STATE_KEY = 'markup.sketch.ink';
  const currentInk = () => {
    const v = ctx.state.get(STATE_KEY);
    return INKS.includes(v) ? v : DEFAULT_INK;
  };
  const STATE_STYLE = 'markup.sketch.style';
  const currentStyle = () => {
    const v = ctx.state.get(STATE_STYLE);
    return STYLES.includes(v) ? v : 'swoop';
  };

  // X cycles the arrow style on every selected sketch note. Capture
  // phase, so it runs ahead of the kernel's letter shortcuts; never
  // while typing — and the polygon tool's add-point X only lives inside
  // ITS edit mode, where the selection is empty, so they never collide.
  function cycleStyle() {
    const sel = [...ctx.selectedIds].map(id => ctx.findObject(id)).filter(o => o && o.type === 'sketchnote');
    if (!sel.length) return false;
    ctx.pushUndo();
    const next = STYLES[(STYLES.indexOf(sel[0].arrowStyle) + 1) % STYLES.length];
    for (const o of sel) { o.arrowStyle = next; rehugBox(o); }
    ctx.state.set(STATE_STYLE, next); // the NEXT arrow starts in this style
    ctx.renderObjects();
    ctx.markDirty();
    ctx.showToast(`Arrow: ${STYLE_NAMES[next]} — X cycles`);
    return true;
  }
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'x' && e.key !== 'X') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (t && (t.isContentEditable || (t.tagName && /^(INPUT|TEXTAREA)$/.test(t.tagName)))) return;
    if (cycleStyle()) { e.preventDefault(); e.stopPropagation(); }
  }, true);

  return {
    // ── STYLES ──────────────────────────────────────────────────────────
    css: `
      .canvas-obj.sknote-obj { background: transparent; overflow: visible; }
      .canvas-obj.sknote-obj svg {
        position: absolute; left: 0; top: 0;
        overflow: visible;
        fill: none;
        stroke-linecap: round;
        stroke-linejoin: round;
        pointer-events: none;
      }
      .canvas-obj.sknote-obj .sketch-note {
        position: absolute;
        font-family: ${FONT};
        font-size: ${FONT_SIZE}px;
        font-weight: 600;
        line-height: 1.15;
        white-space: pre-wrap;
        word-break: break-word;
        min-width: 30px;
        min-height: 24px;
        max-width: ${NOTE_MAX_W}px;
        width: max-content;
        cursor: move;
        padding: 2px 4px;
      }
      .canvas-obj.sknote-obj .sketch-note[contenteditable="true"] {
        cursor: text;
        user-select: text;
        outline: 1px dashed currentColor;
        outline-offset: 3px;
      }
      .sknote-menu-swatches { display: flex; gap: 6px; align-items: center; padding: 8px 14px; }
      .sknote-menu-swatch {
        width: 20px; height: 20px; border: 2px solid transparent; border-radius: 50%;
        cursor: pointer; padding: 0;
        transition: transform 120ms ease, border-color 120ms ease;
      }
      .sknote-menu-swatch:hover { transform: scale(1.15); }
      .sknote-menu-swatch.active { border-color: #F0C4A0; }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      sketchnote: {
        defaults: { arrow: null, noteText: '', seed: 1, inkColor: DEFAULT_INK, arrowStyle: 'swoop' },
        resizable: false, // re-aim by dragging the head; the box hugs the sketch

        normalize(obj) {
          const a = obj.arrow;
          if (!a || ![a.ax, a.ay, a.bx, a.by].every(isFinite)) obj.arrow = null;
          else obj.arrow = { ax: a.ax, ay: a.ay, bx: a.bx, by: a.by };
          if (typeof obj.noteText !== 'string') obj.noteText = '';
          if (!isFinite(obj.seed) || obj.seed <= 0) obj.seed = (Number(obj.id) || 1) * 7919 + 13;
          if (!INKS.includes(obj.inkColor)) obj.inkColor = DEFAULT_INK;
          if (STYLE_MIGRATE[obj.arrowStyle]) obj.arrowStyle = STYLE_MIGRATE[obj.arrowStyle];
          if (!STYLES.includes(obj.arrowStyle)) obj.arrowStyle = 'swoop';
        },

        render(obj, el) {
          if (!obj.arrow) return;
          el.classList.add('sknote-obj');
          const g = sketchGeom(obj);
          const ink = obj.inkColor || DEFAULT_INK;

          const svg = document.createElementNS(SVG_NS, 'svg');
          svg.style.width = obj.w + 'px';
          svg.style.height = obj.h + 'px';
          const path = document.createElementNS(SVG_NS, 'path');
          path.setAttribute('d', g.headFill
            ? pathD(g.pts)
            : `${pathD(g.pts)} ${pathD(g.wing1)} ${pathD(g.wing2)}`);
          path.setAttribute('stroke', ink);
          path.setAttribute('stroke-width', '2.5');
          svg.appendChild(path);
          if (g.headFill) {
            // the sheet's solid dart: a small filled triangle at the tip
            const tip = g.wing1[0], w1 = g.wing1[2], w2 = g.wing2[2];
            const head = document.createElementNS(SVG_NS, 'path');
            head.setAttribute('d', `M ${r1(tip.x)} ${r1(tip.y)} L ${r1(w1.x)} ${r1(w1.y)} L ${r1(w2.x)} ${r1(w2.y)} Z`);
            head.setAttribute('fill', ink);
            head.setAttribute('stroke', ink);
            head.setAttribute('stroke-width', '2');
            svg.appendChild(head);
          }
          el.appendChild(svg);

          const na = noteAnchor(obj);
          const note = document.createElement('div');
          note.className = 'sketch-note';
          note.style.color = ink;
          note.style.top = na.y + 'px';
          note.style.left = na.x + 'px';
          note.style.transformOrigin = na.rightAligned ? 'right center' : 'left center';
          note.style.transform =
            `translateY(-50%) ${na.rightAligned ? 'translateX(-100%)' : ''} rotate(${r1(g.textRot)}deg)`;
          note.style.textAlign = na.rightAligned ? 'right' : 'left';
          note.textContent = obj.noteText || 'note';
          el.appendChild(note);
        },

        onDoubleClick(obj, e, ctx2) {
          const textEl = ctx2.worldEl.querySelector(`[data-id="${obj.id}"] .sketch-note`);
          if (!textEl) return false;
          ctx2.selectObject(obj.id);
          startEditNote(obj, textEl);
          return true;
        },

        // ── EXPORT ── the SAME seeded geometry, scaled
        exportDraw(c2d, obj, t) {
          if (!obj.arrow) return;
          const g = sketchGeom(obj);
          const ink = obj.inkColor || DEFAULT_INK;
          const X = (v) => t.x + v * t.scaleX;
          const Y = (v) => t.y + v * t.scaleY;
          c2d.save();
          c2d.strokeStyle = ink;
          c2d.lineWidth = 2.5 * t.scaleX;
          c2d.lineCap = 'round';
          c2d.lineJoin = 'round';
          c2d.beginPath();
          tracePts(c2d, g.pts, X, Y);
          if (!g.headFill) {
            tracePts(c2d, g.wing1, X, Y);
            tracePts(c2d, g.wing2, X, Y);
          }
          c2d.stroke();
          if (g.headFill) {
            const tip = g.wing1[0], w1 = g.wing1[2], w2 = g.wing2[2];
            c2d.beginPath();
            c2d.moveTo(X(tip.x), Y(tip.y));
            c2d.lineTo(X(w1.x), Y(w1.y));
            c2d.lineTo(X(w2.x), Y(w2.y));
            c2d.closePath();
            c2d.fillStyle = ink;
            c2d.fill();
            c2d.stroke();
          }

          // the note, in the handwriting face, with its little tilt
          const na = noteAnchor(obj);
          const fontSize = FONT_SIZE * t.scaleX;
          c2d.font = `600 ${Math.round(fontSize)}px Caveat, cursive`;
          c2d.fillStyle = ink;
          c2d.textAlign = na.rightAligned ? 'right' : 'left';
          c2d.textBaseline = 'middle';
          c2d.translate(X(na.x), Y(na.y));
          c2d.rotate((g.textRot * Math.PI) / 180);
          const words = String(obj.noteText || 'note').split(/\s+/);
          const maxW = NOTE_MAX_W * t.scaleX;
          const lines = [];
          let line = '';
          for (const word of words) {
            const test = line ? line + ' ' + word : word;
            if (c2d.measureText(test).width > maxW && line) { lines.push(line); line = word; }
            else line = test;
          }
          if (line) lines.push(line);
          const lineH = fontSize * 1.15;
          let ly = -((lines.length - 1) * lineH) / 2;
          for (const ln of lines) { c2d.fillText(ln, 0, ly); ly += lineH; }
          c2d.restore();
        },
      },
    },

    // ── THE TOOL (modal): one drag — tail to target — then type ────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><path d="M3 17c4-6 9-8 13-7" fill="none"/><path d="M13 6l4 3-5 2" fill="none"/><path d="M4 20l2-1" fill="none"/></svg>',
      title: 'Sketch Note',
      family: 'Annotate',
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 6, // after Polygon in the Annotate flyout
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c4-6 9-8 13-7"/><path d="M13 6l4 3-5 2"/></svg>',
      cursor: 'crosshair',

      onDeactivate() { preview.style.display = 'none'; },

      onPointerDown(e, ctx2) {
        if (e.target.closest('.resize-handle') || e.target.closest('[contenteditable="true"]')) return false;
        e.preventDefault();
        ctx2.clearSelection();
        const start = ctx2.screenToWorld(e.clientX, e.clientY);
        const seed = (Math.floor(Math.random() * 0x7fffffff) || 1);
        const temp = { arrow: null, seed, id: seed };
        preview.style.display = 'block';
        previewPath.setAttribute('stroke', currentInk());

        function onMove(ev) {
          const now = ctx2.screenToWorld(ev.clientX, ev.clientY);
          temp.arrow = { ax: start.x, ay: start.y, bx: now.x, by: now.y };
          const g = sketchGeom(temp);
          previewPath.setAttribute('d', `${pathD(g.pts)} ${pathD(g.wing1)} ${pathD(g.wing2)}`);
        }
        function onUp(ev) {
          document.removeEventListener('mousemove', onMove);
          document.removeEventListener('mouseup', onUp);
          preview.style.display = 'none';
          previewPath.setAttribute('d', '');
          const end = ctx2.screenToWorld(ev.clientX, ev.clientY);
          if (Math.hypot(end.x - start.x, end.y - start.y) < 25) return; // too short to be an arrow
          ctx2.pushUndo();
          const obj = ctx2.createObject({
            type: 'sketchnote',
            x: 0, y: 0, w: 10, h: 10,
            arrow: { ax: start.x, ay: start.y, bx: end.x, by: end.y },
            noteText: '',
            seed,
            inkColor: currentInk(),
            arrowStyle: currentStyle(),
          });
          rehugBox(obj); // absolute → hugged local coords in one step
          ctx2.selectObject(obj.id);
          ctx2.renderObjects();
          ctx2.markDirty();
          setTimeout(() => {
            const textEl = ctx2.worldEl.querySelector(`[data-id="${obj.id}"] .sketch-note`);
            if (textEl) startEditNote(obj, textEl);
          }, 50);
        }
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
        return true;
      },
    },

    // ── RAW POINTER ── drag the note = move the tail; grab the head =
    // re-aim the arrow (both re-hug the box on release; priority 250,
    // same slot as the original markup's note drag)
    pointer: [
      {
        priority: 250,
        handler(e, ctx2) {
          if (e.button !== 0) return false;
          const objEl = e.target.closest('.canvas-obj');
          if (!objEl) return false;
          const obj = ctx2.findObject(parseInt(objEl.dataset.id));
          if (!obj || obj.type !== 'sketchnote' || !obj.arrow) return false;

          const noteEl = e.target.closest('.sketch-note');
          const P = ctx2.screenToWorld(e.clientX, e.clientY);
          const headDist = Math.hypot(P.x - (obj.x + obj.arrow.bx), P.y - (obj.y + obj.arrow.by)) * ctx2.getZoom();
          const part = (noteEl && !noteEl.isContentEditable) ? 'tail' : (headDist <= 14 ? 'head' : null);
          if (!part) return false;

          e.preventDefault();
          ctx2.pushUndo();
          ctx2.selectObject(obj.id);
          const sx = e.clientX, sy = e.clientY;
          const orig = { ...obj.arrow };
          const zoom = ctx2.getZoom();

          function onMove(ev) {
            const ddx = (ev.clientX - sx) / zoom;
            const ddy = (ev.clientY - sy) / zoom;
            obj.arrow = part === 'tail'
              ? { ...orig, ax: orig.ax + ddx, ay: orig.ay + ddy }
              : { ...orig, bx: orig.bx + ddx, by: orig.by + ddy };
            ctx2.renderObjects();
            ctx2.markDirty();
          }
          function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            rehugBox(obj);
            ctx2.renderObjects();
          }
          document.addEventListener('mousemove', onMove);
          document.addEventListener('mouseup', onUp);
          return true;
        },
      },
    ],

    // ── MENUS ── ink swatches + edit, and the Annotate ▶ entry ─────────
    objectMenus: {
      sketchnote: (selObjs) => {
        const cur = selObjs.find(o => o.type === 'sketchnote');
        if (!cur) return [];
        return [
          {
            html: '<div class="sknote-menu-swatches">' + INKS.map(c =>
              `<button class="sknote-menu-swatch${cur.inkColor === c ? ' active' : ''}" data-ink="${c}" style="background:${c}"></button>`
            ).join('') + '</div>',
            onClick(e, ctx2) {
              const b = e.target.closest('.sknote-menu-swatch');
              if (!b) return;
              ctx2.pushUndo();
              for (const o of selObjs) if (o.type === 'sketchnote') o.inkColor = b.dataset.ink;
              ctx2.state.set(STATE_KEY, b.dataset.ink); // the NEXT arrow starts in this ink
              ctx2.renderObjects();
              ctx2.markDirty();
              b.parentElement.querySelectorAll('.sknote-menu-swatch').forEach(s =>
                s.classList.toggle('active', s === b));
            },
          },
          {
            label: 'Arrow Style (X cycles)',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12c4-7 14 7 18 0"/><path d="M17 8l4 4-4 4"/></svg>',
            submenu: STYLES.map(s => ({
              label: STYLE_NAMES[s],
              checked: cur.arrowStyle === s,
              action(ctx2) {
                ctx2.closeMenus();
                ctx2.pushUndo();
                for (const o of selObjs) if (o.type === 'sketchnote') { o.arrowStyle = s; rehugBox(o); }
                ctx2.state.set(STATE_STYLE, s);
                ctx2.renderObjects();
                ctx2.markDirty();
              },
            })),
          },
          {
            label: 'Edit Note',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
            action(ctx2) {
              ctx2.closeMenus();
              const textEl = ctx2.worldEl.querySelector(`[data-id="${cur.id}"] .sketch-note`);
              if (textEl) startEditNote(cur, textEl);
            },
          },
        ];
      },
    },

    canvasMenu: [
      {
        submenu: 'Annotate',
        order: 90,
        items: [
          {
            label: 'Sketch Note',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 17c4-6 9-8 13-7"/><path d="M13 6l4 3-5 2"/></svg>',
            order: 6,
            action(ctx2) { ctx2.setTool('markup.sketch'); },
          },
        ],
      },
    ],
  };
}
