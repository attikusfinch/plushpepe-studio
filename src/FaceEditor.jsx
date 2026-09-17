import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Group, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import { X, Smile, FlipHorizontal2, RotateCcw, Undo2, Download, Check } from 'lucide-react';
import { assetUrl } from './assetUrl';
import { getModelData, renderLayer, download } from './media';
import { faceLayout, facePart, facePartNames, levelEyes, buttonsToLeft } from './face';
import { neutralPose, clamp } from './core';

const view = { x: 285, y: 167, scale: 2.1, width: 520, height: 445 };
const coordinates = part => {
  const [x, y] = part.pivot;
  return { x: x * 1.24 + 73, y: y * 1.24 - 33, width: part.width * 1.24, height: part.height * 1.24 };
};

function EditBox({ layout, active, draft, onBegin, onPatch }) {
  const node = useRef(), transformer = useRef();
  const part = layout[active], edit = facePart(draft, active), box = coordinates(part);
  const parent = part.parent ? layout[part.parent] : null;
  const parentEdit = parent ? facePart(draft, part.parent) : null;
  const parentBox = parent ? coordinates(parent) : null;
  useEffect(() => { transformer.current.nodes([node.current]); transformer.current.getLayer().batchDraw(); }, [active]);
  const parentProps = parent ? { x: parentBox.x + parentEdit.x * 1.24, y: parentBox.y + parentEdit.y * 1.24, offsetX: parentBox.x, offsetY: parentBox.y, rotation: parentEdit.rotation, scaleX: parentEdit.scale * (parentEdit.flipX ? -1 : 1), scaleY: parentEdit.scale } : {};
  const update = () => {
    const current = node.current;
    onPatch({ x: clamp((current.x() - box.x) / 1.24, -150, 150), y: clamp((current.y() - box.y) / 1.24, -150, 150), rotation: current.rotation(), scale: clamp(Math.abs(current.scaleX()), .2, 3) });
  };
  return <Group {...parentProps}>
    <Rect ref={node} name="face-control" x={box.x + edit.x * 1.24} y={box.y + edit.y * 1.24} width={box.width} height={box.height} offsetX={box.width / 2} offsetY={box.height / 2} rotation={edit.rotation} scaleX={edit.scale * (edit.flipX ? -1 : 1)} scaleY={edit.scale}
      fill="rgba(169,154,250,0.035)" stroke="#c7f786" strokeWidth={.65} draggable
      onDragStart={onBegin} onTransformStart={onBegin} onDragMove={update} onTransform={update} onDragEnd={update} onTransformEnd={update}
      onMouseEnter={event => { event.target.getStage().container().style.cursor = 'move'; }} onMouseLeave={event => { event.target.getStage().container().style.cursor = ''; }} />
    <Transformer ref={transformer} rotateEnabled flipEnabled={false} keepRatio enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} anchorSize={5} anchorCornerRadius={1.5} anchorStroke="#c7f786" borderStroke="#c7f786" anchorFill="#252a21" rotateAnchorOffset={16} boundBoxFunc={(old, next) => Math.abs(next.width) < 10 || Math.abs(next.height) < 10 ? old : next} />
  </Group>;
}

function ValueInput({ label, value, onChange, min, max, step = 1, suffix }) {
  return <label className="number-field"><span>{label}</span><input type="number" aria-label={label} value={Math.round(value * 100) / 100} min={min} max={max} step={step} onChange={event => { if (event.target.value !== '') onChange(clamp(Number(event.target.value), min, max)); }} /><small>{suffix}</small></label>;
}

