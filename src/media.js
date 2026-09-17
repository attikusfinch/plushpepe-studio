import lottie from 'lottie-web/build/player/lottie_light';
import { ungzip } from 'pako';
import { parseGIF, decompressFrames } from 'gifuct-js';
import { poseModel } from './core';
import Konva from 'konva';

const modelCache = new Map();
const stickerCache = new Map();

export async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error('Не удалось загрузить файл.');
  return response.json();
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Изображение не удалось прочитать.'));
    image.src = src;
  });
}

function surface(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  return canvas;
}

export function checkLottie(data) {
  if (!Array.isArray(data.layers) || !Number.isFinite(data.w) || !Number.isFinite(data.h) || data.w < 1 || data.h < 1 || data.w > 4096 || data.h > 4096 || !Number.isFinite(data.op) || !Number.isFinite(data.ip) || data.op <= data.ip || !Number.isFinite(data.fr) || data.fr <= 0) throw new Error('Файл не содержит поддерживаемую Lottie-анимацию.');
  if (data.assets?.some(asset => asset.p && !asset.p.startsWith('data:'))) throw new Error('В Lottie есть внешние картинки. Экспортируйте JSON со встроенными изображениями.');
  return data;
}

export function lottieSource(data, resolution = 1) {
  checkLottie(data);
  const canvas = surface(Math.round(data.w * resolution), Math.round(data.h * resolution));
  const container = document.createElement('div');
  const animation = lottie.loadAnimation({ container, renderer: 'svg', loop: false, autoplay: false,
    animationData: structuredClone(data), rendererSettings: { progressiveLoad: false, hideOnTransparent: false } });
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Не удалось подготовить анимацию.')), 15000);
    const finish = () => { clearTimeout(timer); resolve(); };
    animation.addEventListener('DOMLoaded', finish);
    animation.addEventListener('data_failed', () => { clearTimeout(timer); reject(new Error('Ошибка Lottie.')); });
    if (animation.isLoaded) finish();
  });
  return { width: data.w, height: data.h, frames: Math.max(1, Math.ceil(data.op - data.ip)), fps: data.fr,
    async draw(frame) {
      await ready; animation.goToAndStop(frame, true);
      const svg = container.querySelector('svg');
      svg.setAttribute('width', canvas.width); svg.setAttribute('height', canvas.height);
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' }));
      try { const image = await loadImage(url); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(image, 0, 0, canvas.width, canvas.height); return canvas; }
      finally { URL.revokeObjectURL(url); }
    },
    dispose() { animation.destroy(); } };
}

async function modelSource(modelId, pose, resolution = 1) {
  if (!modelCache.has(modelId)) modelCache.set(modelId, fetchJSON(`/models/standing/lottie/${modelId}.json`));
  return lottieSource(poseModel(await modelCache.get(modelId), pose), resolution);
}

async function stickerSource(stickerId, resolution = 1) {
  if (!stickerCache.has(stickerId)) stickerCache.set(stickerId, fetch(`/stickers/${stickerId}.tgs`).then(async response => {
    if (!response.ok) throw new Error('Стикер не загрузился.');
    return JSON.parse(ungzip(new Uint8Array(await response.arrayBuffer()), { to: 'string' }));
  }));
  return lottieSource(await stickerCache.get(stickerId), resolution);
}

