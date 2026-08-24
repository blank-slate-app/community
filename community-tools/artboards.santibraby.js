/* ═══════════════════════════════════════════════════════════════════════
   artboards.santibraby.js — REMIX of the artboards tool (v2)

   "Export Deck as PowerPoint…" — every artboard becomes one slide, and
   every OBJECT stays an object: text exports as editable text boxes
   (style, color, bold/italic/underline runs), images export as picture
   objects with their crops still editable in PowerPoint (native crop,
   full image underneath), and everything else (flowchart, drawings,
   shapes, filtered images…) rasterizes as its own transparent image so
   it remains individually selectable. The artboard background becomes
   the slide background. Zero dependencies — ZIP + OOXML built by hand.

   Opens in PowerPoint; imports into Google Slides via File → Import
   slides. Needs Blank-Slate 2.0.5+ (ctx.io.exportFile).

   2.3.0: mixed-aspect decks letterbox into the first board's slide size
   (no more overflow when 1:1 and 16:9 boards share a deck); right-aligned
   corner fields export right-aligned; rasterized objects share the
   MAX_IMG_DIM cap (a huge drawing can't allocate a world-sized canvas);
   labels sort numerically ("2" before "10"); per-slide progress toasts
   with an event-loop yield between slides; reads obj.imgShadow (the
   Drop Shadow remix) and emits a NATIVE editable outerShdw on pictures —
   the shadow stays live in PowerPoint.
   ═══════════════════════════════════════════════════════════════════════ */

export const manifest = {
  id: 'artboards.santibraby',
  name: 'PowerPoint Export',
  version: '2.4.0',
  authors: ['Forma Rosa Creative', 'santibraby'], // append-only ledger
  basedOn: 'artboards',
  description: 'Export artboards as an EDITABLE PowerPoint deck — text arrives as text boxes, images as image objects (crops intact). Imports into Google Slides.',
};

