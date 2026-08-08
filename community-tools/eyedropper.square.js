/* ═══════════════════════════════════════════════════════════════════════
   eyedropper.square.js — remix of eyedropper.js
   Pick a color, place a SCALABLE SQUARE swatch (not a fixed circle).

   Based on: eyedropper (Forma Rosa Creative)
   Remix by: santibraby

   Same three invariants apply — ctx.pushUndo() / ctx.renderObjects() /
   ctx.markDirty(). Only touch ctx.
   ═══════════════════════════════════════════════════════════════════════ */

// ── MANIFEST ────────────────────────────────────────────────────────────
export const manifest = {
  id: 'eyedropper.square',
  name: 'Eyedropper (Square)',
  version: '1.0.0',
  authors: ['Forma Rosa Creative', 'santibraby'],
  basedOn: 'eyedropper',
  description: 'Sample any color on the canvas and drop it as a scalable square swatch.',
};

// ── REGISTER ────────────────────────────────────────────────────────────
export function register(ctx) {
  let step = 0;          // 0=inactive, 1=picking, 2=placing
  let pickedColor = null;

  // Hidden sampler canvas
  const samplerCanvas = document.createElement('canvas');
  samplerCanvas.style.display = 'none';
  document.body.appendChild(samplerCanvas);
  const samplerCtx = samplerCanvas.getContext('2d', { willReadFrequently: true });

  // Loupe (cursor-following magnifier) — SQUARE this time
  const loupe = document.createElement('div');
  loupe.className = 'eyedropper-sq-loupe';
  loupe.innerHTML = '<div class="loupe-sq-hex">#000000</div>';
  document.body.appendChild(loupe);
  const loupeHex = loupe.querySelector('.loupe-sq-hex');

  // Status bar (bottom-center slot)
  const bar = document.createElement('div');
  bar.className = 'eyedropper-sq-bar';
  bar.innerHTML = `
    <div class="swatch-sq-preview"></div>
    <span class="eyedropper-sq-text">Hover over a color and click to pick</span>
  `;
  const barSwatch = bar.querySelector('.swatch-sq-preview');
  const barText = bar.querySelector('.eyedropper-sq-text');

  function sampleColorAtScreen(sx, sy) {
    const vw = window.innerWidth - 52, vh = window.innerHeight;
    samplerCanvas.width = vw;
    samplerCanvas.height = vh;
    samplerCtx.clearRect(0, 0, vw, vh);
    // Match the app desk background so empty canvas reads as shown
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

    const px = Math.round(sx), py = Math.round(sy);
    if (px < 0 || py < 0 || px >= vw || py >= vh) return '#111111';
    const data = samplerCtx.getImageData(px, py, 1, 1).data;
    return '#' + ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2]).toString(16).slice(1);
  }

  // Loupe follows the cursor while picking
  document.addEventListener('mousemove', (e) => {
    if (step !== 1) return;
    const color = sampleColorAtScreen(e.clientX, e.clientY);
    loupe.classList.add('visible');
    loupe.style.left = e.clientX + 'px';
    loupe.style.top = e.clientY + 'px';
    loupe.style.background = color;
    loupeHex.textContent = color.toUpperCase();
  });

  return {
    // ── STYLES ──
    css: `
      .canvas-obj.swatch-sq-obj {
        border-radius: 4px;
        border: none;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      }
      .swatch-sq-label {
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
      .swatch-sq-label.dark-text {
        color: rgba(0,0,0,0.7);
        text-shadow: 0 1px 2px rgba(255,255,255,0.3);
      }
      .swatch-sq-label:hover { background: rgba(0,0,0,0.3); cursor: pointer; }
      .swatch-sq-label.copied { background: rgba(0,0,0,0.4); }

      .eyedropper-sq-loupe {
        display: none;
        position: fixed;
        width: 80px;
        height: 80px;
        border-radius: 8px;
        border: 3px solid #fff;
        box-shadow: 0 0 0 1px rgba(0,0,0,0.3), 0 4px 12px rgba(0,0,0,0.4);
        pointer-events: none;
        z-index: 3000;
        transform: translate(-50%, -120%);
        transition: background-color 0.05s;
      }
      .eyedropper-sq-loupe.visible { display: block; }
      .eyedropper-sq-loupe .loupe-sq-hex {
        position: absolute;
        bottom: -24px;
        left: 50%;
        transform: translateX(-50%);
        background: #222;
        color: #fff;
        font-family: var(--font-sans);
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        white-space: nowrap;
      }

      .eyedropper-sq-bar {
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
      .eyedropper-sq-bar .swatch-sq-preview {
        width: 22px; height: 22px;
        border-radius: 4px;
        border: 2px solid #555;
      }
    `,

    // ── OBJECT TYPE ────────────────────────────────────────────────────
    objectTypes: {
      'swatch-square': {
        defaults: { content: '#888888' },

        normalize(obj) {
          if (!/^#[0-9a-fA-F]{6}$/.test(obj.content || '')) obj.content = '#888888';
        },

        // square + freely resizable, but corner-drag keeps it square
        proportionalResize: true,
        resizable: true,

        // ── RENDERING ── colored square with a click-to-copy hex label
        render(obj, el, ctx) {
          el.classList.add('swatch-sq-obj');
          const hex = (obj.content || '#888888').toUpperCase();
          el.style.background = hex;
          const label = document.createElement('div');
          label.className = 'swatch-sq-label';
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

        // ── EXPORT ── filled square with the centered hex label
        exportDraw(c2d, obj, t) {
          const hex = (obj.content || '#888888').toUpperCase();
          const ow = obj.w * t.scaleX, oh = obj.h * t.scaleY;
          c2d.fillStyle = hex;
          c2d.fillRect(t.x, t.y, ow, oh);
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

    // ── THE EYEDROPPER (modal tool) ────────────────────────────────────
    tool: {
      icon: '<svg viewBox="0 0 24 24"><path d="M20.71 5.63l-2.34-2.34a1 1 0 00-1.41 0l-3.54 3.54-1.41-1.41a1 1 0 00-1.42 0L9.17 6.83a1 1 0 000 1.42l1.41 1.41L3 17.25V21h3.75l7.59-7.58 1.41 1.41a1 1 0 001.42 0l1.41-1.41a1 1 0 000-1.42l-1.41-1.41 3.54-3.54a1 1 0 000-1.42z"/></svg>',
      title: 'Eyedropper Square',
      family: 'Annotate',        // shared rail button with shapes/draw/eyedropper/markup
      familyIcon: '<svg viewBox="0 0 24 24"><path d="M17 3a2.83 2.83 0 114 4L7.5 20.5 2 22l1.5-5.5L17 3z"/></svg>',
      familyOrder: 90,
      order: 5,                  // sits after the original eyedropper (order: 4) in the flyout
      flyoutIcon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
      shortcut: 'u',              // 'i' is taken by the original eyedropper
      cursor: 'crosshair',

      onActivate(ctx) {
        step = 1;
        pickedColor = null;
        barSwatch.style.background = 'transparent';
        barText.textContent = 'Hover over a color and click to pick';
        ctx.showBar(bar);
      },
      onDeactivate(ctx) {
        step = 0;
        loupe.classList.remove('visible');
        ctx.hideBar();
      },

      onPointerDown(e, ctx) {
        if (e.target.closest('.resize-handle')) return false;
        e.preventDefault();

        if (step === 1) {
          pickedColor = sampleColorAtScreen(e.clientX, e.clientY);
          step = 2;
          loupe.classList.remove('visible');
          barSwatch.style.background = pickedColor;
          barText.textContent = `${pickedColor.toUpperCase()} — Click to place square swatch`;
          return true;
        }

        if (step === 2) {
          const w = ctx.screenToWorld(e.clientX, e.clientY);
          const size = 100;
          ctx.pushUndo();
          const obj = ctx.createObject({
            type: 'swatch-square',
            x: w.x - size / 2, y: w.y - size / 2,
            w: size, h: size,
            content: pickedColor,
          });
          ctx.selectObject(obj.id);
          ctx.renderObjects();
          ctx.markDirty();
          ctx.setTool(null); // back to pointer
          return true;
        }
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
            label: 'Eyedropper Square',
            icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>',
            order: 5,
            action(ctx) { ctx.setTool('eyedropper.square'); },
          },
        ],
      },
    ],
  };
}