function gifSource(bytes) {
  const data = parseGIF(bytes);
  const frames = decompressFrames(data, true);
  if (!frames.length || data.lsd.width * data.lsd.height * frames.length > 180000000) throw new Error('GIF слишком большой. Выберите файл с меньшим числом кадров.');
  const canvas = surface(data.lsd.width, data.lsd.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const patch = surface(canvas.width, canvas.height);
  const px = patch.getContext('2d');
  let index = -1; let previous = null;
  return { width: canvas.width, height: canvas.height, frames: frames.length, fps: 1000 / (frames.reduce((sum, f) => sum + (f.delay || 100), 0) / frames.length),
    async draw(target) {
      if (target < index) { ctx.clearRect(0, 0, canvas.width, canvas.height); index = -1; previous = null; }
      while (index < target) {
        if (index >= 0) {
          const old = frames[index];
          if (old.disposalType === 2) ctx.clearRect(old.dims.left, old.dims.top, old.dims.width, old.dims.height);
          if (old.disposalType === 3 && previous) ctx.putImageData(previous, 0, 0);
        }
        const frame = frames[++index];
        previous = frame.disposalType === 3 ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;
        patch.width = frame.dims.width; patch.height = frame.dims.height;
        px.putImageData(new ImageData(frame.patch, frame.dims.width, frame.dims.height), 0, 0);
        ctx.drawImage(patch, frame.dims.left, frame.dims.top);
      }
      return canvas;
    }, dispose() {} };
}

async function webpSource(bytes, dataUrl) {
  if (!('ImageDecoder' in window)) {
    // Static WebP is supported everywhere; animated WebP needs frame decoding.
    if (new TextDecoder().decode(bytes.slice(0, 200)).includes('ANIM')) throw new Error('Для кадров анимированного WebP откройте Studio в Chrome или Edge.');
    const image = await loadImage(dataUrl);
    return { width: image.width, height: image.height, frames: 1, fps: 1, draw: async () => image, dispose() {} };
  }
  const decoder = new ImageDecoder({ data: bytes, type: 'image/webp' });
  await decoder.tracks.ready;
  await decoder.completed;
  const first = await decoder.decode({ frameIndex: 0 });
  const canvas = surface(first.image.displayWidth, first.image.displayHeight);
  const fps = first.image.duration ? 1000000 / first.image.duration : 30;
  first.image.close();
  return { width: canvas.width, height: canvas.height, frames: decoder.tracks.selectedTrack.frameCount, fps,
    async draw(frame) { const decoded = await decoder.decode({ frameIndex: frame }); const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(decoded.image, 0, 0); decoded.image.close(); return canvas; },
    dispose() { decoder.close(); } };
}

async function videoSource(url) {
  const video = document.createElement('video');
  video.muted = true; video.preload = 'auto'; video.src = url;
  await new Promise((resolve, reject) => { video.onloadeddata = resolve; video.onerror = () => reject(new Error('Браузер не поддерживает этот видеофайл.')); });
  if (!Number.isFinite(video.duration)) throw new Error('В видео нет длительности. Пересохраните файл.');
  const canvas = surface(video.videoWidth, video.videoHeight);
  return { width: canvas.width, height: canvas.height, frames: Math.max(1, Math.ceil(video.duration * 30)), fps: 30, video: true,
    async draw(frame) {
      const time = Math.min(Math.max(0, video.duration - 0.001), frame / 30);
      if (Math.abs(video.currentTime - time) > 0.0001) await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Не удалось выбрать момент видео.')), 10000);
        video.onseeked = () => { clearTimeout(timer); resolve(); }; video.currentTime = time;
      });
      const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(video, 0, 0); return canvas;
    }, dispose() { video.removeAttribute('src'); video.load(); } };
}

async function assetSource(asset, resolution = 1) {
  if (asset.kind === 'image') {
    const image = await loadImage(asset.data);
    return { width: image.width, height: image.height, frames: 1, fps: 1, draw: async () => image, dispose() {} };
  }
  if (asset.kind === 'video') return videoSource(asset.data);
  const bytes = new Uint8Array(await (await fetch(asset.data)).arrayBuffer());
  if (asset.kind === 'lottie') return lottieSource(JSON.parse(new TextDecoder().decode(bytes)), resolution);
  if (asset.kind === 'gif') return gifSource(bytes);
  return webpSource(bytes, asset.data);
}

export async function createSource(layer, assets, resolution = 1) {
  if (layer.type === 'pepe') return modelSource(layer.modelId, layer.pose, resolution);
  if (layer.type === 'sticker') return stickerSource(layer.stickerId, resolution);
  return assetSource(assets[layer.assetId], resolution);
}