export default function FaceEditor({ layer, onApply, onClose }) {
  const [draft, setDraft] = useState(() => structuredClone(layer.face || {}));
  const draftRef = useRef(draft); draftRef.current = draft;
  const [layout, setLayout] = useState(null), [image, setImage] = useState(null);
  const [active, setActive] = useState('eyeRight'), [scope, setScope] = useState('model');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [loaded, setLoaded] = useState(false);
  const [past, setPast] = useState([]);
  const lastInput = useRef({ key: '', time: 0 });
  const capture = () => { setPast(items => [...items.slice(-29), structuredClone(draftRef.current)]); lastInput.current.key = ''; };
  const replace = next => { draftRef.current = next; setDraft(next); };
  const patch = (value, remember = false, key = '') => {
    if (remember && (lastInput.current.key !== key || Date.now() - lastInput.current.time > 600)) capture();
    lastInput.current = { key, time: Date.now() };
    replace({ ...draftRef.current, [active]: { ...facePart(draftRef.current, active), ...value } });
  };
  const action = transform => { capture(); replace(transform(draftRef.current)); };
  const undo = () => { if (!past.length) return; replace(past[past.length - 1]); setPast(items => items.slice(0, -1)); lastInput.current.key = ''; };
  useEffect(() => {
    let canceled = false;
    getModelData(layer.modelId).then(source => { if (!canceled) { setLayout(faceLayout(source)); setLoaded(true); } }).catch(error => setError(error.message));
    return () => { canceled = true; };
  }, [layer.modelId]);
  useEffect(() => {
    let canceled = false;
    const timer = setTimeout(() => {
      renderLayer({ ...layer, pose: neutralPose, bones: {}, face: draft }, {}, 1.5).then(canvas => { if (!canceled) setImage(canvas); }).catch(error => { if (!canceled) setError(error.message); });
    }, 25);
    return () => { canceled = true; clearTimeout(timer); };
  }, [draft, layer.modelId]);
  useEffect(() => {
    const keydown = event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
      if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) { event.preventDefault(); undo(); }
    };
    window.addEventListener('keydown', keydown); return () => window.removeEventListener('keydown', keydown);
  }, [past, busy]);
  const png = async () => {
    setBusy(true);
    try {
      const full = await renderLayer({ ...layer, pose: neutralPose, bones: {}, face: draft }, {});
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
      canvas.getContext('2d').drawImage(full, 128, 128, 512, 512, 0, 0, 512, 512);
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Не удалось сохранить PNG.');
      download(blob, `plush-pepe-${layer.modelId}-retouched.png`);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  };
  const edit = facePart(draft, active);
  return <div className="face-editor-backdrop"><div className="face-editor" role="dialog" aria-modal="true" aria-labelledby="face-editor-title">
    <header className="face-editor-header"><span className="face-editor-icon"><Smile size={23} /></span><div><h2 id="face-editor-title">Мастерская лица <span>Pepe {layer.modelId}</span></h2><p>Подвинь детали, поправь наклон и направление пуговиц.</p></div><button className="icon-button" aria-label="Закрыть мастерскую лица" onClick={onClose}><X size={20} /></button></header>
    <div className="face-editor-body">
      <aside className="face-reference"><h3>Ориентир · 002</h3><div className="face-reference-crop"><img src={assetUrl('/references/002.png')} alt="Лицо оригинального Plush Pepe 002" /></div><p>Слева и справа — как на картинке. Пуговицы можно двигать отдельно от глаз.</p>
        <h3>Быстрая правка</h3><button disabled={!layout} className="button full subtle" onClick={() => action(face => levelEyes(face, layout))}>Глаза на одном уровне</button><button disabled={!layout} className="button full subtle" onClick={() => action(face => buttonsToLeft(face, layout))}>Пуговицы левее</button><button disabled={!layout} className="button full subtle" onClick={() => action(face => ({ ...face, mouth: { ...facePart(face, 'mouth'), rotation: 6 } }))}>Улыбка ровнее</button><button className="text-button" onClick={() => action(() => ({}))}><RotateCcw size={13} />Вернуть исходное лицо</button>
      </aside>
      <div className="face-preview-area"><div className="face-preview-caption"><span>КРУПНЫЙ ПЛАН</span><button className="text-button" disabled={!past.length} onClick={undo}><Undo2 size={14} />Отменить</button></div><div className="face-preview">
        <Stage width={view.width} height={view.height}><Layer><Group x={-view.x * view.scale} y={-view.y * view.scale} scaleX={view.scale} scaleY={view.scale}>
          <KonvaImage image={image} width={768} height={768} listening={false} />
          {layout && <EditBox layout={layout} active={active} draft={draft} onBegin={capture} onPatch={value => patch(value)} />}
        </Group></Layer></Stage>
        {!image && <div className="face-loading">Подготавливаем лицо…</div>}
      </div><p className="face-preview-hint">Тяни рамку для перемещения, уголки — для размера, верхнюю ручку — для поворота.</p>{error && <p className="face-error" role="alert">{error}</p>}{loaded && !layout && <p className="face-error">У этой модели нет отдельных глаз и улыбки: это силуэт.</p>}</div>
      <aside className="face-properties"><h3>Что поправим?</h3><div className="face-part-list">{Object.entries(facePartNames).map(([key, name]) => <button disabled={!layout} className={active === key ? 'active' : ''} key={key} onClick={() => setActive(key)}>{name}{active === key && <Check size={14} />}</button>)}</div>
        <fieldset disabled={!layout}><div className="field-grid"><ValueInput label="Сдвиг X" value={edit.x} min={-150} max={150} onChange={x => patch({ x }, true, `${active}-x`)} /><ValueInput label="Сдвиг Y" value={edit.y} min={-150} max={150} onChange={y => patch({ y }, true, `${active}-y`)} /></div><div className="face-angle"><ValueInput label="Наклон" value={edit.rotation} min={-180} max={180} suffix="°" onChange={rotation => patch({ rotation }, true, `${active}-rotation`)} /></div><label className="range-field"><span>Размер<b>{Math.round(edit.scale * 100)}%</b></span><input type="range" aria-label="Размер детали лица" min={20} max={300} value={edit.scale * 100} onChange={event => patch({ scale: Number(event.target.value) / 100 }, true, `${active}-scale`)} /></label><button className={`button full subtle ${edit.flipX ? 'face-mirrored' : ''}`} aria-pressed={edit.flipX} onClick={() => patch({ flipX: !edit.flipX }, true, 'flip')}><FlipHorizontal2 size={16} />Зеркально</button><button className="text-button" onClick={() => action(face => { const next = { ...face }; delete next[active]; return next; })}><RotateCcw size={12} />Сбросить эту деталь</button></fieldset>
      </aside>
    </div>
    <footer className="face-editor-footer"><label>Применить<select aria-label="Куда применить лицо" value={scope} onChange={event => setScope(event.target.value)}><option value="model">К модели {layer.modelId}: все копии + новые</option><option value="figure">Только к выбранной фигуре</option></select></label><div><button className="button subtle" disabled={busy || !layout} onClick={png}><Download size={16} />PNG модели</button><button className="button subtle" onClick={onClose}>Отмена</button><button className="button primary" disabled={!layout || busy} onClick={() => onApply(draft, scope)}><Check size={16} />Применить правки</button></div></footer>
  </div></div>;
}
