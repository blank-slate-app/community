/* ═══════════════════════════════════════════════════════════════════════
   images.shadow.js — Drop Shadow for images, by santibraby

   OPERATE-SUBFAMILY of the images family (same shape as images.filters
   and images.grunge): it acts on EXISTING images, so its UI lives on the
   right-click-an-image menu ("Drop Shadow"), never in the Add menus. It
   owns no object type — it decorates rendering and export.

   THE LOOK: a rectangle the size of the image's CROP BOX, offset 15px
   down-right, blurred 20px, black @ 55% (the app's shadow language —
   see --frc-canvas-shadow), sitting DIRECTLY BEHIND the image. It is a
   RECTANGLE by design: cut-out images (white bg removed) still cast a
   straight-edged card shadow — a print taped to the desk, not a glow
   hugging the silhouette.

   DATA: obj.imgShadow = { dx, dy, blur, alpha } — our own namespaced
   field (AGENTS.md rule 8: obj.filters belongs to images.filters, which
   sanitizes it on load and would strip a foreign entry). Delete this
   file and images simply render clean; the field survives untouched.

   DISPLAY: a pointer-transparent div PREPENDED inside the image's
   element, before .img-wrapper — both are positioned with no z-index,
   so DOM order = paint order = shadow behind the pixels. Riding the
   element means move/resize/rotate/undo/save all come free, and the
   blur lives in world px so it scales with zoom like everything else.

   EXPORT: onBeforeObjectExport paints the same blurred rect under the
   image on every canvas exporter (JPEG artboards, deck previews, deck
   publishing). The PowerPoint remix (2.3.0+) reads obj.imgShadow and
   emits a NATIVE editable outerShdw on the picture instead — the shadow
   stays live in PowerPoint.

   THE THREE INVARIANTS
   - ctx.pushUndo()      BEFORE mutating any object
   - ctx.renderObjects() AFTER structural changes
   - ctx.markDirty()     AFTER any change (schedules the auto-save)
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'images.shadow',
  name: 'Drop Shadow',
  version: '1.0.0',
  authors: ['santibraby'],
  basedOn: 'images',
  description: 'Drop shadows on images — a blurred rectangle offset 15px behind the crop box, like a print taped to the desk.',
};

export function register(ctx) {
  const DEFAULTS = { dx: 15, dy: 15, blur: 20, alpha: 0.55 };

  // Sanitize OUR field only; anything malformed snaps back to defaults.
  function norm(obj) {
    const s = obj.imgShadow;
    if (!s) return null;
    return {
      dx: isFinite(s.dx) ? Number(s.dx) : DEFAULTS.dx,
      dy: isFinite(s.dy) ? Number(s.dy) : DEFAULTS.dy,
      blur: isFinite(s.blur) ? Math.max(0, Number(s.blur)) : DEFAULTS.blur,
      alpha: isFinite(s.alpha) ? Math.max(0, Math.min(1, Number(s.alpha))) : DEFAULTS.alpha,
    };
  }

  function apply(obj, el) {
    let sh = el.querySelector(':scope > .imgsh-rect');
    const s = obj.type === 'image' ? norm(obj) : null;
    if (!s) { if (sh) sh.remove(); return; }
    if (!sh) {
      sh = document.createElement('div');
      sh.className = 'imgsh-rect';
      el.prepend(sh); // first positioned child = painted behind .img-wrapper
    }
    sh.style.transform = `translate(${s.dx}px, ${s.dy}px)`;
    sh.style.filter = s.blur > 0 ? `blur(${s.blur}px)` : '';
    sh.style.background = `rgba(0, 0, 0, ${s.alpha})`;
  }

  function selectedImages() {
    const out = [];
    for (const id of ctx.selectedIds) {
      const o = ctx.findObject(id);
      if (o && o.type === 'image') out.push(o);
    }
    return out;
  }

  return {
    // ── STYLES ─────────────────────────────────────────────────────────
    css: `
      /* the shadow card: crop-box-sized; offset + blur set inline */
      .canvas-obj .imgsh-rect {
        position: absolute;
        inset: 0;
        pointer-events: none;
      }
      /* crop mode explodes the element open — hide the card while the
         full image is spread out, it comes back with the committed crop */
      .canvas-obj.cropping .imgsh-rect { display: none; }
    `,

    // ── MENU ── right-click an image → toggle. Applies to every selected
    // image at once; a mixed selection turns everyone ON first (proper
    // toggle semantics), a uniform ON selection turns everyone off.
    objectMenus: {
      image: (selObjs) => {
        const imgs = (selObjs || []).filter(o => o.type === 'image');
        if (!imgs.length) return [];
        const allOn = imgs.every(o => !!o.imgShadow);
        return [{
          label: 'Drop Shadow',
          icon: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="13" height="13" rx="1"/><path d="M20 9v9a2 2 0 01-2 2H9" opacity="0.5"/></svg>',
          order: 55,
          checked: allOn,
          action(ctx2) {
            ctx2.closeMenus();
            ctx2.pushUndo();
            for (const o of selectedImages()) {
              if (allOn) delete o.imgShadow;
              else o.imgShadow = { ...DEFAULTS };
            }
            ctx2.renderObjects();
            ctx2.markDirty();
          },
        }];
      },
    },

    // ── DECORATORS ── paint the card wherever images appear
    onObjectRender(obj, el) {
      if (obj.type !== 'image') return;
      apply(obj, el);
    },
    // BEFORE the image draws → the shadow lands underneath it. This runs
    // with whatever c2d.filter images.filters set up for the image draw;
    // save/set/restore keeps ours isolated and hands theirs back intact.
    onBeforeObjectExport(c2d, obj, t) {
      if (obj.type !== 'image') return;
      const s = norm(obj);
      if (!s) return;
      const scale = (Math.abs(t.scaleX) + Math.abs(t.scaleY)) / 2;
      c2d.save();
      c2d.filter = s.blur > 0 ? `blur(${s.blur * scale}px)` : 'none';
      c2d.fillStyle = `rgba(0, 0, 0, ${s.alpha})`;
      c2d.fillRect(t.x + s.dx * t.scaleX, t.y + s.dy * t.scaleY, obj.w * t.scaleX, obj.h * t.scaleY);
      c2d.restore();
    },

    // Sanitize our field on load (never touches anything else)
    onReady(ctx2) {
      for (const o of ctx2.objects) {
        if (o.type !== 'image' || !o.imgShadow) continue;
        o.imgShadow = norm(o);
      }
    },
  };
}