export function register(ctx) {

  // ── mirrored from the base tools (remixes carry what they need) ─────
  const CANVAS_SIZES = {
    '1:1':   { w: 1500, h: 1500 },
    '16:9':  { w: 2400, h: 1350 },
    '17:11': { w: 2550, h: 1650 },
    '3:4':   { w: 1125, h: 1500 }, // verticals — letterbox into the deck
    '3:5':   { w: 900,  h: 1500 },
  };
  const AB_CORNERS = ['tl', 'tr', 'bl', 'br'];
  // text tool's style table (canvas px @150dpi)
  const TEXT_STYLES = {
    label:       { size: 168, weight: 700, family: 'Inter',              italic: false, color: 'F0F0F0', lh: 1.05 },
    title:       { size: 42,  weight: 600, family: 'Cormorant Garamond', italic: false, color: 'F0F0F0', lh: 1.2 },
    subtitle:    { size: 24,  weight: 400, family: 'Cormorant Garamond', italic: true,  color: 'CCCCCC', lh: 1.3 },
    description: { size: 14,  weight: 400, family: 'JetBrains Mono',     italic: false, color: '999999', lh: 1.5 },
  };
  // artboard corner-field styles (fields reuse the text look)
  const FIELD_STYLES = {
    title:       { size: 42, weight: 600, family: 'Georgia',        italic: false, color: 'F0F0F0', lh: 1.3 },
    subtitle:    { size: 24, weight: 400, family: 'Georgia',        italic: true,  color: 'CCCCCC', lh: 1.3 },
    description: { size: 14, weight: 400, family: 'JetBrains Mono', italic: false, color: '999999', lh: 1.3 },
  };
  const TEXT_PAD = { x: 12, y: 8 }; // the text tool's box padding (canvas px)

  // [pptx-writer] ─ pure functions: data in, bytes out ─────────────────

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

  function buildZip(entries) {
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => new Uint8Array([v & 255, (v >> 8) & 255]);
    const u32 = (v) => new Uint8Array([v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255]);
    for (const e of entries) {
      const name = strBytes(e.name);
      const crc = crc32(e.bytes);
      const local = [u32(0x04034B50), u16(20), u16(0), u16(0), u16(0), u16(0x21),
        u32(crc), u32(e.bytes.length), u32(e.bytes.length), u16(name.length), u16(0)];
      central.push({ name, crc, size: e.bytes.length, offset });
      for (const part of local) chunks.push(part);
      chunks.push(name, e.bytes);
      offset += 30 + name.length + e.bytes.length;
    }
    const cdStart = offset;
    for (const c of central) {
      const parts = [u32(0x02014B50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0x21),
        u32(c.crc), u32(c.size), u32(c.size), u16(c.name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset)];
      for (const p of parts) chunks.push(p);
      chunks.push(c.name);
      offset += 46 + c.name.length;
    }
    const eocd = [u32(0x06054B50), u16(0), u16(0), u16(central.length), u16(central.length),
      u32(offset - cdStart), u32(cdStart), u16(0)];
    for (const p of eocd) chunks.push(p);
    let total = 0;
    for (const ch of chunks) total += ch.length;
    const out = new Uint8Array(total);
    let pos = 0;
    for (const ch of chunks) { out.set(ch, pos); pos += ch.length; }
    return out;
  }

  const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n';
  function escXml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  }

  // Parse the text tool's canonical rich vocabulary (<b>/<i>/<u>/<br>)
  // into paragraphs of styled runs. Anything else is treated literally.
  function parseRichRuns(content) {
    const text = String(content == null ? '' : content);
    const paras = [];
    let runs = [];
    let buf = '';
    const state = { b: 0, i: 0, u: 0 };
    const flush = () => {
      if (buf) { runs.push({ t: buf, b: state.b > 0, i: state.i > 0, u: state.u > 0 }); buf = ''; }
    };
    const endPara = () => { flush(); paras.push(runs); runs = []; };
    let m;
    const re = /<\s*(\/?)\s*(b|i|u|br)\s*\/?\s*>|<span[^>]*>|<\/span>/gi;
    let last = 0;
    const decode = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    while ((m = re.exec(text)) !== null) {
      buf += decode(text.slice(last, m.index));
      last = re.lastIndex;
      const tag = (m[2] || '').toLowerCase();
      if (tag === 'br') { endPara(); continue; }
      if (!tag) continue; // span noise
      flush();
      state[tag] = Math.max(0, state[tag] + (m[1] ? -1 : 1));
    }
    buf += decode(text.slice(last));
    endPara();
    return paras;
  }

  // page: { wPx, hPx, bg: {color}|{mediaIdx}|null, shapes: [
  //   { kind:'image', mediaIdx, xPx,yPx,wPx,hPx, rot?, srcRect? {l,t,r,b} }
  //   { kind:'text',  xPx,yPx,wPx,hPx, rot?, paras, style:{sizePx,family,
  //     bold,italic,color,lh}, padX?,padY?, anchor? } ] }
  // media: [{ ext:'jpeg'|'png', bytes }]
  const CXX = 12192000; // slide width EMU (13.333in)

  function contentTypesXml(n) {
    let overrides = '';
    for (let i = 1; i <= n; i++) {
      overrides += `<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`;
    }
    return XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Default Extension="png" ContentType="image/png"/>' +
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
    '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="frc"><a:themeElements>' +
    '<a:clrScheme name="frc"><a:dk1><a:srgbClr val="111111"/></a:dk1><a:lt1><a:srgbClr val="F0F0F0"/></a:lt1>' +
    '<a:dk2><a:srgbClr val="29251F"/></a:dk2><a:lt2><a:srgbClr val="F0C9B4"/></a:lt2>' +
    '<a:accent1><a:srgbClr val="F05300"/></a:accent1><a:accent2><a:srgbClr val="F07A3C"/></a:accent2>' +
    '<a:accent3><a:srgbClr val="F0A178"/></a:accent3><a:accent4><a:srgbClr val="F0C9B4"/></a:accent4>' +
    '<a:accent5><a:srgbClr val="999999"/></a:accent5><a:accent6><a:srgbClr val="666666"/></a:accent6>' +
    '<a:hlink><a:srgbClr val="F05300"/></a:hlink><a:folHlink><a:srgbClr val="F0A178"/></a:folHlink></a:clrScheme>' +
    '<a:fontScheme name="frc"><a:majorFont><a:latin typeface="Georgia"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>' +
    '<a:minorFont><a:latin typeface="Inter"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme>' +
    '<a:fmtScheme name="frc">' +
    '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>' +
    '<a:lnStyleLst><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>' +
    '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>' +
    '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>' +
    '</a:fmtScheme></a:themeElements></a:theme>';

  function slideXml(page, emuPerPx, offX, offY, mediaRelId /* mediaIdx → rId */) {
    const px = (v) => Math.round(v * emuPerPx);
    const pageW = Math.max(1, px(page.wPx)), pageH = Math.max(1, px(page.hPx));
    let id = 1;
    let body = '';

    // background — a solid color floods the whole slide (letterbox bars
    // match the board); a raster background covers exactly the page area
    let bgXml = '';
    if (page.bg && page.bg.color) {
      bgXml = `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${page.bg.color}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;
    } else if (page.bg && page.bg.mediaIdx != null) {
      body += picXml(++id, mediaRelId.get(page.bg.mediaIdx), offX, offY, pageW, pageH, 0, null);
    }

    for (const s of page.shapes) {
      const x = offX + px(s.xPx), y = offY + px(s.yPx), w = Math.max(1, px(s.wPx)), h = Math.max(1, px(s.hPx));
      const rot = s.rot ? ` rot="${Math.round(s.rot * 60000)}"` : '';
      if (s.kind === 'image') {
        // Drop Shadow remix passthrough (obj.imgShadow): px → OOXML units
        // here, where emuPerPx is known. dist/dir from the dx/dy vector.
        const sh = s.shadow ? {
          blur: Math.max(0, px(s.shadow.blur || 0)),
          dist: Math.max(0, px(Math.hypot(s.shadow.dx || 0, s.shadow.dy || 0))),
          dir: Math.round((((Math.atan2(s.shadow.dy || 0, s.shadow.dx || 0) * 180 / Math.PI) + 360) % 360) * 60000),
          alpha: Math.round(Math.max(0, Math.min(1, s.shadow.alpha == null ? 0.55 : s.shadow.alpha)) * 100000),
        } : null;
        body += picXml(++id, mediaRelId.get(s.mediaIdx), x, y, w, h, s.rot || 0, s.srcRect, sh);
      } else if (s.kind === 'text') {
        const st = s.style;
        const sizePt = st.sizePx * emuPerPx / 12700;
        const sz = Math.max(100, Math.round(sizePt * 100));
        const lIns = px(s.padX != null ? s.padX : 0), tIns = px(s.padY != null ? s.padY : 0);
        // paragraph alignment (right-corner fields export algn="r")
        const algn = s.align === 'r' ? ' algn="r"' : s.align === 'ctr' ? ' algn="ctr"' : '';
        let paras = '';
        for (const runs of s.paras) {
          let rXml = '';
          for (const r of runs) {
            if (!r.t) continue;
            rXml += `<a:r><a:rPr lang="en-US" sz="${sz}"` +
              `${(st.bold || r.b) ? ' b="1"' : ''}${(st.italic || r.i) ? ' i="1"' : ''}${r.u ? ' u="sng"' : ''} dirty="0">` +
              `<a:solidFill><a:srgbClr val="${st.color}"/></a:solidFill>` +
              `<a:latin typeface="${escXml(st.family)}"/><a:cs typeface="${escXml(st.family)}"/>` +
              `</a:rPr><a:t>${escXml(r.t)}</a:t></a:r>`;
          }
          if (!rXml) rXml = `<a:endParaRPr lang="en-US" sz="${sz}"/>`;
          paras += `<a:p><a:pPr${algn}><a:lnSpc><a:spcPct val="${Math.round((st.lh || 1.2) * 100000)}"/></a:lnSpc></a:pPr>${rXml}</a:p>`;
        }
        body +=
          `<p:sp><p:nvSpPr><p:cNvPr id="${++id}" name="Text ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
          `<p:spPr><a:xfrm${rot}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
          `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>` +
          `<p:txBody><a:bodyPr wrap="square" lIns="${lIns}" tIns="${tIns}" rIns="${lIns}" bIns="${tIns}" anchor="${s.anchor || 't'}"/><a:lstStyle/>${paras}</p:txBody></p:sp>`;
      }
    }

    return XML +
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      `<p:cSld>${bgXml}<p:spTree>` +
      '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>' +
      '<p:grpSpPr/>' + body +
      '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
  }

  function picXml(id, relId, x, y, w, h, rotDeg, srcRect, shadow) {
    const rot = rotDeg ? ` rot="${Math.round(rotDeg * 60000)}"` : '';
    const sr = srcRect
      ? `<a:srcRect l="${srcRect.l}" t="${srcRect.t}" r="${srcRect.r}" b="${srcRect.b}"/>`
      : '';
    // native, still-editable PowerPoint drop shadow (values already EMU /
    // 60000ths-of-a-degree / thousandths-of-a-percent — see slideXml)
    const fx = shadow
      ? `<a:effectLst><a:outerShdw blurRad="${shadow.blur}" dist="${shadow.dist}" dir="${shadow.dir}" rotWithShape="0">` +
        `<a:srgbClr val="000000"><a:alpha val="${shadow.alpha}"/></a:srgbClr></a:outerShdw></a:effectLst>`
      : '';
    return `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Image ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
      `<p:blipFill><a:blip r:embed="${relId}"/>${sr}<a:stretch><a:fillRect/></a:stretch></p:blipFill>` +
      `<p:spPr><a:xfrm${rot}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>` +
      `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fx}</p:spPr></p:pic>`;
  }

  // pages + media → Uint8Array .pptx
  function buildPptx(pages, media) {
    const CY = Math.round(CXX * (pages[0].hPx / pages[0].wPx));
    const entries = [
      { name: '[Content_Types].xml', bytes: strBytes(contentTypesXml(pages.length)) },
      { name: '_rels/.rels', bytes: strBytes(ROOT_RELS) },
      { name: 'ppt/presentation.xml', bytes: strBytes(presentationXml(pages.length, CXX, CY)) },
      { name: 'ppt/_rels/presentation.xml.rels', bytes: strBytes(presentationRels(pages.length)) },
      { name: 'ppt/slideMasters/slideMaster1.xml', bytes: strBytes(SLIDE_MASTER) },
      { name: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', bytes: strBytes(SLIDE_MASTER_RELS) },
      { name: 'ppt/slideLayouts/slideLayout1.xml', bytes: strBytes(SLIDE_LAYOUT) },
      { name: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', bytes: strBytes(SLIDE_LAYOUT_RELS) },
      { name: 'ppt/theme/theme1.xml', bytes: strBytes(THEME) },
    ];
    media.forEach((m, i) => {
      entries.push({ name: `ppt/media/image${i + 1}.${m.ext}`, bytes: m.bytes });
    });

    pages.forEach((page, idx) => {
      const i = idx + 1;
      // Letterbox: every page FITS the deck's slide size (set by the first
      // board) and centers. Mixed 1:1 / 16:9 decks no longer overflow or
      // stretch; same-aspect decks scale exactly as before (offsets 0).
      const emuPerPx = Math.min(CXX / page.wPx, CY / page.hPx);
      const offX = Math.round((CXX - page.wPx * emuPerPx) / 2);
      const offY = Math.round((CY - page.hPx * emuPerPx) / 2);
      // rels: layout + every media this page references
      const used = new Set();
      if (page.bg && page.bg.mediaIdx != null) used.add(page.bg.mediaIdx);
      for (const s of page.shapes) if (s.kind === 'image') used.add(s.mediaIdx);
      const mediaRelId = new Map();
      let rels = '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>';
      let rn = 1;
      for (const mIdx of used) {
        const rid = `rId${++rn}`;
        mediaRelId.set(mIdx, rid);
        rels += `<Relationship Id="${rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image${mIdx + 1}.${media[mIdx].ext}"/>`;
      }
      entries.push({ name: `ppt/slides/slide${i}.xml`, bytes: strBytes(slideXml(page, emuPerPx, offX, offY, mediaRelId)) });
      entries.push({
        name: `ppt/slides/_rels/slide${i}.xml.rels`,
        bytes: strBytes(XML + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + rels + '</Relationships>'),
      });
    });
    return buildZip(entries);
  }
  // [/pptx-writer] ─────────────────────────────────────────────────────

  // ── DOM-side collectors ─────────────────────────────────────────────

  // 2.0.6+ kernels expose ctx.getObjectElement (the sanctioned way to an
  // object's rendered element); feature-detect keeps this file working on
  // released kernels that predate it.
  function objectEl(id) {
    return ctx.getObjectElement
      ? ctx.getObjectElement(id)
      : ctx.worldEl.querySelector(`.canvas-obj[data-id="${id}"]`);
  }

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
    for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    return btoa(bin);
  }
  function primaryFont(fam, fallback) {
    if (!fam) return fallback;
    const first = String(fam).split(',')[0].replace(/['"]/g, '').trim();
    return first || fallback;
  }
  function hex6(c, fallback) {
    if (!c) return fallback;
    const m = /^#?([0-9a-f]{6})$/i.exec(String(c).trim());
    return m ? m[1].toUpperCase() : fallback;
  }

  // media dedup: content key → index
  function mediaStore() {
    const list = [];
    const byKey = new Map();
    return {
      list,
      add(key, ext, bytes) {
        if (key && byKey.has(key)) return byKey.get(key);
        const idx = list.length;
        list.push({ ext, bytes });
        if (key) byKey.set(key, idx);
        return idx;
      },
    };
  }

  const MAX_IMG_DIM = 2600; // cap embedded image dimension

  // Re-encode the on-screen <img> at natural size (full image — the crop
  // stays a live PowerPoint crop via srcRect).
  function imgElToMedia(imgEl, wantPng) {
    let w = imgEl.naturalWidth, h = imgEl.naturalHeight;
    const scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale)); h = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    c.getContext('2d').drawImage(imgEl, 0, 0, w, h);
    return wantPng
      ? { ext: 'png', bytes: dataUrlToBytes(c.toDataURL('image/png')) }
      : { ext: 'jpeg', bytes: dataUrlToBytes(c.toDataURL('image/jpeg', 0.9)) };
  }

  // ── Ink flattening (polyshape → the image it's drawn on) ────────────
  // PowerPoint has no blend modes, so multiply-ink polygons are baked
  // into the embedded media of every image they OVERLAP (and sit above
  // in z) — the deck shows exactly what the canvas shows. Overlap, not
  // full containment: scaling an image+ink group can push a point a hair
  // past the image edge, and that must not un-bake the ink. The canvas
  // clips each bake to its image naturally; any part of the ink that
  // truly pokes out past all its host images ships separately as a flat
  // raster at the ink's own z position (invisible slivers are dropped).
  // The project itself stays live and editable throughout.
  function polyWorldPoints(o) {
    const sx = o.w / (o.viewW || o.w), sy = o.h / (o.viewH || o.h);
    return (o.points || []).map(p => ({ x: o.x + p.x * sx, y: o.y + p.y * sy }));
  }

  // → { bakes: imgId → [polys], polyHosts: polyId → [host rects] };
  //   also fills consumedIds
  function planInkBakes(overlapping, consumedIds) {
    const bakes = new Map();
    const polyHosts = new Map();
    // "below" must mean VISUAL stacking, not raw zIndex: objects can tie
    // on zIndex (pasted decks keep relative z), and the renderer breaks
    // ties by array order — `overlapping` is stable-sorted by zIndex, so
    // its index IS the stacking order. A strict zIndex compare here used
    // to refuse every tied ink.
    const stackOrder = new Map(overlapping.map((o, i) => [o.id, i]));
    const images = overlapping.filter(o => o.type === 'image' && !(o.rotation || 0));
    for (const poly of overlapping) {
      if (poly.type !== 'polyshape' || (poly.rotation || 0)) continue;
      const pts = polyWorldPoints(poly);
      if (pts.length < 3) continue;
      const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x));
      const minY = Math.min(...pts.map(p => p.y)), maxY = Math.max(...pts.map(p => p.y));
      // hosts: images BELOW the ink (visually) whose area the ink overlaps
      const hosts = images.filter(img =>
        stackOrder.get(img.id) < stackOrder.get(poly.id) &&
        minX < img.x + img.w && maxX > img.x &&
        minY < img.y + img.h && maxY > img.y);
      if (!hosts.length) continue;
      for (const host of hosts) {
        if (!bakes.has(host.id)) bakes.set(host.id, []);
        bakes.get(host.id).push(poly);
      }
      polyHosts.set(poly.id, hosts.map(h => ({ x: h.x, y: h.y, w: h.w, h: h.h })));
      consumedIds.add(poly.id);
    }
    return { bakes, polyHosts };
  }

  // A consumed ink that extends past its host image(s): rasterize just
  // the part OUTSIDE the hosts (flat — over the background there's no
  // image to multiply into anyway). Returns null when nothing meaningful
  // remains, which is the common case after a slightly-overhanging scale.
  function rasterizePolyRemainder(poly, hostRects) {
    const w = Math.max(1, Math.round(poly.w)), h = Math.max(1, Math.round(poly.h));
    // Media cap (same MAX_IMG_DIM as images): the canvas — and the
    // getImageData scan below — stay bounded even for world-sized inks.
    // The shape still PLACES at its world size (visW/visH).
    const scale = Math.min(1, MAX_IMG_DIM / Math.max(w, h));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w * scale));
    c.height = Math.max(1, Math.round(h * scale));
    const c2d = c.getContext('2d');
    const drew = ctx.exportObject(c2d, poly, { x: 0, y: 0, scaleX: scale, scaleY: scale });
    if (!drew) return null;
    for (const hr of hostRects) {
      c2d.clearRect(Math.floor((hr.x - poly.x) * scale), Math.floor((hr.y - poly.y) * scale),
                    Math.ceil(hr.w * scale) + 1, Math.ceil(hr.h * scale) + 1);
    }
    const data = c2d.getImageData(0, 0, c.width, c.height).data;
    let seen = 0;
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 16 && ++seen > 64) break;
    }
    if (seen <= 64) return null; // sliver — drop it
    return { bytes: dataUrlToBytes(c.toDataURL('image/png')), visW: w, visH: h };
  }

  // Bake polys onto a canvas through each poly's OWN exportDraw (via
  // ctx.exportObject, decorators included) — multiply inks, hole rings,
  // perspective image textures, fades, texture blends: whatever the
  // Polygon tool renders is exactly what bakes. This used to hand-roll a
  // simple multiply fill, which silently dropped every polygon feature
  // the fill didn't know about (holes and textures, notably).
  // origin/px-per-world map world coords → canvas px.
  function drawInksOnCanvas(c2d, polys, originX, originY, pxPerWorldX, pxPerWorldY) {
    for (const poly of polys) {
      ctx.exportObject(c2d, poly, {
        x: (poly.x - originX) * pxPerWorldX,
        y: (poly.y - originY) * pxPerWorldY,
        scaleX: pxPerWorldX,
        scaleY: pxPerWorldY,
      });
    }
  }

  // Cropped view of the image + its inks, at the crop's natural
  // resolution (capped). Crop is baked too — srcRect no longer applies.
  function bakedImageMedia(imgEl, obj, polys) {
    const crop = obj.crop || { x: 0, y: 0, w: 100, h: 100 };
    const sx = (crop.x / 100) * imgEl.naturalWidth;
    const sy = (crop.y / 100) * imgEl.naturalHeight;
    const sw = Math.max(1, (crop.w / 100) * imgEl.naturalWidth);
    const sh = Math.max(1, (crop.h / 100) * imgEl.naturalHeight);
    const scale = Math.min(1, MAX_IMG_DIM / Math.max(sw, sh));
    const w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const c2d = c.getContext('2d');
    c2d.drawImage(imgEl, sx, sy, sw, sh, 0, 0, w, h);
    drawInksOnCanvas(c2d, polys, obj.x, obj.y, w / obj.w, h / obj.h);
    return { ext: 'jpeg', bytes: dataUrlToBytes(c.toDataURL('image/jpeg', 0.9)) };
  }

  // Generic fallback: rasterize ANY object alone on a transparent canvas
  // via each tool's own exportDraw (decorators — filters, grunge — apply).
  // Rotation is baked in; the shape ships at its visual bounds.
  function rasterizeObject(obj, inkPolys) {
    const rot = obj.rotation || 0;
    const swap = rot === 90 || rot === 270;
    const visW = Math.max(1, Math.round(swap ? obj.h : obj.w));
    const visH = Math.max(1, Math.round(swap ? obj.w : obj.h));
    // Cap the CANVAS like images are capped: a wall-sized drawing must not
    // allocate a wall-sized bitmap (Chromium canvases fail past ~32k px and
    // the PNGs balloon). The object still PLACES at its world size — only
    // the media resolution is capped.
    const scale = Math.min(1, MAX_IMG_DIM / Math.max(visW, visH));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(visW * scale));
    c.height = Math.max(1, Math.round(visH * scale));
    const c2d = c.getContext('2d');
    const drew = ctx.exportObject(c2d, obj, {
      x: (c.width - obj.w * scale) / 2,
      y: (c.height - obj.h * scale) / 2,
      scaleX: scale, scaleY: scale,
    });
    // types with no exportDraw (guides…) don't belong in the deck
    if (!drew && !(inkPolys && inkPolys.length)) return null;
    // inks riding this object (e.g. on a FILTERED image) bake in on top
    if (inkPolys && inkPolys.length) {
      drawInksOnCanvas(c2d, inkPolys,
        obj.x - (visW - obj.w) / 2, obj.y - (visH - obj.h) / 2, scale, scale);
    }
    return { bytes: dataUrlToBytes(c.toDataURL('image/png')), visW, visH };
  }

  function collectTextShape(obj, ab) {
    const st = TEXT_STYLES[obj.textStyle] || TEXT_STYLES.title;
    return {
      kind: 'text',
      xPx: obj.x - ab.x, yPx: obj.y - ab.y, wPx: obj.w, hPx: obj.h,
      rot: obj.rotation || 0,
      paras: parseRichRuns(obj.content),
      padX: TEXT_PAD.x, padY: TEXT_PAD.y,
      style: {
        sizePx: st.size,
        family: primaryFont(obj.fontFamily, st.family),
        bold: st.weight >= 600,
        italic: st.italic,
        color: hex6(obj.textColor, st.color),
        lh: st.lh,
      },
    };
  }

  function collectFieldShapes(ab, store) {
    const shapes = [];
    const inset = 60;
    for (const corner of AB_CORNERS) {
      const f = ab.artboardFields && ab.artboardFields[corner];
      if (!f) continue;
      const isRight = corner === 'tr' || corner === 'br';
      const isBottom = corner === 'bl' || corner === 'br';
      if (f.kind === 'logo' && f.src) {
        const abEl = objectEl(ab.id);
        const logoEl = abEl && abEl.querySelector(`.ab-field-${corner} img`);
        if (logoEl && logoEl.complete && logoEl.naturalWidth) {
          const lh = 60;
          const lw = lh * (logoEl.naturalWidth / logoEl.naturalHeight);
          const m = imgElToMedia(logoEl, /\.png(\?|$)/i.test(logoEl.src));
          const mediaIdx = store.add('logo:' + (f.src || logoEl.src), m.ext, m.bytes);
          shapes.push({
            kind: 'image', mediaIdx,
            xPx: isRight ? ab.w - inset - lw : inset,
            yPx: isBottom ? ab.h - inset - lh : inset,
            wPx: lw, hPx: lh,
          });
        }
        continue;
      }
      if (!f.text) continue;
      const st = FIELD_STYLES[f.style] || FIELD_STYLES.description;
      const lines = String(f.text).split('\n');
      const boxH = Math.max(st.size * st.lh * lines.length + 8, 24);
      const boxW = ab.w * 0.45;
      shapes.push({
        kind: 'text',
        xPx: isRight ? ab.w - inset - boxW : inset,
        yPx: isBottom ? ab.h - inset - boxH : inset,
        wPx: boxW, hPx: boxH,
        paras: lines.map(l => [{ t: l, b: false, i: false, u: false }]),
        padX: 0, padY: 0,
        anchor: isBottom ? 'b' : 't',
        align: isRight ? 'r' : 'l',
        style: {
          sizePx: st.size,
          family: primaryFont(f.fontFamily, st.family),
          bold: st.weight >= 600,
          italic: st.italic,
          color: hex6(f.textColor, st.color),
          lh: st.lh,
        },
      });
    }
    return shapes;
  }

  // Background: solid color, or a raster of the dark-desk grid look
  function collectBackground(ab, store) {
    if (ab.artboardBg) return { color: hex6(ab.artboardBg, 'FFFFFF') };
    const c = document.createElement('canvas');
    const w = Math.max(2, Math.round(ab.w / 2)), h = Math.max(2, Math.round(ab.h / 2));
    c.width = w; c.height = h;
    const c2d = c.getContext('2d');
    c2d.fillStyle = '#111111';
    c2d.fillRect(0, 0, w, h);
    const step = 20; // 40px world grid at half scale
    c2d.strokeStyle = 'rgba(255,255,255,0.08)';
    c2d.lineWidth = 1;
    const offX = ((ab.x % 40) / 2), offY = ((ab.y % 40) / 2);
    for (let gx = -offX; gx <= w; gx += step) { c2d.beginPath(); c2d.moveTo(gx, 0); c2d.lineTo(gx, h); c2d.stroke(); }
    for (let gy = -offY; gy <= h; gy += step) { c2d.beginPath(); c2d.moveTo(0, gy); c2d.lineTo(w, gy); c2d.stroke(); }
    const mediaIdx = store.add(null, 'jpeg', dataUrlToBytes(c.toDataURL('image/jpeg', 0.8)));
    return { mediaIdx };
  }

  function collectPage(ab, store) {
    const shapes = [];
    const overlapping = ctx.objects.filter(o =>
      o.id !== ab.id && o.type !== 'artboard' &&
      o.x + o.w > ab.x && o.x < ab.x + ab.w &&
      o.y + o.h > ab.y && o.y < ab.y + ab.h
    ).sort((a, b) => a.zIndex - b.zIndex);

    // inks overlapping an image bake into it (multiply survives pptx)
    const consumedIds = new Set();
    const { bakes, polyHosts } = planInkBakes(overlapping, consumedIds);

    for (const obj of overlapping) {
      if (obj.type === 'polyshape' && consumedIds.has(obj.id)) {
        // baked into its image(s) — but any part hanging past them still
        // ships, flat, right here so z-order is preserved
        try {
          const r = rasterizePolyRemainder(obj, polyHosts.get(obj.id) || []);
          if (r) {
            const mediaIdx = store.add(null, 'png', r.bytes);
            shapes.push({
              kind: 'image', mediaIdx,
              xPx: obj.x - ab.x, yPx: obj.y - ab.y, wPx: r.visW, hPx: r.visH,
            });
          }
        } catch (err) {
          console.warn('pptx: skipped ink remainder', obj.id, err);
        }
        continue;
      }
      if (obj.type === 'text') {
        shapes.push(collectTextShape(obj, ab));
        continue;
      }
      if (obj.type === 'image') {
        const hasFilters = Array.isArray(obj.filters) && obj.filters.length > 0;
        const inks = bakes.get(obj.id) || [];
        const hostEl = objectEl(obj.id);
        const imgEl = hostEl && hostEl.querySelector('img');
        if (!hasFilters && imgEl && imgEl.complete && imgEl.naturalWidth) {
          if (inks.length) {
            // baked variant: cropped view + multiplied inks in one media
            // (crop is baked too, so no srcRect and no dedup key)
            const m = bakedImageMedia(imgEl, obj, inks);
            const mediaIdx = store.add(null, m.ext, m.bytes);
            shapes.push({
              kind: 'image', mediaIdx,
              xPx: obj.x - ab.x, yPx: obj.y - ab.y, wPx: obj.w, hPx: obj.h,
              rot: obj.rotation || 0,
              shadow: obj.imgShadow || null,
            });
            continue;
          }
          const wantPng = /\.png(\?|$)/i.test(imgEl.src || '');
          const m = imgElToMedia(imgEl, wantPng);
          const mediaIdx = store.add('img:' + obj.content + ':' + (wantPng ? 'png' : 'jpg'), m.ext, m.bytes);
          let srcRect = null;
          if (obj.crop) {
            const cl = Math.max(0, Math.min(100, obj.crop.x));
            const ct = Math.max(0, Math.min(100, obj.crop.y));
            const cr = Math.max(0, 100 - obj.crop.x - obj.crop.w);
            const cb = Math.max(0, 100 - obj.crop.y - obj.crop.h);
            srcRect = { l: Math.round(cl * 1000), t: Math.round(ct * 1000), r: Math.round(cr * 1000), b: Math.round(cb * 1000) };
          }
          shapes.push({
            kind: 'image', mediaIdx,
            xPx: obj.x - ab.x, yPx: obj.y - ab.y, wPx: obj.w, hPx: obj.h,
            rot: obj.rotation || 0, srcRect,
            shadow: obj.imgShadow || null,
          });
          continue;
        }
        // filtered / not-loaded image → rasterizer (its inks bake on top).
        // The shadow rides as a NATIVE outerShdw here too: the decorator's
        // baked shadow is fully covered/clipped inside the tight raster,
        // so the native one is the only visible shadow — never doubled.
        try {
          const r = rasterizeObject(obj, inks);
          if (!r) continue;
          const mediaIdx = store.add(null, 'png', r.bytes);
          const cx = (obj.x - ab.x) + obj.w / 2, cy = (obj.y - ab.y) + obj.h / 2;
          shapes.push({
            kind: 'image', mediaIdx,
            xPx: cx - r.visW / 2, yPx: cy - r.visH / 2, wPx: r.visW, hPx: r.visH,
            shadow: obj.imgShadow || null,
          });
        } catch (err) {
          console.warn('pptx: skipped image', obj.id, err);
        }
        continue;
      }
      // Everything else: its own transparent raster, rotation baked
      try {
        const r = rasterizeObject(obj);
        if (!r) continue;
        const mediaIdx = store.add(null, 'png', r.bytes);
        const cx = (obj.x - ab.x) + obj.w / 2, cy = (obj.y - ab.y) + obj.h / 2;
        shapes.push({
          kind: 'image', mediaIdx,
          xPx: cx - r.visW / 2, yPx: cy - r.visH / 2, wPx: r.visW, hPx: r.visH,
        });
      } catch (err) {
        console.warn('pptx: skipped object', obj.id, obj.type, err);
      }
    }

    shapes.push(...collectFieldShapes(ab, store));
    return { wPx: ab.w, hPx: ab.h, bg: collectBackground(ab, store), shapes };
  }

  async function exportPptx() {
    ctx.closeMenus();
    // Needs the generic save added in Blank-Slate 2.0.5 — degrade politely
    // on older apps instead of throwing.
    if (!ctx.io || typeof ctx.io.exportFile !== 'function') {
      ctx.showToast('PowerPoint export needs Blank-Slate 2.0.5 or newer — please update the app');
      return;
    }
    const artboards = ctx.objects
      .filter(o => o.type === 'artboard')
      // numeric-aware: "Board 2" sorts before "Board 10"
      .sort((a, b) => (a.artboardLabel || '').localeCompare(b.artboardLabel || '', undefined, { numeric: true, sensitivity: 'base' }));
    if (artboards.length === 0) { ctx.showToast('No artboards to export'); return; }

    ctx.showToast(`Building PowerPoint — ${artboards.length} slide${artboards.length > 1 ? 's' : ''}, objects stay editable…`);
    await new Promise(r => setTimeout(r, 50));

    try {
      const store = mediaStore();
      // one slide per pass with a yield between them: the UI keeps
      // breathing and the toast doubles as a per-slide progress readout
      const pages = [];
      for (let i = 0; i < artboards.length; i++) {
        pages.push(collectPage(artboards[i], store));
        if (artboards.length > 1) {
          ctx.showToast(`Building PowerPoint — slide ${i + 1}/${artboards.length}…`);
          await new Promise(r => setTimeout(r, 0));
        }
      }
      const pptxBytes = buildPptx(pages, store.list);
      const doc = String(ctx.project || 'Deck').replace(/\./g, '-');
      const dataUrl = 'data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,' +
        bytesToBase64(pptxBytes);
      const r = await ctx.io.exportFile(`${doc}.pptx`, dataUrl, 'PowerPoint Deck');
      if (r && r.success) ctx.showToast(`Saved ${doc}.pptx — text and images arrive as editable objects`);
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
