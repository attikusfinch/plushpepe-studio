export const facePartNames = {
  eyeLeft: 'Глаз слева', eyeRight: 'Глаз справа',
  buttonLeft: 'Пуговица слева', buttonRight: 'Пуговица справа', mouth: 'Улыбка',
};
export const defaultFacePart = { x: 0, y: 0, rotation: 0, scale: 1, flipX: false };
export const facePart = (face, key) => ({ ...defaultFacePart, ...face?.[key] });

function shapeBounds(layer) {
  const points = [];
  const walk = items => {
    for (const item of items || []) {
      if (item.ty === 'gr') walk(item.it);
      if (item.ty === 'sh' && item.ks?.k?.v) points.push(...item.ks.k.v);
    }
  };
  walk(layer.shapes);
  if (!points.length) return null;
  const x = points.map(p => p[0]), y = points.map(p => p[1]);
  const bounds = { x: Math.min(...x), y: Math.min(...y), width: Math.max(...x) - Math.min(...x), height: Math.max(...y) - Math.min(...y) };
  return { ...bounds, pivot: [bounds.x + bounds.width / 2, bounds.y + bounds.height / 2] };
}

export function faceLayout(source) {
  const layers = source.layers.filter(layer => layer.nm?.startsWith('Source face /')).map(layer => ({ layer, box: shapeBounds(layer) })).filter(item => item.box);
  const eyes = layers.filter(item => /\beye(?: \d+)?$/i.test(item.layer.nm)).sort((a, b) => a.box.pivot[0] - b.box.pivot[0]);
  const buttons = layers.filter(item => /\bzr(?: \d+)?$/i.test(item.layer.nm)).sort((a, b) => a.box.pivot[0] - b.box.pivot[0]);
  const mouth = layers.find(item => /\bmouth(?: \d+)?$/i.test(item.layer.nm));
  if (eyes.length !== 2 || buttons.length < 2 || !mouth) return null;
  const buttonGroups = eyes.map(() => []);
  for (const button of buttons) {
    const distances = eyes.map(eye => Math.hypot(...eye.box.pivot.map((value, axis) => value - button.box.pivot[axis])));
    buttonGroups[distances[0] <= distances[1] ? 0 : 1].push(button);
  }
  if (buttonGroups.some(group => !group.length)) return null;
  const layout = {};
  for (const [key, item] of Object.entries({ eyeLeft: eyes[0], eyeRight: eyes[1], mouth })) {
    layout[key] = { ...item.box, ids: [item.layer.ind] };
  }
  for (const [index, key] of ['buttonLeft', 'buttonRight'].entries()) {
    const group = buttonGroups[index];
    const x = Math.min(...group.map(item => item.box.x)), y = Math.min(...group.map(item => item.box.y));
    const width = Math.max(...group.map(item => item.box.x + item.box.width)) - x;
    const height = Math.max(...group.map(item => item.box.y + item.box.height)) - y;
    layout[key] = { x, y, width, height, pivot: [x + width / 2, y + height / 2], ids: group.map(item => item.layer.ind) };
  }
  layout.buttonLeft.parent = 'eyeLeft'; layout.buttonRight.parent = 'eyeRight';
  // Carry each source shadow with the feature that casts it.
  const assigned = new Set(Object.values(layout).flatMap(part => part.ids));
  for (const item of layers.filter(item => !assigned.has(item.layer.ind))) {
    const key = ['eyeLeft', 'eyeRight', 'mouth'].sort((a, b) => Math.hypot(...layout[a].pivot.map((v, i) => v - item.box.pivot[i])) - Math.hypot(...layout[b].pivot.map((v, i) => v - item.box.pivot[i])))[0];
    layout[key].ids.push(item.layer.ind);
  }
  return layout;
}

export function applyFace(source, face = {}) {
  if (!Object.keys(face).length) return;
  const layout = faceLayout(source);
  if (!layout) return;
  const indices = { eyeLeft: 8100, eyeRight: 8101, mouth: 8102, buttonLeft: 8110, buttonRight: 8111 };
  for (const [key, part] of Object.entries(layout)) {
    const edit = facePart(face, key);
    for (const layer of source.layers) if (part.ids.includes(layer.ind)) layer.parent = indices[key];
    source.layers.push({
      ty: 3, ind: indices[key], nm: `Face adjustment / ${key}`, parent: part.parent ? indices[part.parent] : 900,
      ip: source.ip, op: source.op, st: 0, sr: 1, ddd: 0,
      ks: { o: { a: 0, k: 100 }, p: { a: 0, k: [part.pivot[0] + edit.x, part.pivot[1] + edit.y, 0] },
        a: { a: 0, k: [...part.pivot, 0] }, r: { a: 0, k: edit.rotation },
        s: { a: 0, k: [edit.scale * (edit.flipX ? -100 : 100), edit.scale * 100, 100] } },
    });
  }
}

export function validFace(face) {
  if (!face || typeof face !== 'object' || Array.isArray(face)) return false;
  return Object.entries(face).every(([key, edit]) => {
    if (!facePartNames[key] || !edit || typeof edit !== 'object' || Array.isArray(edit)) return false;
    return Object.entries(edit).every(([property, value]) => {
      if (property === 'flipX') return typeof value === 'boolean';
      if (!['x', 'y', 'rotation', 'scale'].includes(property) || !Number.isFinite(value)) return false;
      return property === 'scale' ? value >= .2 && value <= 3 : Math.abs(value) <= 1000;
    });
  });
}

export function validFacePresets(presets) {
  return !!presets && typeof presets === 'object' && !Array.isArray(presets) && Object.entries(presets).every(([id, face]) => /^0(3[4-9]|[4-7]\d|8[0-3])$/.test(id) && validFace(face));
}

export function levelEyes(face, layout) {
  const left = facePart(face, 'eyeLeft'), right = facePart(face, 'eyeRight');
  const level = (layout.eyeLeft.pivot[1] + left.y + layout.eyeRight.pivot[1] + right.y) / 2;
  return { ...face, eyeLeft: { ...left, y: level - layout.eyeLeft.pivot[1] }, eyeRight: { ...right, y: level - layout.eyeRight.pivot[1] } };
}

export function buttonsToLeft(face, layout) {
  const next = structuredClone(face);
  for (const side of ['Left', 'Right']) {
    const eye = layout[`eye${side}`], button = layout[`button${side}`];
    next[`button${side}`] = { ...facePart(face, `button${side}`), x: eye.pivot[0] - eye.width * .12 - button.pivot[0] };
  }
  return next;
}
