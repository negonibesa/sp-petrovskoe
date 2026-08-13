/* Fig JSON Import — локальный бесплатный плагин импорта .fig.json на активную страницу */
figma.showUI(__html__, { width: 300, height: 240, themeColors: true });

function status(text, ok, done) {
  figma.ui.postMessage({ type: 'status', text, ok: ok !== false, done: !!done });
}

function base64ToUint8(b64) {
  const s = b64.includes(',') ? b64.split(',')[1] : b64;
  const bin = atob(s);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function figmaWeightName(weight) {
  const map = {
    100: 'Thin', 200: 'Extra Light', 300: 'Light', 400: 'Regular',
    500: 'Medium', 600: 'Semi Bold', 700: 'Bold', 800: 'Extra Bold', 900: 'Black',
  };
  return map[weight] || 'Regular';
}

function styleName(weight, italic) {
  const base = weight === 400 ? 'Regular' : figmaWeightName(weight);
  if (!italic) return base;
  return base === 'Regular' ? 'Italic' : `${base} Italic`;
}

const fontCache = {};
async function resolveFont(family, weight, italic) {
  const candidates = [];
  const exact = styleName(weight, italic);
  candidates.push({ family, style: exact });
  if (weight === 400) candidates.push({ family, style: 'Italic' });
  candidates.push({ family, style: 'Regular' });
  candidates.push({ family: 'Inter', style: 'Regular' });
  for (const c of candidates) {
    const key = `${c.family}|${c.style}`;
    if (fontCache[key]) return fontCache[key];
    try {
      await figma.loadFontAsync(c);
      fontCache[key] = c;
      return c;
    } catch (e) { /* try next */ }
  }
  return { family: 'Inter', style: 'Regular' };
}

function num(v) {
  return typeof v === 'number' && !Number.isNaN(v) ? v : 0;
}

async function applyFills(node, fills) {
  if (!Array.isArray(fills) || fills.length === 0) return;
  const out = [];
  for (const f of fills) {
    if (!f) continue;
    if (f.type === 'IMAGE') {
      try {
        const img = figma.createImage(base64ToUint8(f.imageHash));
        out.push({ type: 'IMAGE', imageHash: img.hash, scaleMode: f.scaleMode || 'FILL' });
      } catch (e) {
        out.push({ type: 'SOLID', color: { r: 0.9, g: 0.9, b: 0.9 }, opacity: 1 });
      }
    } else if (f.type === 'SOLID' || (f.r !== undefined)) {
      out.push({
        type: 'SOLID',
        color: { r: num(f.r), g: num(f.g), b: num(f.b) },
        opacity: Math.max(0, Math.min(1, num(f.a !== undefined ? f.a : (f.opacity !== undefined ? f.opacity : 1)))),
      });
    }
  }
  node.fills = out;
}

async function applyStrokes(node, strokes) {
  if (!Array.isArray(strokes) || strokes.length === 0) return;
  node.strokes = strokes
    .filter((s) => s && s.r !== undefined)
    .map((s) => ({ type: 'SOLID', color: { r: num(s.r), g: num(s.g), b: num(s.b) }, opacity: s.a !== undefined ? num(s.a) : 1 }));
  if (typeof node.strokeWeight === 'number' || node.type !== 'TEXT') {
    try { node.strokeWeight = 1; } catch (e) {}
  }
}

async function createNode(json, ctx) {
  let node;
  switch (json.type) {
    case 'TEXT': node = figma.createText(); break;
    case 'RECTANGLE': node = figma.createRectangle(); break;
    case 'ELLIPSE': node = figma.createEllipse(); break;
    case 'LINE': node = figma.createLine(); break;
    case 'VECTOR': node = figma.createVector(); break;
    case 'GROUP':
    case 'FRAME':
    default: node = figma.createFrame(); break;
  }
  node.name = json.name || json.type || 'Node';

  if (json.type === 'TEXT') {
    const st = json.style || {};
    const font = await resolveFont(st.fontFamily || 'Inter', st.fontWeight || 400, st.fontStyle === 'italic');
    node.fontName = font;
    node.fontSize = st.fontSize || 16;
    node.characters = json.characters !== undefined ? json.characters : '';
    if (st.lineHeight) node.lineHeight = st.lineHeight;
    if (st.letterSpacing) node.letterSpacing = st.letterSpacing;
    if (st.textAlignHorizontal) node.textAlignHorizontal = st.textAlignHorizontal;
    node.textAutoResize = 'WIDTH_AND_HEIGHT';
    if (typeof json.width === 'number' && json.width > 0) {
      node.textAutoResize = 'NONE';
      node.resize(json.width, Math.max(json.height || 20, 20));
    }
  } else {
    const w = typeof json.width === 'number' ? json.width : 0;
    const h = typeof json.height === 'number' ? json.height : 0;
    if (w > 0 && h > 0) node.resize(w, h);
  }

  if (json.cornerRadius !== undefined && typeof json.cornerRadius === 'number' && !Number.isNaN(json.cornerRadius)) {
    try { node.cornerRadius = json.cornerRadius; } catch (e) {}
  }
  if (json.opacity !== undefined && typeof json.opacity === 'number' && !Number.isNaN(json.opacity)) {
    try { node.opacity = Math.max(0, Math.min(1, json.opacity)); } catch (e) {}
  }
  await applyFills(node, json.fills);
  await applyStrokes(node, json.strokes);
  if (json.strokeWeight && node.type !== 'TEXT') {
    try { node.strokeWeight = json.strokeWeight; } catch (e) {}
  }

  if (json.type === 'VECTOR' && Array.isArray(json.vectorPaths)) {
    try {
      node.vectorPaths = json.vectorPaths.map((vp) => ({
        data: vp.path || vp.data || '',
        windingRule: vp.windingRule || 'NONZERO',
      }));
    } catch (e) {}
  }

  if (node.type === 'FRAME') {
    if (json.layoutMode) { try { node.layoutMode = json.layoutMode; } catch (e) {} }
    if (typeof json.itemSpacing === 'number' && !Number.isNaN(json.itemSpacing)) { try { node.itemSpacing = json.itemSpacing; } catch (e) {} }
    if (typeof json.paddingTop === 'number' && !Number.isNaN(json.paddingTop)) { try { node.paddingTop = json.paddingTop; } catch (e) {} }
    if (typeof json.paddingRight === 'number' && !Number.isNaN(json.paddingRight)) { try { node.paddingRight = json.paddingRight; } catch (e) {} }
    if (typeof json.paddingBottom === 'number' && !Number.isNaN(json.paddingBottom)) { try { node.paddingBottom = json.paddingBottom; } catch (e) {} }
    if (typeof json.paddingLeft === 'number' && !Number.isNaN(json.paddingLeft)) { try { node.paddingLeft = json.paddingLeft; } catch (e) {} }
    if (json.primaryAxisAlignItems) { try { node.primaryAxisAlignItems = json.primaryAxisAlignItems; } catch (e) {} }
    if (json.counterAxisAlignItems) { try { node.counterAxisAlignItems = json.counterAxisAlignItems; } catch (e) {} }
    if (node.layoutMode && node.layoutMode !== 'NONE') {
      const hasW = typeof json.width === 'number' && json.width > 0;
      const hasH = typeof json.height === 'number' && json.height > 0;
      try { node.layoutSizingHorizontal = hasW ? 'FIXED' : 'HUG'; } catch (e) {}
      try { node.layoutSizingVertical = hasH ? 'FIXED' : 'HUG'; } catch (e) {}
    }
  }

  return node;
}

function estimateHeight(json) {
  if (typeof json.height === 'number') return json.height;
  if (json.type === 'TEXT' && json.style) return (json.style.fontSize || 16) * 1.3;
  return 24;
}

async function rebuild(parent, json, ctx) {
  const node = await createNode(json, ctx);

  if (node.type === 'TEXT' || node.type === 'VECTOR' || node.type === 'RECTANGLE' || node.type === 'ELLIPSE' || node.type === 'LINE') {
    return node;
  }

  const children = json.children || [];
  const isAuto = node.type === 'FRAME' && node.layoutMode && node.layoutMode !== 'NONE';

  if (isAuto) {
    for (const c of children) {
      const child = await rebuild(node, c, ctx);
      node.appendChild(child);
    }
  } else {
    let cursorX = typeof json.x === 'number' ? json.x : 0;
    let cursorY = typeof json.y === 'number' ? json.y : 0;
    for (const c of children) {
      const child = await rebuild(node, c, ctx);
      if (typeof c.x === 'number') child.x = c.x;
      else child.x = cursorX;
      if (typeof c.y === 'number') child.y = c.y;
      else child.y = cursorY;
      cursorY += estimateHeight(c) + (node.itemSpacing || 0);
      node.appendChild(child);
    }
  }
  return node;
}

async function importOne(data) {
  const canvas = data.document && data.document.children && data.document.children[0];
  if (!canvas || !Array.isArray(canvas.children)) {
    throw new Error('Некорректный .fig.json (нет document.children[0])');
  }
  const created = [];
  let cursorY = 0;
  for (const frameJson of canvas.children) {
    const node = await rebuild(figma.currentPage, frameJson, {});
    node.x = 0;
    node.y = cursorY;
    figma.currentPage.appendChild(node);
    created.push(node);
    cursorY += (node.height || 0) + 60;
  }
  return created;
}

figma.ui.onmessage = async (msg) => {
  if (!msg || msg.type !== 'import') return;
  const items = msg.items || [];
  try {
    let total = 0;
    for (const item of items) {
      status(`Импорт: ${item.name}…`);
      const data = JSON.parse(item.data);
      const created = await importOne(data);
      total += created.length;
    }
    const createdAll = items.length;
    status(`Готово: импортировано макетов — ${createdAll} (всего фреймов — ${total})`, true, true);
  } catch (e) {
    status(`Ошибка: ${e.message}`, false, true);
  }
};