export async function renderLayer(layer, assets, resolution = 1) {
  // Short-lived renderer for export: independent from the displayed frame.
  const source = await createSource(layer, assets, resolution);
  try {
    const rendered = await source.draw(Math.min(source.frames - 1, Math.max(0, layer.frame || 0)));
    const canvas = surface(source.width * resolution, source.height * resolution);
    canvas.getContext('2d').drawImage(rendered, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally { source.dispose(); }
}

export const readDataUrl = file => new Promise((resolve, reject) => {
  const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file);
});

export async function importAsset(file) {
  if (file.size > 40 * 1024 * 1024) throw new Error(`${file.name}: файл больше 40 МБ.`);
  const ext = file.name.split('.').pop().toLowerCase();
  let kind = ['tgs', 'json'].includes(ext) ? 'lottie' : ext === 'gif' ? 'gif' : ext === 'webp' ? 'webp' : ['webm', 'mp4'].includes(ext) ? 'video' : 'image';
  if (!['tgs', 'json', 'gif', 'webp', 'webm', 'mp4', 'png', 'jpg', 'jpeg', 'svg', 'avif'].includes(ext)) throw new Error(`${file.name}: поддерживаются PNG, JPG, WebP, GIF, SVG, AVIF, TGS, Lottie JSON, WebM и MP4.`);
  let data;
  if (kind === 'lottie') {
    const raw = ext === 'tgs' ? ungzip(new Uint8Array(await file.arrayBuffer()), { to: 'string' }) : await file.text();
    const parsed = checkLottie(JSON.parse(raw));
    data = await readDataUrl(new Blob([JSON.stringify(parsed)], { type: 'application/json' }));
  } else data = await readDataUrl(file);
  const asset = { id: crypto.randomUUID(), name: file.name, kind, data };
  const source = await assetSource(asset);
  try {
    if (source.width > 10000 || source.height > 10000 || source.width * source.height > 50000000) throw new Error('Слишком большое изображение. Уменьшите его до 50 мегапикселей.');
    const frame = await source.draw(0);
    const thumb = surface(160, 160); const ratio = Math.min(160 / source.width, 160 / source.height);
    thumb.getContext('2d').drawImage(frame, (160 - source.width * ratio) / 2, (160 - source.height * ratio) / 2, source.width * ratio, source.height * ratio);
    return { ...asset, width: source.width, height: source.height, frames: source.frames, fps: source.fps, thumbnail: thumb.toDataURL('image/png') };
  } finally { source.dispose(); }
}

export async function exportComposition(project, format = 'png', multiplier = 1) {
  const { width, height, transparent, background } = project.canvas;
  const canvas = surface(width * multiplier, height * multiplier);
  const ctx = canvas.getContext('2d'); ctx.scale(multiplier, multiplier);
  if (!transparent || format === 'jpeg') { ctx.fillStyle = transparent ? '#ffffff' : background; ctx.fillRect(0, 0, width, height); }
  for (const layer of project.layers.filter(layer => layer.visible)) {
    ctx.save(); ctx.translate(layer.x, layer.y); ctx.rotate(layer.rotation * Math.PI / 180); ctx.scale(layer.flipX ? -1 : 1, layer.flipY ? -1 : 1); ctx.globalAlpha = layer.opacity;
    if (layer.type === 'text') {
      const text = new Konva.Text({ text: layer.text, width: layer.width, height: layer.height, fontFamily: 'Arial', fontSize: layer.fontSize, fontStyle: layer.fontStyle || 'normal', fill: layer.color, align: 'center', verticalAlign: 'middle', lineHeight: 1.2, wrap: 'none', ellipsis: false });
      const bitmap = text.toCanvas({ pixelRatio: multiplier, x: 0, y: 0, width: layer.width, height: layer.height });
      ctx.drawImage(bitmap, -layer.width / 2, -layer.height / 2, layer.width, layer.height); text.destroy();
    } else {
      const intrinsic = layer.type === 'pepe' ? 768 : layer.type === 'sticker' ? 512 : Math.max(project.assets[layer.assetId]?.width || 512, project.assets[layer.assetId]?.height || 512);
      const image = await renderLayer(layer, project.assets, Math.max(1, Math.max(layer.width, layer.height) * multiplier / intrinsic));
      ctx.drawImage(image, -layer.width / 2, -layer.height / 2, layer.width, layer.height);
    }
    ctx.restore();
  }
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Экспорт не удался.')), `image/${format}`, 0.94));
}

export function download(blob, filename) {
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
