import { deformLimb, limbRigs } from './rig.js';
import { applyFace, validFace, validFacePresets } from './face.js';

export const uid = () => crypto.randomUUID();
export const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export const neutralPose = { leftArm: 0, rightArm: 0, leftLeg: 0, rightLeg: 0 };
export const poses = [
  { id: 'stand', name: 'Стоит', values: neutralPose },
  { id: 'hello', name: 'Привет', values: { leftArm: 0, rightArm: -145, leftLeg: 0, rightLeg: -3 } },
  { id: 'hug', name: 'Обнимашки', values: { leftArm: 67, rightArm: -65, leftLeg: 0, rightLeg: -3 } },
  { id: 'yay', name: 'Ура!', values: { leftArm: 135, rightArm: -145, leftLeg: 10, rightLeg: -12 } },
  { id: 'step', name: 'Шагает', values: { leftArm: -18, rightArm: 20, leftLeg: 23, rightLeg: -19 } },
  { id: 'dance', name: 'Танцует', values: { leftArm: 102, rightArm: -48, leftLeg: 22, rightLeg: -12 } },
];

// Coordinates are in the original 002 vector space, before the framing transform.
export const joints = {
  leftArm: { limb: 6, grey: 102, pivot: [181, 322] },
  rightArm: { limb: 12, grey: 106, pivot: [333, 336] },
  leftLeg: { limb: 9, grey: 103, pivot: [210, 411] },
  rightLeg: { limb: 11, grey: 105, pivot: [304, 410] },
};

export function poseModel(source, pose = neutralPose, bones = {}, face = {}) {
  const data = structuredClone(source);
  data.w = data.h = 768;
  const root = data.layers.find(layer => layer.ind === 900);
  if (!root) throw new Error('В модели отсутствует корневой слой.');
  root.ks.p.k[0] += 128;
  root.ks.p.k[1] += 128;
  const grey = data.layers.some(layer => layer.ind === 102);
  for (const [key, { limb, grey: greyId, pivot }] of Object.entries(joints)) {
    const ids = grey ? [greyId] : [4000 + limb, 6000 + limb, 6100 + limb];
    for (const layer of data.layers.filter(layer => ids.includes(layer.ind))) {
      layer.ks.a = { a: 0, k: [...pivot, 0] };
      layer.ks.p = { a: 0, k: [...pivot, 0] };
      layer.ks.r = { a: 0, k: clamp(Number(pose[key]) || 0, -150, 150) };
      // The original far arm extends under the torso. Clip that hidden root
      // before rotation so it cannot emerge below the belly in raised poses.
      if (key === 'rightArm') {
        layer.hasMask = true;
        layer.masksProperties = [{ inv: false, mode: 'a', x: { a: 0, k: 0 }, o: { a: 0, k: 100 },
          pt: { a: 0, k: { v: [[321, 318], [390, 318], [390, 480], [321, 480]],
            i: [[0,0],[0,0],[0,0],[0,0]], o: [[0,0],[0,0],[0,0],[0,0]], c: true } } }];
      }
      deformLimb(layer, key, bones?.[key]);
    }
  }
  applyFace(data, face);
  return data;
}

export function baseLayer(type, name, overrides = {}) {
  return { id: uid(), type, name, x: 540, y: 540, width: 540, height: 540,
    rotation: 0, opacity: 1, visible: true, locked: false, flipX: false, flipY: false, ...overrides };
}

export function initialProject() {
  return { version: 1, name: 'Маленький plush-мир', canvas: { width: 1080, height: 1080, background: '#eeedf5', transparent: false }, assets: {}, layers: [
    baseLayer('text', 'PLUSH CLUB', { text: 'PLUSH CLUB', x: 540, y: 186, width: 900, height: 110, fontSize: 104, color: '#39344c', fontStyle: 'bold' }),
    baseLayer('text', 'made of little happy things', { text: 'made of little happy things', x: 540, y: 288, width: 850, height: 50, fontSize: 28, color: '#8a839d', fontStyle: 'normal' }),
    baseLayer('pepe', 'Pepe 034 · радуга', { modelId: '034', x: 280, y: 646, width: 630, height: 630, rotation: -8, pose: { ...poses[2].values } }),
    baseLayer('pepe', 'Pepe 071 · ниндзя', { modelId: '071', x: 812, y: 660, width: 600, height: 600, rotation: 9, pose: { ...poses[1].values } }),
    baseLayer('pepe', 'Pepe 083 · космос', { modelId: '083', x: 534, y: 622, width: 790, height: 790, pose: { ...neutralPose } }),
    baseLayer('text', 'A VERY SOFT UNIVERSE', { text: 'A VERY SOFT UNIVERSE', x: 540, y: 954, width: 800, height: 40, fontSize: 20, color: '#938caa', fontStyle: 'normal' }),
  ] };
}

export function validateProject(raw) {
  const fail = () => { throw new Error('Не удалось открыть проект: неверный формат Plush Pepe Studio.'); };
  if (!raw || raw.version !== 1 || !Array.isArray(raw.layers) || raw.layers.length > 200 || !raw.canvas || !raw.assets || typeof raw.assets !== 'object' || Array.isArray(raw.assets)) fail();
  for (const key of ['width', 'height']) if (!Number.isInteger(raw.canvas[key]) || raw.canvas[key] < 64 || raw.canvas[key] > 4096) fail();
  if (typeof raw.canvas.background !== 'string' || !/^#[\da-f]{6}$/i.test(raw.canvas.background)) fail();
  if (raw.modelFaces !== undefined && !validFacePresets(raw.modelFaces)) fail();
  const ids = new Set();
  for (const layer of raw.layers) {
    if (!['pepe', 'sticker', 'image', 'text'].includes(layer.type) || typeof layer.id !== 'string' || ids.has(layer.id)) fail();
    ids.add(layer.id);
    for (const key of ['x', 'y', 'width', 'height', 'rotation', 'opacity']) if (!Number.isFinite(layer[key])) fail();
    if (layer.width < 1 || layer.height < 1 || layer.width > 32768 || layer.height > 32768 || layer.opacity < 0 || layer.opacity > 1) fail();
    if (layer.type === 'pepe' && !/^0(3[4-9]|[4-7]\d|8[0-3])$/.test(layer.modelId)) fail();
    if (layer.face !== undefined && !validFace(layer.face)) fail();
    if (layer.bones !== undefined) {
      if (!layer.bones || typeof layer.bones !== 'object' || Array.isArray(layer.bones)) fail();
      for (const [key, points] of Object.entries(layer.bones)) {
        if (!limbRigs[key] || !Array.isArray(points) || points.length !== 3 || points.some(point => !Array.isArray(point) || point.length !== 2 || point.some(value => !Number.isFinite(value) || Math.abs(value) > 10000))) fail();
      }
    }
    if (layer.type === 'sticker' && !/^0(0[1-9]|[1-7]\d|8[0-3])$/.test(layer.stickerId)) fail();
    if (layer.type === 'image' && !raw.assets[layer.assetId]) fail();
    if (layer.type === 'text' && (typeof layer.text !== 'string' || layer.text.length > 10000 || !Number.isFinite(layer.fontSize) || layer.fontSize < 1 || layer.fontSize > 600)) fail();
  }
  for (const asset of Object.values(raw.assets)) {
    if (!asset || typeof asset.data !== 'string' || !/^data:[\w.+/-]+(?:;[\w=.+-]+)*;base64,/.test(asset.data) || !['image', 'lottie', 'gif', 'webp', 'video'].includes(asset.kind)) fail();
  }
  return structuredClone(raw);
}
