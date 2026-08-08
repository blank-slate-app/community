/* ═══════════════════════════════════════════════════════════════════════
   eyedropper.random9.js — remix of eyedropper.js

   Hover an object (prefers an 'image'-typed object, falls back to
   whatever's under the cursor) → 9 random points are chosen inside its
   world bounding box → each point is sampled INDIVIDUALLY (its own
   single-pixel eyedropper read, no averaging) → markers show each
   point's real color at its real location on the canvas, plus a mini
   3×3 preview in the bottom bar. Press X to reroll the 9 points while
   hovering. Click to place a real 3×3 grid of 9 swatches next to the
   object, each keeping its own individually-sampled color.

   Based on: eyedropper (Forma Rosa Creative)
   Remix by: santibraby

   ASSUMPTIONS (change freely):
   - Boundary object: prefers ctx.objects with type === 'image' under the
     cursor; if none, falls back to the topmost object of ANY type there
     (keeps the tool usable even if the image type key differs from what
     I've guessed — it only ever needs the object's core x/y/w/h, which
     every object type has).
   - Screen↔world mapping mirrors the original eyedropper's sampler: a
     world point (wx,wy) maps to screen/client coords via
     ((wx,wy) - ctx.screenToWorld(0,0)) * ctx.getZoom().

   Same three invariants — ctx.pushUndo() / ctx.renderObjects() /
   ctx.markDirty(). Only touch ctx.
   ═══════════════════════════════════════════════════════════════════════ */

// ── MANIFEST ────────────────────────────────────────────────────────────
export const manifest = {
  id: 'eyedropper.random9',
  name: 'Eyedropper (Random 9)',
  version: '2.0.0',
  authors: ['Forma Rosa Creative', 'santibraby'],
  basedOn: 'eyedropper',
  description: '9 individually-sampled random points shown on the image — click to place them as a 3×3 grid, X to reroll.',
};

