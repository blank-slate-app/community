/* ═══════════════════════════════════════════════════════════════════════
   artboards.santibraby.js — REMIX of the artboards tool

   Adds "Export Deck as PowerPoint…": every artboard becomes one slide in
   a .pptx you can open in PowerPoint or import into Google Slides
   (File → Import slides). Zero dependencies — the ZIP container and the
   OOXML parts are built by hand right here, in the spirit of the house:
   one file, readable top to bottom, remix me.

   Operate-subfamily remix: it acts on EXISTING artboards, so it appears
   in the right-click menus (canvas + artboard), never in the add menus.
   The base tool is untouched.
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'artboards.santibraby',
  name: 'PowerPoint Export',
  version: '1.0.0',
  authors: ['Forma Rosa Creative', 'santibraby'], // append-only ledger
  basedOn: 'artboards',
  description: 'Export every artboard as a PowerPoint deck (.pptx) — one slide per page. Imports into Google Slides.',
};

export function register(ctx) {

  // ── mirrored from the base tool (tools never import from each other;
  //    a remix carries what it needs) ─────────────────────────────────
  const CANVAS_SIZES = {                 // 150 DPI — plenty for slides
    '1:1':   { w: 1500, h: 1500 },
    '16:9':  { w: 2400, h: 1350 },
    '17:11': { w: 2550, h: 1650 },
  };
  const AB_CORNERS = ['tl', 'tr', 'bl', 'br'];
  const FIELD_EXPORT_STYLES = {
    title:       { size: 42, weight: '600', family: 'serif', color: '#f0f0f0' },
    subtitle:    { size: 24, weight: '400', family: 'serif', style: 'italic', color: '#cccccc' },
    description: { size: 14, weight: '400', family: "'JetBrains Mono', monospace", color: '#999999' },
  };

  // Render one artboard to a JPEG data-URL — same composition recipe as
  // the base exporter (bg → overlapping objects in z-order via each
  // tool's exportDraw → corner fields), at slide-friendly resolution.
  function renderArtboardJpeg(ab) {
    const base = CANVAS_SIZES[ab.artboardRatio] || CANVAS_SIZES['1:1'];
    const exportW = base.w, exportH = base.h;
    const scaleX = exportW / ab.w, scaleY = exportH / ab.h;

    const canvas = document.createElement('canvas');
    canvas.width = exportW; canvas.height = exportH;
    const c2d = canvas.getContext('2d');

    if (ab.artboardBg) {
      c2d.fillStyle = ab.artboardBg;
      c2d.fillRect(0, 0, exportW, exportH);
    } else {
      c2d.fillStyle = '#111111';
      c2d.fillRect(0, 0, exportW, exportH);
      const gridStep = 40 * scaleX;
      c2d.strokeStyle = 'rgba(255,255,255,0.08)';
      c2d.lineWidth = 1;
      const gridOffX = ((ab.x % 40) * scaleX);
      const gridOffY = ((ab.y % 40) * scaleY);
      for (let gx = -gridOffX; gx <= exportW; gx += gridStep) {
        c2d.beginPath(); c2d.moveTo(gx, 0); c2d.lineTo(gx, exportH); c2d.stroke();
      }
      for (let gy = -gridOffY; gy <= exportH; gy += gridStep) {
        c2d.beginPath(); c2d.moveTo(0, gy); c2d.lineTo(exportW, gy); c2d.stroke();
      }
    }

    const overlapping = ctx.objects.filter(o =>
      o.id !== ab.id && o.type !== 'artboard' &&
      o.x + o.w > ab.x && o.x < ab.x + ab.w &&
      o.y + o.h > ab.y && o.y < ab.y + ab.h
    ).sort((a, b) => a.zIndex - b.zIndex);

    for (const obj of overlapping) {
      c2d.save();
      c2d.beginPath();
      c2d.rect(0, 0, exportW, exportH);
      c2d.clip();
      ctx.exportObject(c2d, obj, {
        x: (obj.x - ab.x) * scaleX,
        y: (obj.y - ab.y) * scaleY,
        scaleX, scaleY,
      });
      c2d.restore();
    }

    const insetX = 60 * scaleX, insetY = 60 * scaleY;
    for (const corner of AB_CORNERS) {
      const f = ab.artboardFields && ab.artboardFields[corner];
      if (!f) continue;
      const isRight = corner === 'tr' || corner === 'br';
      const isBottom = corner === 'bl' || corner === 'br';

      if (f.kind === 'logo' && f.src) {
        const logoEl = ctx.worldEl.querySelector(`.canvas-obj[data-id="${ab.id}"] .ab-field-${corner} img`);
        if (logoEl && logoEl.complete && logoEl.naturalWidth) {
          const lh = 60 * scaleY;
          const lw = lh * (logoEl.naturalWidth / logoEl.naturalHeight);
          const lx = isRight ? exportW - insetX - lw : insetX;
          const ly = isBottom ? exportH - insetY - lh : insetY;
          try { c2d.drawImage(logoEl, lx, ly, lw, lh); } catch (e) { /* skip */ }
        }
        continue;
      }

      if (!f.text) continue;
      const s = FIELD_EXPORT_STYLES[f.style] || FIELD_EXPORT_STYLES.description;
      const italic = s.style === 'italic' ? 'italic ' : '';
      const family = f.fontFamily || s.family;
      const size = s.size * scaleX;
      c2d.font = `${italic}${s.weight} ${Math.round(size)}px ${family}`;
      c2d.fillStyle = f.textColor || s.color;
      c2d.textAlign = isRight ? 'right' : 'left';
      const tx = isRight ? exportW - insetX : insetX;
      const lines = String(f.text).split('\n');
      const lineH = size * 1.3;
      if (isBottom) {
        c2d.textBaseline = 'bottom';
        let ty = exportH - insetY;
        for (let i = lines.length - 1; i >= 0; i--) { c2d.fillText(lines[i], tx, ty); ty -= lineH; }
      } else {
        c2d.textBaseline = 'top';
        let ty = insetY;
        for (const line of lines) { c2d.fillText(line, tx, ty); ty += lineH; }
      }
    }
    c2d.textAlign = 'left';

    return canvas.toDataURL('image/jpeg', 0.85);
  }

  // [pptx-writer] ─ pure functions: bytes in, bytes out ────────────────

  // CRC-32 (for the ZIP central directory)
  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();
  function crc32(bytes) {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function strBytes(s) { return new TextEncoder().encode(s); }

  // Minimal ZIP writer — STORED entries only (a .pptx is just a zip)
  function buildZip(entries /* [{name, bytes}] */) {
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);

    for (const e of entries) {
      const name = strBytes(e.name);
      const crc = crc32(e.bytes);
      const local = [
        u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0x21),
        u32(crc), u32(e.bytes.length), u32(e.bytes.length),
        u16(name.length), u16(0),
      ];
      central.push({ name, crc, size: e.bytes.length, offset });
      for (const part of local) { chunks.push(part); }
      chunks.push(name, e.bytes);
      offset += 30 + name.length + e.bytes.length;
    }

    const cdStart = offset;
    for (const c of central) {
      const parts = [
        u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21),
        u32(c.crc), u32(c.size), u32(c.size),
        u16(c.name.length), u16(0), u16(0), u16(0), u16(0),
        u32(0), u32(c.offset),
      ];
      for (const p of parts) chunks.push(p);
      chunks.push(c.name);
      offset += 46 + c.name.length;
    }
    const eocd = [
      u32(0x06054B50), u16(0), u16(0),
      u16(central.length), u16(central.length),
      u32(offset - cdStart), u32(cdStart), u16(0),
    ];
    for (const p of eocd) chunks.push(p);

    let total = 0;
    for (const ch of chunks) total += ch.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const ch of chunks) { out.set(ch, pos); pos += ch.length; }
    return out;
  }

  // OOXML parts — the minimum PowerPoint and Google Slides both accept
  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';

  function contentTypesXml(n) {
    let overrides = '';
    for (let i = 1; i <= n; i++) {
      overrides += `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    }
    return XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>' +
      '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>' +
      '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>' +
      '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>' +
      overrides + '</Types>';
  }

  const ROOT_RELS = XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>' +
    '</Relationships>';

  function presentationXml(n, cx, cy) {
    let ids = '';
    for (let i = 1; i <= n; i++) ids += `<p:sldId id="${255 + i}" r:id="rId${i + 1}"/>`;
    return XML +
      '<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>' +
      `<p:sldIdLst>${ids}</p:sldIdLst>` +
      `<p:sldSz cx="${cx}" cy="${cy}"/><p:notesSz cx="${cy}" cy="${cx}"/>` +
      '</p:presentation>';
  }

  function presentationRels(n) {
    let rels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>';
    for (let i = 1; i <= n; i++) {
      rels += `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`;
    }
    return XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>';
  }

  const EMPTY_TREE =
    '<p:cSld><p:spTree>' +
    '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
    '<p:grpSpPr/>' +
    '</p:spTree></p:cSld>';
  const CLR_MAP = '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>';

  const SLIDE_MASTER = XML +
    '<p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
    EMPTY_TREE + CLR_MAP +
    '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>' +
    '</p:sldMaster>';

  const SLIDE_MASTER_RELS = XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>' +
    '</Relationships>';

  const SLIDE_LAYOUT = XML +
    '<p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank">' +
    EMPTY_TREE + '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>' +
    '</p:sldLayout>';

  const SLIDE_LAYOUT_RELS = XML +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>' +
    '</Relationships>';

  const THEME = XML +
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="frc">' +
    '<a:themeElements>' +
    '<a:clrScheme name="frc">' +
    '<a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="F0F0F0"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="29251F"/></a:dk2><a:lt2><a:srgbClr val="F0C9B4"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="F05300"/></a:accent1><a:accent2><a:srgbClr val="F07A3C"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="F0A178"/></a:accent3><a:accent4><a:srgbClr val="F0C9B4"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="999999"/></a:accent5><a:accent6><a:srgbClr val="666666"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="F05300"/></a:hlink><a:folHlink><a:srgbClr val="F0A178"/></a:folHlink>' +
    '</a:clrScheme>' +
    '<a:fontScheme name="frc"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="JetBrains Mono"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="frc">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>';

  function slideXml(i, x, y, w, h) {
    return XML +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:cSld><p:spTree>' +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr/>' +
      '<p:pic>' +
      `<p:nvPicPr><p:cNvPr id="2" name="Page ${i}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
      '<p:blipFill><a:blip r:embed="rId2"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>' +
      `<p:spPr><a:xfrm><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>' +
      '</p:pic>' +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  function slideRels(i) {
    return XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>' +
      `<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${i}.jpeg"/>` +
      '</Relationships>';
  }

  // pages: [{ w, h, jpegBytes }] → Uint8Array of the .pptx
  function buildPptx(pages) {
    // Slide size from the first page's ratio, normalized to 13.333in wide
    const CX = 12192000;
    const CY = Math.round(CX * (pages[0].h / pages[0].w));
    const entries = [
      { name: '[Content_Types].xml', bytes: strBytes(contentTypesXml(pages.length)) },
      { name: '_rels/.rels', bytes: strBytes(ROOT_RELS) },
      { name: 'ppt/presentation.xml', bytes: strBytes(presentationXml(pages.length, CX, CY)) },
      { name: 'ppt/_rels/presentation.xml.rels', bytes: strBytes(presentationRels(pages.length)) },
      { name: 'ppt/slideMasters/slideMaster1.xml', bytes: strBytes(SLIDE_MASTER) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', bytes: strBytes(SLIDE_MASTER_RELS) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', bytes: strBytes(SLIDE_LAYOUT) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', bytes: strBytes(SLIDE_LAYOUT_RELS) },
      { name: 'ppt/theme/theme1.xml', bytes: strBytes(THEME) },
    ];
    pages.forEach((p, idx) => {
      const i = idx + 1;
      // fit-contain the page image on the slide (mixed ratios letterbox)
      const scale = Math.min(CX / p.w, CY / p.h);
      const w = Math.round(p.w * scale), h = Math.round(p.h * scale);
      const x = Math.round((CX - w) / 2), y = Math.round((CY - h) / 2);
      entries.push({ name: `ppt/slides/slide${i}.xml`, bytes: strBytes(slideXml(i, x, y, w, h)) });
      entries.push({ name: `ppt/slides/_rels/slide${i}.xml.rels`, bytes: strBytes(slideRels(i)) });
      entries.push({ name: `ppt/media/image${i}.jpeg`, bytes: p.jpegBytes });
    });
    return buildZip(entries);
  }
  // [/pptx-writer] ─────────────────────────────────────────────────────

  function dataUrlToBytes(dataUrl) {
    const b64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function bytesToBase64(bytes) {
    let bin = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bytes.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin);
  }

  async function exportPptx() {
    ctx.closeMenus();
    // Needs the generic save added in Blank-Slate 2.0.5 — degrade politely
    // on older apps instead of throwing.
    if (!ctx.io || typeof ctx.io.exportFile !== 'function') {
      ctx.showToast('PowerPoint export needs Blank-Slate 2.0.5 or newer — please update the app');
      return;
    }
    // Same page order as the base tool's Export All: by artboard letter
    const artboards = ctx.objects
      .filter(o => o.type === 'artboard')
      .sort((a, b) => (a.artboardLabel || '').localeCompare(b.artboardLabel || ''));
    if (artboards.length === 0) { ctx.showToast('No artboards to export'); return; }

    ctx.showToast(`Building PowerPoint — ${artboards.length} slide${artboards.length > 1 ? 's' : ''}…`);
    // let the toast paint before the render loop blocks the thread
    await new Promise(r => setTimeout(r, 50));

    try {
      const pages = artboards.map(ab => {
        const base = CANVAS_SIZES[ab.artboardRatio] || CANVAS_SIZES['1:1'];
        return { w: base.w, h: base.h, jpegBytes: dataUrlToBytes(renderArtboardJpeg(ab)) };
      });
      const pptxBytes = buildPptx(pages);
      const doc = String(ctx.project || 'Deck').replace(/\./g, '-');
      const dataUrl = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,' +
        bytesToBase64(pptxBytes);
      const r = await ctx.io.exportFile(`${doc}.pptx`, dataUrl, 'PowerPoint Deck');
      if (r && r.success) ctx.showToast(`Saved ${doc}.pptx — import it into Google Slides or PowerPoint`);
      else if (r && r.error) ctx.showToast('Export failed: ' + r.error);
    } catch (err) {
      console.error('pptx export failed', err);
      ctx.showToast('PowerPoint export failed — see console');
    }
  }

  const PPTX_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="13" rx="1.5"/><path d="M12 17v3M8 20h8"/><path d="M9 8h4a2 2 0 010 4H9V8z"/></svg>';

  return {
    // acts on EXISTING artboards → right-click menus only (rule 5b).
    // Contributes into the base tool's 'Artboards ▶' submenu — same-label
    // submenus merge across tool files.
    canvasMenu: [
      {
        submenu: 'Artboards',
        order: 40,
        items: [
          { label: 'Export Deck as PowerPoint…', icon: PPTX_ICON, order: 5, action: () => exportPptx() },
        ],
      },
    ],
    objectMenus: {
      artboard: [
        { label: 'Export Deck as PowerPoint…', order: 62, action: () => exportPptx() },
      ],
    },
  };
}
