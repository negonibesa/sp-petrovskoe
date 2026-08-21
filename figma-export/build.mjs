import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const SERVER = 'C:/Users/Rakutin/htmlToFigma/figmaToDesign/dist';
const ROOT = fileURLToPath(new URL('..', import.meta.url));

const { CodeToFigmaConverter } = await import(pathToFileURL(`${SERVER}/converters/code-to-figma.js`).href);
const { ImageProcessor } = await import(pathToFileURL(`${SERVER}/utils/image-processor.js`).href);

const MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};

class FileImageProcessor extends ImageProcessor {
  resolveUrl(url) {
    if (url.startsWith('file://')) return url;
    return super.resolveUrl(url);
  }
  async downloadImage(url) {
    if (this.imageCache.has(url)) return this.imageCache.get(url);
    if (url.startsWith('file://')) {
      const filePath = fileURLToPath(url);
      const data = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const image = { url, data, mimeType: MIME[ext] || 'image/png' };
      this.imageCache.set(url, image);
      return image;
    }
    return super.downloadImage(url);
  }
}

async function absolutizeImages(html, dir) {
  return html.replace(/(<img[^>]*\ssrc\s*=\s*["'])([^"']+)(["'])/gi, (m, p1, src, p3) => {
    if (/^(https?:|data:|file:|#|\/\/)/i.test(src)) return m;
    const abs = path.resolve(dir, src);
    return `${p1}${pathToFileURL(abs).href}${p3}`;
  });
}

function sanitize(node) {
  if (Array.isArray(node)) {
    for (const v of node) sanitize(v);
    return;
  }
  if (node && typeof node === 'object') {
    for (const k of Object.keys(node)) {
      const v = node[k];
      if (v === null) {
        if (['r', 'g', 'b', 'a', 'x', 'y', 'width', 'height', 'itemSpacing', 'cornerRadius', 'opacity', 'strokeWeight', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'fontSize', 'value'].includes(k)) node[k] = 0;
        else delete node[k];
      } else if (typeof v === 'number' && Number.isNaN(v)) {
        node[k] = 0;
      } else if (typeof v === 'object') {
        sanitize(v);
      }
    }
  }
}

function inlineSvgUse(html) {
  const symbols = {};
  html = html.replace(/<symbol\s+([^>]*)>([\s\S]*?)<\/symbol>/gi, (m, attrs, body) => {
    const idM = attrs.match(/id\s*=\s*["']([^"']+)["']/i);
    const vbM = attrs.match(/viewBox\s*=\s*["']([^"']+)["']/i);
    if (idM) symbols[idM[1]] = { viewBox: vbM ? vbM[1] : '0 0 24 24', body };
    return m;
  });
  html = html.replace(/<svg[^>]*style\s*=\s*["'][^"']*display\s*:\s*none[^"']*["'][^>]*>[\s\S]*?<\/svg>/gi, '');
  html = html.replace(/<svg([^>]*)>([\s\S]*?)<\/svg>/gi, (m, attrs, inner) => {
    const useM = inner.match(/<use[^>]*\shref\s*=\s*["']#([\w-]+)["'][^>]*\/?\s*>/i);
    if (!useM) return m;
    const sym = symbols[useM[1]];
    if (!sym) return m;
    const vb = /\bviewBox\s*=/i.test(attrs) ? '' : ` viewBox="${sym.viewBox}"`;
    return `<svg${attrs}${vb}>${sym.body}</svg>`;
  });
  return html;
}

function dropSpriteLike(canvas) {
  canvas.children = (canvas.children || []).filter((c) => !(c.type === 'VECTOR' && !c.vectorPaths && (!c.fills || !c.fills.length) && c.children && c.children.length));
}

function flattenVectors(node) {
  if (node.type === 'VECTOR' && node.children && node.children.length) {
    const out = { paths: [], strokes: [], fills: [], strokeWeight: null };
    const collect = (n) => {
      if (!n || typeof n !== 'object') return;
      if (Array.isArray(n.vectorPaths) && n.vectorPaths.length) {
        out.paths.push(...n.vectorPaths);
        if (n.strokes && n.strokes.length) out.strokes = n.strokes;
        if (n.fills && n.fills.length) out.fills = n.fills;
        if (typeof n.strokeWeight === 'number') out.strokeWeight = n.strokeWeight;
      }
      (n.children || []).forEach(collect);
    };
    collect(node);
    if (out.paths.length) {
      node.vectorPaths = out.paths;
      if (out.strokes.length) node.strokes = out.strokes;
      if (out.fills.length) node.fills = out.fills;
      if (out.strokeWeight !== null) node.strokeWeight = out.strokeWeight;
    }
    delete node.children;
  }
  (node.children || []).forEach(flattenVectors);
}

function postProcess(data) {
  const canvas = data.document && data.document.children && data.document.children[0];
  if (canvas) {
    dropSpriteLike(canvas);
    (canvas.children || []).forEach(flattenVectors);
  }
  return data;
}

function normalizePage(data, viewport, bgColor) {
  const canvas = data.document && data.document.children && data.document.children[0];
  if (!canvas || !canvas.children || !canvas.children.length) return data;
  const roots = canvas.children.map((r) => {
    if (r.type === 'FRAME' || r.type === 'TEXT' || r.type === 'VECTOR') {
      if (!(typeof r.width === 'number' && r.width > 0)) r.width = viewport.width;
    }
    return r;
  });
  const page = {
    type: 'FRAME',
    name: canvas.name || 'Page',
    width: viewport.width,
    height: viewport.height,
    layoutMode: 'VERTICAL',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    fills: [{ type: 'SOLID', color: bgColor }],
    children: roots,
  };
  canvas.children = [page];
  return data;
}

async function buildTarget(pagePath, viewport, cssPath) {
  let html = await fs.readFile(pagePath, 'utf-8');
  const dir = path.dirname(pagePath);
  html = inlineSvgUse(html);
  const html2 = await absolutizeImages(html, dir);

  const ip = new FileImageProcessor();
  ip.setBaseUrl(pathToFileURL(pagePath).href);
  const images = await ip.processHtmlImages(html2);

  const css = cssPath ? await fs.readFile(cssPath, 'utf-8') : '';
  const conv = new CodeToFigmaConverter();
  conv.setImageProcessor(ip);
  conv.setImages(images);
  const data = await conv.convert(html2, css, { viewport });
  sanitize(data);
  postProcess(data);
  return data;
}

function parseColor(str) {
  if (!str) return null;
  const s = str.trim();
  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return { r, g, b, a: 1 };
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: 1,
      };
    }
    if (/^[0-9a-fA-F]{8}$/.test(hex)) {
      return {
        r: parseInt(hex.slice(0, 2), 16) / 255,
        g: parseInt(hex.slice(2, 4), 16) / 255,
        b: parseInt(hex.slice(4, 6), 16) / 255,
        a: parseInt(hex.slice(6, 8), 16) / 255,
      };
    }
    return null;
  }
  if (/^rgba?\(/i.test(s)) {
    const m = s.match(/[\d.]+/g);
    if (m && m.length >= 3) {
      return {
        r: parseFloat(m[0]) / 255,
        g: parseFloat(m[1]) / 255,
        b: parseFloat(m[2]) / 255,
        a: m[3] !== undefined ? parseFloat(m[3]) : 1,
      };
    }
  }
  if (/^hsla?\(/i.test(s)) {
    const m = s.match(/[\d.%]+/g);
    if (m && m.length >= 3) {
      const h = parseFloat(m[0]);
      const sat = parseFloat(m[1]) / 100;
      const li = parseFloat(m[2]) / 100;
      const a = m[3] !== undefined ? parseFloat(m[3]) : 1;
      const c = (1 - Math.abs(2 * li - 1)) * sat;
      const hp = (h % 360 + 360) % 360 / 60;
      const x = c * (1 - Math.abs((hp % 2) - 1));
      let r = 0, g = 0, b = 0;
      if (hp < 1) { r = c; g = x; } else if (hp < 2) { r = x; g = c; }
      else if (hp < 3) { g = c; b = x; } else if (hp < 4) { g = x; b = c; }
      else if (hp < 5) { r = x; b = c; } else { r = c; b = x; }
      const mm = li - c / 2;
      return { r: r + mm, g: g + mm, b: b + mm, a };
    }
  }
  return null;
}

function resolveVar(value, vars, seen = new Set()) {
  const re = /var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g;
  return value.replace(re, (m, name, fallback) => {
    if (seen.has(name)) return fallback || '#000000';
    seen.add(name);
    const raw = vars.get(name);
    return raw !== undefined ? resolveVar(raw, vars, seen) : (fallback || '#000000');
  });
}

async function parseCssVars(cssPath) {
  const css = await fs.readFile(cssPath, 'utf-8');
  const blockMatch = css.match(/:root\s*{([^}]*)}/);
  if (!blockMatch) return new Map();
  const vars = new Map();
  const lines = blockMatch[1].split('\n');
  for (const line of lines) {
    const m = line.match(/^\s*(--[\w-]+)\s*:\s*(.+?)\s*;?\s*$/);
    if (m) vars.set(m[1], m[2]);
  }
  return vars;
}

function makeTokensFrame(vars) {
  const order = [];
  for (const [name, raw] of vars) {
    const value = resolveVar(raw, vars);
    const color = parseColor(value);
    order.push({ name, raw: raw.trim(), value: value.trim(), color });
  }

  const categories = [];
  const byCat = new Map();
  const catOf = (name) => {
    if (/^(bg|surface|fg|muted|meta|placeholder|border|accent|yellow|amber|lime|success|warn|danger|sport)/.test(name)) return 'Colors';
    if (/^(font|fs-|leading|tracking)/.test(name)) return 'Typography';
    if (/^space-/.test(name)) return 'Spacing';
    if (/^radius-/.test(name)) return 'Radius';
    if (/^(shadow|elev)/.test(name)) return 'Elevation';
    if (/^(dur|motion|ease)/.test(name)) return 'Motion';
    return 'Other';
  };
  for (const item of order) {
    const cat = catOf(item.name);
    if (!byCat.has(cat)) {
      byCat.set(cat, []);
      categories.push(cat);
    }
    byCat.get(cat).push(item);
  }

  const PAD = 24;
  const GAP = 4;
  const ROW_H = 26;
  const WIDTH = 380;
  const nameW = 150;
  const valueW = 170;
  let y = PAD;

  const children = [];
  for (const cat of categories) {
    children.push({
      type: 'TEXT', name: 'Category', characters: cat.toUpperCase(),
      x: PAD, y,
      style: { fontFamily: 'Inter', fontSize: 12, fontWeight: 700, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: { unit: 'PIXELS', value: 0.5 } },
      fills: [{ type: 'SOLID', color: { r: 0.44, g: 0.49, b: 0.6, a: 1 } }],
    });
    y += 22;
    for (const item of byCat.get(cat)) {
      const row = [];
      if (item.color) {
        row.push({
          type: 'RECTANGLE', name: 'swatch', x: PAD, y: y + 4, width: 18, height: 18,
          cornerRadius: 4,
          fills: [{ type: 'SOLID', color: { r: item.color.r, g: item.color.g, b: item.color.b }, opacity: item.color.a }],
          strokes: [{ type: 'SOLID', color: { r: 0, g: 0, b: 0 }, opacity: 0.08 }],
          strokeWeight: 1,
        });
      }
      row.push({
        type: 'TEXT', name: 'name', characters: item.name,
        x: PAD + (item.color ? 30 : 0), y,
        style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 400, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: { unit: 'PIXELS', value: 0 } },
        fills: [{ type: 'SOLID', color: { r: 0.1, g: 0.12, b: 0.18, a: 1 } }],
      });
      row.push({
        type: 'TEXT', name: 'value', characters: item.value,
        x: PAD + nameW, y,
        style: { fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 400, lineHeight: { unit: 'PIXELS', value: 16 }, letterSpacing: { unit: 'PIXELS', value: 0 } },
        fills: [{ type: 'SOLID', color: { r: 0.44, g: 0.49, b: 0.6, a: 1 } }],
      });
      children.push(...row);
      y += ROW_H;
    }
    y += 8;
  }

  return {
    type: 'FRAME', name: 'Design Tokens',
    x: 0, y: 0, width: WIDTH, height: y + PAD,
    fills: [{ type: 'SOLID', color: { r: 1, g: 1, b: 1, a: 1 } }],
    children,
  };
}

const targets = [
  { name: '06-home', page: path.join(ROOT, 'screens/06-home.html'), viewport: { width: 430, height: 932 }, css: path.join(ROOT, 'assets/ds.css') },
  { name: '07-add-event', page: path.join(ROOT, 'screens/07-add-event.html'), viewport: { width: 430, height: 932 }, css: path.join(ROOT, 'assets/ds.css') },
  { name: '07-calendar', page: path.join(ROOT, 'screens/07-calendar.html'), viewport: { width: 430, height: 932 }, css: path.join(ROOT, 'assets/ds.css') },
  { name: 'design-system', page: path.join(ROOT, 'design-system.html'), viewport: { width: 1100, height: 2400 }, css: null },
];

const outDir = path.join(ROOT, 'figma-export');
await fs.mkdir(outDir, { recursive: true });

const vars = await parseCssVars(path.join(ROOT, 'assets/ds.css'));
const bgRaw = vars.get('--bg');
const bgColor = parseColor(bgRaw) || { r: 0.933, g: 0.945, b: 0.969, a: 1 };

for (const t of targets) {
  const data = await buildTarget(t.page, t.viewport, t.css);
  if (t.name !== 'design-system') normalizePage(data, t.viewport, bgColor);
  const out = path.join(outDir, `${t.name}.fig.json`);
  await fs.writeFile(out, JSON.stringify(data, null, 2));
  const kb = Math.round((await fs.stat(out)).size / 1024);
  console.log(`OK  ${t.name}.fig.json (${kb} KB)`);
}

const tokensFrame = makeTokensFrame(vars);
const tokensData = {
  document: {
    name: 'Document', type: 'DOCUMENT',
    children: [{
      name: 'Design Tokens', type: 'CANVAS', backgroundColor: { r: 1, g: 1, b: 1, a: 1 },
      children: [tokensFrame],
    }],
  },
  components: {}, componentSets: {}, schemaVersion: 0, styles: { textStyles: {}, colorStyles: {} },
};
const tokensOut = path.join(outDir, 'design-tokens.fig.json');
await fs.writeFile(tokensOut, JSON.stringify(tokensData, null, 2));
console.log(`OK  design-tokens.fig.json (${vars.size} tokens)`);