// ── REGISTER ────────────────────────────────────────────────────────────
export function register(ctx) {
  let step = 0;            // 0=inactive, 1=hovering/picking
  let currentObj = null;   // the object currently providing the boundary
  let points = [];         // [{ wx, wy, hex }] — 9 world points + sampled colors
  let seed = (Date.now() & 0xffffffff);

  const GRID = 3, CELL = 60, GAP = 10, GUTTER = 30;

  // ── seeded RNG ──
  function mulberry32(sd) {
    return function () {
      sd |= 0; sd = (sd + 0x6D2B79F5) | 0;
      let t = Math.imul(sd ^ (sd >>> 15), 1 | sd);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function generatePointsInBounds(obj, sd) {
    const rng = mulberry32(sd);
    const pts = [];
    for (let i = 0; i < 9; i++) {
      pts.push({ wx: obj.x + rng() * obj.w, wy: obj.y + rng() * obj.h });
    }
    return pts;
  }

  // Hidden sampler canvas (same technique as the original eyedropper)
  const samplerCanvas = document.createElement('canvas');
  samplerCanvas.style.display = 'none';
  document.body.appendChild(samplerCanvas);
  const samplerCtx = samplerCanvas.getContext('2d', { willReadFrequently: true });

  function renderSceneToSampler() {
    const vw = window.innerWidth - 52, vh = window.innerHeight;
    samplerCanvas.width = vw;
    samplerCanvas.height = vh;
    samplerCtx.clearRect(0, 0, vw, vh);
    samplerCtx.fillStyle = '#111111';
    samplerCtx.fillRect(0, 0, vw, vh);

    const zoom = ctx.getZoom();
    const origin = ctx.screenToWorld(0, 0);
    const sorted = [...ctx.objects].sort((a, b) => a.zIndex - b.zIndex);
    for (const obj of sorted) {
      const t = {
        x: (obj.x - origin.x) * zoom,
        y: (obj.y - origin.y) * zoom,
        scaleX: zoom,
        scaleY: zoom,
      };
      ctx.exportObject(samplerCtx, obj, t);
    }
    return { vw, vh };
  }

  function readPixel(vw, vh, sx, sy) {
    const px = Math.round(sx), py = Math.round(sy);
    if (px < 0 || py < 0 || px >= vw || py >= vh) return null;
    const data = samplerCtx.getImageData(px, py, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2] };
  }
  function rgbToHex(r, g, b) {
    return '#' + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function worldToScreen(origin, zoom, wx, wy) {
    return { sx: (wx - origin.x) * zoom, sy: (wy - origin.y) * zoom };
  }

  // Picks 9 fresh random points inside obj's bounds and samples each
  // individually (its own single-pixel read — no averaging).
  function resamplePoints(obj, sd) {
    const raw = generatePointsInBounds(obj, sd);
    const { vw, vh } = renderSceneToSampler();
    const zoom = ctx.getZoom();
    const origin = ctx.screenToWorld(0, 0);
    return raw.map(p => {
      const { sx, sy } = worldToScreen(origin, zoom, p.wx, p.wy);
      const px = readPixel(vw, vh, sx, sy) || { r: 17, g: 17, b: 17 };
      return { wx: p.wx, wy: p.wy, hex: rgbToHex(px.r, px.g, px.b) };
    });
  }

  function findBoundaryObjectAtScreen(sx, sy) {
    const w = ctx.screenToWorld(sx, sy);
    const hits = ctx.objects.filter(o =>
      w.x >= o.x && w.x <= o.x + o.w &&
      w.y >= o.y && w.y <= o.y + o.h
    );
    if (!hits.length) return null;
    hits.sort((a, b) => b.zIndex - a.zIndex);
    const imageHits = hits.filter(o => o.type === 'image');
    return imageHits.length ? imageHits[0] : hits[0];
  }

  // ── 9 on-canvas markers ──
  const markerEls = [];
  for (let i = 0; i < 9; i++) {
    const m = document.createElement('div');
    m.className = 'r9-marker';
    document.body.appendChild(m);
    markerEls.push(m);
  }
  function hideMarkers() {
    markerEls.forEach(m => m.classList.remove('visible'));
  }
  function refreshMarkers() {
    if (points.length !== 9) { hideMarkers(); return; }
    const zoom = ctx.getZoom();
    const origin = ctx.screenToWorld(0, 0);
    points.forEach((p, i) => {
      const { sx, sy } = worldToScreen(origin, zoom, p.wx, p.wy);
      const el = markerEls[i];
      el.style.left = sx + 'px';
      el.style.top = sy + 'px';
      el.style.background = p.hex;
      el.classList.add('visible');
    });
  }

  // Status bar (bottom-center slot) with a mini 3×3 preview grid
  const bar = document.createElement('div');
  bar.className = 'eyedropper-r9-bar';
  bar.innerHTML = `
    <div class="mini-grid-r9">${Array.from({ length: 9 }).map(() => '<div></div>').join('')}</div>
    <span class="eyedropper-r9-text">Hover over an image to sample 9 random points (X to reroll)</span>
  `;
  const barText = bar.querySelector('.eyedropper-r9-text');
  const miniCells = [...bar.querySelectorAll('.mini-grid-r9 div')];
  function updateBarGrid() {
    miniCells.forEach((cell, i) => { cell.style.background = points[i] ? points[i].hex : '#444'; });
  }

  document.addEventListener('mousemove', (e) => {
    if (step !== 1) return;
    const obj = findBoundaryObjectAtScreen(e.clientX, e.clientY);

    if (!obj) {
      currentObj = null;
      points = [];
      hideMarkers();
      updateBarGrid();
      barText.textContent = 'Hover over an image to sample 9 random points (X to reroll)';
      return;
    }

    if (!currentObj || currentObj.id !== obj.id) {
      currentObj = obj;
      seed = (Date.now() & 0xffffffff);
      points = resamplePoints(obj, seed);
      barText.textContent = '9 points sampled — click to place a 3×3 grid (X to reroll)';
      updateBarGrid();
    }
    refreshMarkers(); // keep markers glued to their world spots as the view moves
  });

  document.addEventListener('keydown', (e) => {
    if (step !== 1) return;
    if (e.key !== 'x' && e.key !== 'X') return;
    const tag = (e.target && e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea') return; // don't hijack typing
    if (!currentObj) { ctx.showToast('Hover over an image first'); return; }
    e.preventDefault();

    seed = (seed + 0x9E3779B9) | 0;
    points = resamplePoints(currentObj, seed);
    refreshMarkers();
    updateBarGrid();
    ctx.showToast('Reseeded sample points');
  });

  return {
    // ── STYLES ──
    css: `
      .canvas-obj.swatch-r9-obj {
        border-radius: 50%;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .swatch-r9-label {
        font-family: var(--font-sans);
        font-size: 10px;
        font-weight: 600;
        color: rgba(255,255,255,0.85);
        text-shadow: 0 1px 3px rgba(0,0,0,0.6);
        text-align: center;
        pointer-events: auto;
        cursor: default;
        padding: 2px 4px;
        border-radius: 3px;
        transition: background 0.15s;
        letter-spacing: 0.3px;
      }
      .swatch-r9-label.dark-text {
        color: rgba(0,0,0,0.7);
        text-shadow: 0 1px 2px rgba(255,255,255,0.3);
      }
      .swatch-r9-label:hover { background: rgba(0,0,0,0.3); cursor: pointer; }
      .swatch-r9-label.copied { background: rgba(0,0,0,0.4); }

      .r9-marker {
        display: none;
        position: fixed;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        border: 2px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.4), 0 2px 6px rgba(0,0,0,0.35);
        pointer-events: none;
        z-index: 3000;
        transform: translate(-50%, -50%);
      }
      .r9-marker.visible { display: block; }

      .eyedropper-r9-bar {
        display: flex;
        background: #2a2a2a;
        border: 1px solid #3a3a3a;
        border-radius: 10px;
        padding: 8px 18px;
        align-items: center;
        box-shadow: 0 6px 20px rgba(0,0,0,0.4);
        font-family: var(--font-sans);
        color: #999;
        font-size: 13px;
        gap: 10px;
      }
      .eyedropper-r9-bar .mini-grid-r9 {
        display: grid;
        grid-template-columns: repeat(3, 8px);
        grid-template-rows: repeat(3, 8px);
        gap: 2px;
      }
      .eyedropper-r9-bar .mini-grid-r9 div {
        width: 8px; height: 8px;
        border-radius: 1px;
        background: #444;
      }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      'swatch-r9': {
        defaults: { content: '#888888' },

        normalize(obj) {
          if (!/^#[0-9a-fA-F]{6}$/.test(obj.content || '')) obj.content = '#888888';
        },

        render(obj, el, ctx) {
          el.classList.add('swatch-r9-obj');
          const hex = (obj.content || '#888888').toUpperCase();
          el.style.background = hex;
          const label = document.createElement('div');
          label.className = 'swatch-r9-label';
          label.textContent = hex;
          const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
          const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          if (luminance > 0.55) label.classList.add('dark-text');
          label.addEventListener('click', (ev) => {
            ev.stopPropagation();
            navigator.clipboard.writeText(hex).then(() => {
              label.textContent = 'Copied!';
              label.classList.add('copied');
              setTimeout(() => { label.textContent = hex; label.classList.remove('copied'); }, 1200);
            });
          });
          el.appendChild(label);
        },

        exportDraw(c2d, obj, t) {
          const hex = (obj.content || '#888888').toUpperCase();
          const ow = obj.w * t.scaleX, oh = obj.h * t.scaleY;
          c2d.fillStyle = hex;
          c2d.beginPath();
          c2d.ellipse(t.x + ow / 2, t.y + oh / 2, ow / 2, oh / 2, 0, 0, Math.PI * 2);
          c2d.fill();
          const fontSize = Math.round(Math.min(ow, oh) * 0.18);
          c2d.font = `600 ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          c2d.textAlign = 'center';
          c2d.textBaseline = 'middle';
          const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
          const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
          c2d.fillStyle = lum > 0.55 ? '#1a1a1a' : '#ffffff';
          c2d.fillText(hex, t.x + ow / 2, t.y + oh / 2);
          c2d.textAlign = 'left';
          c2d.textBaseline = 'alphabetic';
        },
      },
    },

    // ── THE TOOL (modal tool) ───────────────────────────────────────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><path d="M20.71 5.63l-2.34-2.34a1 1 0 00-1.41 0l-3.54 3.54-1.41-1.41a1 1 0 00-1.42 0L9.17 6.83a1 1 0 000 1.42l1.41 1.41L3 17.25V21h3.75l7.59-7.58 1.41 1.41a1 1 0 001.42 0l1.41-1.41a1 1 0 000-1.42l-1.41-1.41 3.54-3.54a1 1 0 000-1.42z"/></svg>',
      title: 'Eyedropper Random 9 (Y)',
      family: 'Annotate',
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 7,
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.4"/><circle cx="6" cy="7" r="1.2"/><circle cx="18" cy="7" r="1.2"/><circle cx="6" cy="17" r="1.2"/><circle cx="18" cy="17" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="19" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="20" cy="12" r="1.2"/></svg>',
      shortcut: 'y',
      cursor: 'crosshair',

      onActivate(ctx) {
        step = 1;
        currentObj = null;
        points = [];
        hideMarkers();
        updateBarGrid();
        barText.textContent = 'Hover over an image to sample 9 random points (X to reroll)';
        ctx.showBar(bar);
      },
      onDeactivate(ctx) {
        step = 0;
        currentObj = null;
        points = [];
        hideMarkers();
        ctx.hideBar();
      },

      onPointerDown(e, ctx) {
        if (e.target.closest('.resize-handle')) return false;
        e.preventDefault();

        if (!currentObj || points.length !== 9) {
          ctx.showToast('Hover over an image first');
          return true;
        }

        const originX = currentObj.x + currentObj.w + GUTTER;
        const originY = currentObj.y;

        ctx.pushUndo();
        let lastObj = null;
        points.forEach((p, i) => {
          const col = i % GRID, row = Math.floor(i / GRID);
          lastObj = ctx.createObject({
            type: 'swatch-r9',
            x: originX + col * (CELL + GAP),
            y: originY + row * (CELL + GAP),
            w: CELL, h: CELL,
            content: p.hex,
          });
        });
        if (lastObj) ctx.selectObject(lastObj.id);
        ctx.renderObjects();
        ctx.markDirty();

        currentObj = null;
        points = [];
        hideMarkers();
        ctx.setTool(null); // back to pointer
        return true;
      },
    },

    // ── MENUS ── entry in the shared "Annotate ▶" submenu
    canvasMenu: [
      {
        submenu: 'Annotate',
        icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
        order: 90,
        dividerBefore: true,
        items: [
          {
            label: 'Eyedropper Random 9',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1.4"/><circle cx="6" cy="7" r="1.2"/><circle cx="18" cy="7" r="1.2"/><circle cx="6" cy="17" r="1.2"/><circle cx="18" cy="17" r="1.2"/><circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="19" r="1.2"/><circle cx="4" cy="12" r="1.2"/><circle cx="20" cy="12" r="1.2"/></svg>',
            order: 7,
            action(ctx) { ctx.setTool('eyedropper.random9'); },
          },
        ],
      },
    ],
  };
}
