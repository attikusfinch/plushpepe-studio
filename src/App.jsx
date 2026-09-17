import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowDown, ArrowUp, Bone, Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Eye, EyeOff, FilePlus2, FolderOpen, Grid2X2, ImagePlus, Layers, LockKeyhole, UnlockKeyhole, Maximize, Minus, MousePointer2, Plus, Redo2, RotateCcw, Save, Search, SlidersHorizontal, Smile, Sparkles, Sticker, Trash2, Type, Undo2, Upload, X, FlipHorizontal2, FlipVertical2, Play, Pause, HelpCircle } from 'lucide-react';
import Canvas from './Canvas';
import FaceEditor from './FaceEditor';
import { validFacePresets } from './face';
import { assetUrl } from './assetUrl';
import { baseLayer, clamp, initialProject, neutralPose, poses, uid, validateProject } from './core';
import { download, exportComposition, fetchJSON, importAsset } from './media';
import { restoreProject, saveProject, restoreFacePresets, saveFacePresets } from './storage';

const accepted = '.png,.jpg,.jpeg,.webp,.gif,.svg,.avif,.tgs,.json,.webm,.mp4';
const names = { '034': 'Радуга', '035': 'Голубой', '039': 'Клоун', '045': 'Розовый блеск', '061': 'Силуэт', '063': 'Изумрудный блеск', '071': 'Ниндзя · фиолетовый', '072': 'Золото', '073': 'Ниндзя · оранжевый', '075': 'Ниндзя · красный', '076': 'Серебро', '079': 'Звёздочки', '081': 'Ниндзя · синий', '082': 'Вафля', '083': 'Космос' };
const modelName = id => names[id] || `Plush Pepe ${id}`;

function IconButton({ icon: Icon, label, ...props }) { return <button className="icon-button" title={label} aria-label={label} {...props}><Icon size={17} /></button>; }
function Field({ label, value, onChange, min, max, step = 1, suffix }) { return <label className="number-field"><span>{label}</span><input aria-label={label} type="number" value={Number.isFinite(value) ? Math.round(value * 100) / 100 : 0} min={min} max={max} step={step} onChange={event => { if (event.target.value !== '') onChange(clamp(Number(event.target.value), min ?? -100000, max ?? 100000)); }} />{suffix && <small>{suffix}</small>}</label>; }
function Section({ title, children, extra }) { return <section className="property-section"><div className="section-heading"><h3>{title}</h3>{extra}</div>{children}</section>; }

function App() {
  const [project, setProject] = useState(initialProject);
  const projectRef = useRef(project); projectRef.current = project;
  const [selectedId, setSelectedId] = useState(null);
  const [catalog, setCatalog] = useState([]); const [tab, setTab] = useState('pepes'); const [search, setSearch] = useState('');
  const [facePresets, setFacePresets] = useState({});
  const [boneMode, setBoneMode] = useState(false);
  const [zoom, setZoom] = useState(.5); const [fitSignal, setFitSignal] = useState(0);
  const [inspector, setInspector] = useState('object'); const [meta, setMeta] = useState({});
  const [toast, setToast] = useState(''); const [busy, setBusy] = useState(''); const [saveStatus, setSaveStatus] = useState('loading');
  const [ready, setReady] = useState(false); const [dialog, setDialog] = useState(null); const [exportFormat, setExportFormat] = useState('png'); const [exportScale, setExportScale] = useState(1);
  const [playing, setPlaying] = useState(false); const [, setHistoryVersion] = useState(0);
  const history = useRef({ past: [], future: [], lastKey: null, lastTime: 0 });
  const fileInput = useRef(); const projectInput = useRef(); const draggingLayer = useRef();
  const selected = project.layers.find(layer => layer.id === selectedId);
  const selectedMeta = selected ? meta[selected.id] : null;
  const tell = useCallback(message => setToast(message), []);

  useEffect(() => {
    restoreFacePresets().then(data => { if (validFacePresets(data)) setFacePresets(data); }).catch(() => {});
    fetchJSON(assetUrl('/catalog.json')).then(data => setCatalog(data.models)).catch(error => tell(error.message));
    restoreProject().then(data => { if (data) setProject(validateProject(data)); }).catch(() => tell('Автосохранение недоступно. Сохраняйте проект в файл.')).finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!ready) return;
    setSaveStatus('saving');
    const timer = setTimeout(() => saveProject(project).then(() => setSaveStatus('saved')).catch(() => setSaveStatus('error')), 600);
    return () => clearTimeout(timer);
  }, [project, ready]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 5500); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { setPlaying(false); }, [selectedId]);

  const change = useCallback((updater, key = null) => {
    const old = projectRef.current; const next = typeof updater === 'function' ? updater(old) : updater;
    if (next === old) return;
    const h = history.current; const now = Date.now();
    if (!key || key !== h.lastKey || now - h.lastTime > 600) h.past = [...h.past.slice(-59), old];
    h.future = []; h.lastKey = key; h.lastTime = now;
    projectRef.current = next; setProject(next); setHistoryVersion(value => value + 1);
  }, []);
  const patchLayer = useCallback((id, patch, key = null) => change(old => ({ ...old, layers: old.layers.map(layer => layer.id === id ? { ...layer, ...patch } : layer) }), key), [change]);
  const patchCanvas = patch => change(old => ({ ...old, canvas: { ...old.canvas, ...patch } }), 'canvas');
  const undo = useCallback(() => { const h = history.current; if (!h.past.length) return; setPlaying(false); h.future.unshift(projectRef.current); const next = h.past.pop(); h.lastKey = null; projectRef.current = next; setProject(next); setHistoryVersion(value => value + 1); }, []);
  const redo = useCallback(() => { const h = history.current; if (!h.future.length) return; setPlaying(false); h.past.push(projectRef.current); const next = h.future.shift(); h.lastKey = null; projectRef.current = next; setProject(next); setHistoryVersion(value => value + 1); }, []);
  const choose = id => { setSelectedId(id); if (id) setInspector('object'); };
  const addLayer = layer => { if (projectRef.current.layers.length >= 200) return tell('В одном проекте можно разместить до 200 слоёв.'); change(old => ({ ...old, layers: [...old.layers, layer] })); choose(layer.id); };
  const addPepe = id => addLayer(baseLayer('pepe', `Pepe ${id} · ${modelName(id)}`, { modelId: id, pose: { ...neutralPose }, face: structuredClone(project.modelFaces?.[id] || facePresets[id] || {}), x: project.canvas.width / 2, y: project.canvas.height / 2, width: Math.min(project.canvas.width, project.canvas.height) * .72, height: Math.min(project.canvas.width, project.canvas.height) * .72 }));
  const applyFaceEdit = (face, scope) => {
    if (!selected || selected.type !== 'pepe' || selected.locked) return;
    const id = selected.modelId;
    const savedFace = structuredClone(face);
    change(old => ({ ...old,
      ...(scope === 'model' ? { modelFaces: { ...old.modelFaces, [id]: savedFace } } : {}),
      layers: old.layers.map(item => item.id === selectedId || (scope === 'model' && item.type === 'pepe' && item.modelId === id && !item.locked) ? { ...item, face: structuredClone(savedFace) } : item),
    }));
    if (scope === 'model') {
      const next = { ...facePresets, [id]: savedFace };
      setFacePresets(next);
      saveFacePresets(next).catch(() => tell('Лицо сохранено в проекте, но библиотеку на устройстве обновить не удалось.'));
    }
    setDialog(null);
    tell(scope === 'model' ? `Лицо ${id} сохранено для новых копий и обновлено у незаблокированных копий в сцене.` : 'Лицо этой фигуры обновлено.');
  };
  const addSticker = id => addLayer(baseLayer('sticker', `Стикер ${id}`, { stickerId: id, frame: 2, x: project.canvas.width / 2, y: project.canvas.height / 2, width: Math.min(project.canvas.width, project.canvas.height) * .5, height: Math.min(project.canvas.width, project.canvas.height) * .5 }));
  const addText = () => addLayer(baseLayer('text', 'Твой текст', { text: 'Твой текст', x: project.canvas.width / 2, y: project.canvas.height / 2, width: project.canvas.width * .8, height: 100, fontSize: 60, color: '#383047', fontStyle: 'bold' }));
  const remove = () => { if (!selected || selected.locked) return; change(old => ({ ...old, layers: old.layers.filter(layer => layer.id !== selectedId) })); choose(null); };
  const duplicate = () => { if (!selected) return; addLayer({ ...structuredClone(selected), id: uid(), name: `${selected.name} · копия`, x: selected.x + 24, y: selected.y + 24, locked: false }); };
  const reorder = (id, targetIndex) => change(old => { const layers = [...old.layers]; const index = layers.findIndex(layer => layer.id === id); if (index < 0) return old; const [layer] = layers.splice(index, 1); layers.splice(clamp(targetIndex, 0, layers.length), 0, layer); return { ...old, layers }; });
  const changeFrame = frame => { if (!selected || !selectedMeta || selected.locked) return; patchLayer(selectedId, { frame: clamp(Math.round(frame), 0, selectedMeta.frames - 1) }, `frame-${selectedId}`); };
  useEffect(() => {
    if (!playing || !selectedMeta || !selected || selected.locked) return;
    const timer = setInterval(() => { const layer = projectRef.current.layers.find(item => item.id === selectedId); if (layer) patchLayer(selectedId, { frame: ((layer.frame || 0) + 1) % selectedMeta.frames }, `frame-${selectedId}`); }, 1000 / Math.min(selectedMeta.fps, 30));
    return () => clearInterval(timer);
  }, [playing, selectedId, selectedMeta?.frames, selectedMeta?.fps, selected?.locked]);
  const onMetadata = useCallback((id, value) => setMeta(old => old[id]?.frames === value.frames && old[id]?.fps === value.fps ? old : { ...old, [id]: value }), []);

  const addImported = asset => {
    const size = Math.min(projectRef.current.canvas.width, projectRef.current.canvas.height) * .6;
    const scale = Math.min(size / asset.width, size / asset.height);
    addLayer(baseLayer('image', asset.name, { assetId: asset.id, x: projectRef.current.canvas.width / 2, y: projectRef.current.canvas.height / 2, width: asset.width * scale, height: asset.height * scale, frame: 0 }));
  };
  const importFiles = async files => {
    setBusy('Импортируем файлы…');
    const errors = [];
    for (const file of Array.from(files)) {
      try { const asset = await importAsset(file); change(old => ({ ...old, assets: { ...old.assets, [asset.id]: asset } })); addImported(asset); }
      catch (error) { errors.push(`${file.name}: ${error.message}`); }
    }
    setBusy(''); setTab('imports'); if (errors.length) tell(errors.join(' '));
  };
  const saveFile = () => { download(new Blob([JSON.stringify(projectRef.current)], { type: 'application/json' }), `${projectRef.current.name || 'plush-project'}.plush.json`); tell('Проект сохранён вместе с импортированными файлами.'); };
  const openFile = async file => {
    if (!file) return;
    try { if (file.size > 160 * 1024 * 1024) throw new Error('Проект больше 160 МБ.'); const next = validateProject(JSON.parse(await file.text())); change(next); choose(null); setFitSignal(value => value + 1); tell('Проект открыт.'); }
    catch (error) { tell(error.message); }
  };
  const doExport = async () => {
    setPlaying(false); setBusy('Собираем изображение…');
    try { const blob = await exportComposition(projectRef.current, exportFormat, exportScale); download(blob, `${projectRef.current.name || 'plush-composition'}.${exportFormat === 'jpeg' ? 'jpg' : 'png'}`); setDialog(null); tell('Изображение экспортировано.'); }
    catch (error) { tell(error.message || 'Не удалось экспортировать изображение.'); }
    finally { setBusy(''); }
  };
  useEffect(() => {
    const handler = event => {
      const editing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (editing || dialog || busy) return;
      const mod = event.ctrlKey || event.metaKey;
      if (mod && event.code === 'KeyZ') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (mod && event.code === 'KeyY') { event.preventDefault(); redo(); }
      else if (mod && event.code === 'KeyS') { event.preventDefault(); saveFile(); }
      else if (mod && event.code === 'KeyD') { event.preventDefault(); duplicate(); }
      else if (['Delete', 'Backspace'].includes(event.key)) { event.preventDefault(); remove(); }
      else if (event.key === 'Escape') { if (boneMode) setBoneMode(false); else choose(null); }
      else if (event.code === 'KeyB' && selected?.type === 'pepe' && !selected.locked) setBoneMode(value => !value);
      else if (selected && !selected.locked && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
        event.preventDefault(); const step = event.shiftKey ? 10 : 1;
        patchLayer(selectedId, { x: selected.x + (event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0), y: selected.y + (event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0) }, 'nudge');
      }
    };
    const paste = event => { if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) return; const files = Array.from(event.clipboardData?.files || []); if (files.length) { event.preventDefault(); importFiles(files); } };
    window.addEventListener('keydown', handler); window.addEventListener('paste', paste);
    return () => { window.removeEventListener('keydown', handler); window.removeEventListener('paste', paste); };
  }, [selected, dialog, busy, selectedId, project, boneMode]);

  const visibleModels = catalog.filter(model => `${model.id} ${modelName(model.id)}`.toLowerCase().includes(search.toLowerCase()));
  const stickerIds = Array.from({ length: 83 }, (_, index) => String(index + 1).padStart(3, '0')).filter(id => id.includes(search));
  const importList = Object.values(project.assets).filter(asset => asset.name.toLowerCase().includes(search.toLowerCase()));
  const index = project.layers.findIndex(layer => layer.id === selectedId);

  return <div className="studio">
    <header className="topbar">
      <a className="brand" href="#" onClick={event => event.preventDefault()} aria-label="Plush Pepe Studio"><span className="brand-mark"><Smile size={26} strokeWidth={2.4} /></span><span>plush<span className="brand-light">studio</span><small>PEPE PLAYGROUND</small></span></a>
      <div className="project-heading"><input aria-label="Название проекта" value={project.name} onChange={event => change(old => ({ ...old, name: event.target.value }), 'name')} /><span className={`save-state ${saveStatus}`}><span />{saveStatus === 'saved' ? 'Сохранено на устройстве' : saveStatus === 'error' ? 'Сохраните проект в файл' : 'Сохраняем…'}</span></div>
      <div className="top-actions"><IconButton icon={FolderOpen} label="Открыть проект" onClick={() => projectInput.current.click()} /><IconButton icon={Save} label="Сохранить проект · Ctrl+S" onClick={saveFile} /><div className="separator" /><button className="button subtle import-header" onClick={() => fileInput.current.click()}><Upload size={16} />Импорт</button><button className="button primary" onClick={() => setDialog('export')}><Download size={16} />Экспорт<ChevronDown size={14} /></button></div>
    </header>
    <main className="workspace">
      <aside className="library">
        <div className="library-title"><h1>Твоя коллекция</h1><span className="little-badge">50 ПЕПЕ</span></div>
        <p className="muted library-description">Маленькие герои. Большие идеи.</p>
        <div className="library-tabs" role="tablist" aria-label="Библиотека"><button role="tab" aria-selected={tab === 'pepes'} className={tab === 'pepes' ? 'active' : ''} onClick={() => { setTab('pepes'); setSearch(''); }}><Smile size={17} />Пепе</button><button role="tab" aria-selected={tab === 'stickers'} className={tab === 'stickers' ? 'active' : ''} onClick={() => { setTab('stickers'); setSearch(''); }}><Sticker size={17} />Стикеры</button><button role="tab" aria-selected={tab === 'imports'} className={tab === 'imports' ? 'active' : ''} onClick={() => { setTab('imports'); setSearch(''); }}><ImagePlus size={17} />Импорт</button></div>
        <label className="search"><Search size={16} /><input placeholder={tab === 'imports' ? 'Найти файл…' : 'Найти по имени или номеру…'} value={search} onChange={event => setSearch(event.target.value)} aria-label="Поиск в библиотеке" />{search && <button onClick={() => setSearch('')} aria-label="Очистить поиск"><X size={14} /></button>}</label>
        <div className="collection-caption"><span>{tab === 'pepes' ? 'PLUSH ORIGINALS' : tab === 'stickers' ? 'СТИКЕРПАК' : 'ТВОИ ФАЙЛЫ'}</span><span>{tab === 'pepes' ? visibleModels.length : tab === 'stickers' ? stickerIds.length : importList.length}</span></div>
        <div className="library-scroll">
          {tab === 'pepes' && <div className="asset-grid">{visibleModels.map(model => <button className={`asset-card ${selected?.modelId === model.id ? 'chosen' : ''}`} key={model.id} onClick={() => addPepe(model.id)} aria-label={`Добавить Пепе ${model.id}`} title={modelName(model.id)}>{(project.modelFaces?.[model.id] || facePresets[model.id]) && <i className="face-corrected-badge" title="Для модели сохранено исправленное лицо"><Check size={10} /></i>}<img loading="lazy" src={assetUrl(model.previewUrl)} alt={modelName(model.id)} /><span><span>{model.id}</span><Plus size={13} /></span></button>)}</div>}
          {tab === 'stickers' && <><div className="mini-notice"><Sparkles size={14} /><span>Добавь стикер и выбери нужный кадр</span></div><div className="asset-grid">{stickerIds.map(id => <button className="asset-card" key={id} onClick={() => addSticker(id)} aria-label={`Добавить стикер ${id}`}><img loading="lazy" src={assetUrl(`/references/${id}.png`)} alt={`Стикер ${id}`} /><span>{id}<Plus size={13} /></span></button>)}</div></>}
          {tab === 'imports' && <><button className="upload-card" onClick={() => fileInput.current.click()}><span><Upload size={23} /></span><strong>Добавить свои файлы</strong><small>или перетащи их на холст</small><em>PNG · JPG · WebP · GIF · SVG<br />TGS · Lottie JSON · WebM · MP4 · AVIF</em></button><div className="asset-grid imports-grid">{importList.map(asset => <button className="asset-card" key={asset.id} onClick={() => addImported(asset)} title={asset.name}><img src={asset.thumbnail} alt={asset.name} /><span className="filename">{asset.name}</span>{asset.frames > 1 && <small>{asset.frames} кадров</small>}</button>)}</div></>}
          {((tab === 'pepes' && !visibleModels.length) || (tab === 'stickers' && !stickerIds.length)) && <p className="empty-search">Ничего не найдено</p>}
        </div>
        <div className="library-footer"><span className="live-dot" />Всё остаётся на твоём устройстве</div>
      </aside>
      <section className="editor">
        <div className="editor-toolbar"><div className="toolbar-group"><IconButton icon={Undo2} label="Отменить · Ctrl+Z" disabled={!history.current.past.length} onClick={undo} /><IconButton icon={Redo2} label="Повторить · Ctrl+Shift+Z" disabled={!history.current.future.length} onClick={redo} /><div className="separator" /><button className={`tool-selected ${boneMode ? 'inactive' : ''}`} title="Выделение и перемещение" onClick={() => setBoneMode(false)}><MousePointer2 size={17} /><span>Выбрать</span></button><button className={`bone-tool ${boneMode ? 'active' : ''}`} aria-label="Кости · B" aria-pressed={boneMode} title="Точки рук и ног · B" disabled={selected?.type !== 'pepe' || selected?.locked || !selected?.visible} onClick={() => setBoneMode(value => !value)}><Bone size={17} /><span>Кости</span></button><IconButton icon={Type} label="Добавить текст" onClick={addText} /><IconButton icon={ImagePlus} label="Добавить изображение" onClick={() => fileInput.current.click()} /></div><div className="toolbar-group"><button className="canvas-size-button" onClick={() => setInspector('canvas')}><Maximize size={14} />{project.canvas.width} × {project.canvas.height}</button><IconButton icon={HelpCircle} label="Горячие клавиши" onClick={() => setDialog('help')} /></div></div>
        <Canvas project={project} selectedId={selectedId} onSelect={choose} onChange={patchLayer} onMetadata={onMetadata} onError={tell} zoom={zoom} setZoom={setZoom} fitSignal={fitSignal} importFiles={importFiles} boneMode={boneMode} />
        <div className="editor-bottom"><span><Layers size={14} />{project.layers.length} слоёв<span className="bottom-dot">·</span><span className="bottom-hint">Твоя сцена, твои правила</span></span><div className="zoom-control"><IconButton icon={Minus} label="Уменьшить масштаб" onClick={() => setZoom(value => clamp(value / 1.2, .05, 3))} /><span>{Math.round(zoom * 100)}%</span><IconButton icon={Plus} label="Увеличить масштаб" onClick={() => setZoom(value => clamp(value * 1.2, .05, 3))} /><div className="separator" /><IconButton icon={Maximize} label="Холст целиком" onClick={() => setFitSignal(value => value + 1)} /></div></div>
      </section>
      <aside className="inspector">
        <div className="inspector-tabs"><button className={inspector === 'object' ? 'active' : ''} onClick={() => setInspector('object')}><SlidersHorizontal size={15} />Объект</button><button className={inspector === 'canvas' ? 'active' : ''} onClick={() => setInspector('canvas')}><Grid2X2 size={15} />Холст</button></div>
        <div className="properties-scroll">
          {inspector === 'canvas' ? <>
            <Section title="Размер холста"><div className="field-grid"><Field label="Ширина" value={project.canvas.width} min={64} max={4096} onChange={width => patchCanvas({ width: Math.round(width) })} /><Field label="Высота" value={project.canvas.height} min={64} max={4096} onChange={height => patchCanvas({ height: Math.round(height) })} /></div><div className="size-presets">{[[1080, 1080, 'Квадрат'], [1080, 1920, 'Сторис'], [1920, 1080, 'Пейзаж'], [512, 512, 'Стикер']].map(([width, height, name]) => <button key={name} onClick={() => patchCanvas({ width, height })}>{name}<small>{width} × {height}</small></button>)}</div></Section>
            <Section title="Фон"><label className="toggle-row"><span>Прозрачный фон</span><input type="checkbox" checked={project.canvas.transparent} onChange={event => patchCanvas({ transparent: event.target.checked })} /></label><label className="color-field"><input aria-label="Цвет фона" type="color" value={project.canvas.background} onChange={event => patchCanvas({ background: event.target.value, transparent: false })} /><span>{project.canvas.background.toUpperCase()}</span></label><div className="swatches">{['#eeedf5', '#ffffff', '#f7e7ec', '#e5f1db', '#cbd9f2', '#f4e8d0', '#24262d'].map(color => <button key={color} style={{ background: color }} aria-label={`Фон ${color}`} onClick={() => patchCanvas({ background: color, transparent: false })} />)}</div></Section>
            <Section title="Проект"><button className="button full" onClick={saveFile}><Save size={15} />Сохранить .plush.json</button><button className="button full subtle" onClick={() => projectInput.current.click()}><FolderOpen size={15} />Открыть проект</button><button className="button full subtle" onClick={() => setDialog('new')}><FilePlus2 size={15} />Новый пустой холст</button></Section>
          </> : selected ? <>
            <div className="selected-heading"><span className="selected-type">{selected.type === 'pepe' ? 'PLUSH FIGURE' : selected.type === 'text' ? 'ТЕКСТ' : 'СТИКЕР / КАРТИНКА'}</span><input aria-label="Название слоя" value={selected.name} onChange={event => patchLayer(selectedId, { name: event.target.value }, 'layer-name')} /><div className="object-quick-actions"><IconButton icon={Copy} label="Дублировать слой" onClick={duplicate} /><IconButton icon={FlipHorizontal2} label="Отразить по горизонтали" disabled={selected.locked} onClick={() => patchLayer(selectedId, { flipX: !selected.flipX })} /><IconButton icon={FlipVertical2} label="Отразить по вертикали" disabled={selected.locked} onClick={() => patchLayer(selectedId, { flipY: !selected.flipY })} /><IconButton icon={Trash2} label="Удалить слой" disabled={selected.locked} onClick={remove} /></div></div>
            {selected.locked && <div className="mini-notice locked-notice"><LockKeyhole size={14} />Слой заблокирован<button onClick={() => patchLayer(selectedId, { locked: false })}>Открыть</button></div>}
            <fieldset disabled={selected.locked}>
              {selected.type === 'pepe' && <Section title="Лицо модели"><button className="button full face-open-button" disabled={selected.modelId === '061'} onClick={() => setDialog('face')}><Smile size={17} />Редактировать лицо</button><p className="face-section-note">{selected.modelId === '061' ? '061 — силуэт без отдельных деталей лица.' : 'Глаза, пуговицы и улыбка · ориентир 002'}</p></Section>}
              {selected.type === 'pepe' && <Section title="Поза Пепе" extra={<span className="tiny-badge">6 ПОЗ</span>}><button className={`bone-mode-button ${boneMode ? 'active' : ''}`} disabled={!selected.visible} onClick={() => setBoneMode(value => !value)}><Bone size={17} /><span>{boneMode ? 'Точки включены' : 'Двигать за точки'}</span><kbd>B</kbd></button>{boneMode && <div className="bone-help"><p>По 3 точки на каждой руке и ноге.</p><span><b>1</b> Крепление · переносит конечность</span><span><b>2</b> Локоть или колено · сгибает</span><span><b>3</b> Кисть или стопа · тянет</span><button className="text-button" onClick={() => patchLayer(selectedId, { bones: {} })}><RotateCcw size={12} />Сбросить изгибы</button></div>}<div className="pose-grid">{poses.map(pose => <button key={pose.id} className={!Object.keys(selected.bones || {}).length && JSON.stringify(selected.pose) === JSON.stringify(pose.values) ? 'active' : ''} onClick={() => patchLayer(selectedId, { pose: { ...pose.values }, bones: {} })}><PoseIcon pose={pose.id} /><span>{pose.name}</span></button>)}</div><details className="joint-controls"><summary>Настроить руки и ноги <SlidersHorizontal size={13} /></summary>{[['leftArm', 'Рука слева'], ['rightArm', 'Рука справа'], ['leftLeg', 'Нога слева'], ['rightLeg', 'Нога справа']].map(([key, name]) => <label className="range-field" key={key}><span>{name}<b>{selected.pose?.[key] || 0}°</b></span><input aria-label={name} type="range" min={key.includes('Arm') ? -150 : -38} max={key.includes('Arm') ? 150 : 38} value={selected.pose?.[key] || 0} onChange={event => patchLayer(selectedId, { pose: { ...neutralPose, ...selected.pose, [key]: Number(event.target.value) } }, `pose-${key}`)} /></label>)}<button className="text-button" onClick={() => patchLayer(selectedId, { pose: { ...neutralPose }, bones: {} })}><RotateCcw size={12} />Сбросить позу</button></details></Section>}
              {selectedMeta?.frames > 1 && <Section title={selectedMeta.video ? 'Момент видео' : 'Кадр стикера'} extra={<span className="tiny-badge">{selectedMeta.frames} КАДР.</span>}><div className="frame-preview"><img src={selected.type === 'sticker' ? assetUrl(`/references/${selected.stickerId}.png`) : project.assets[selected.assetId]?.thumbnail} alt="Превью источника" /><div><strong>{Math.min(selectedMeta.frames, (selected.frame || 0) + 1)} <span>/ {selectedMeta.frames}</span></strong><small>{((selected.frame || 0) / selectedMeta.fps).toFixed(2)} с {selectedMeta.video ? '· шаг 1/30 с' : ''}</small></div><IconButton icon={playing ? Pause : Play} label={playing ? 'Остановить анимацию' : 'Просмотреть анимацию'} onClick={() => setPlaying(value => !value)} /></div><input aria-label="Кадр стикера" type="range" min={0} max={selectedMeta.frames - 1} value={selected.frame || 0} onChange={event => { setPlaying(false); changeFrame(Number(event.target.value)); }} /><div className="frame-step"><IconButton icon={ChevronLeft} label="Предыдущий кадр" onClick={() => { setPlaying(false); changeFrame((selected.frame || 0) - 1); }} /><Field label="Кадр" value={(selected.frame || 0) + 1} min={1} max={selectedMeta.frames} onChange={value => { setPlaying(false); changeFrame(value - 1); }} /><IconButton icon={ChevronRight} label="Следующий кадр" onClick={() => { setPlaying(false); changeFrame((selected.frame || 0) + 1); }} /></div></Section>}
              {selected.type === 'text' && <Section title="Текст"><textarea aria-label="Текст" value={selected.text} onChange={event => patchLayer(selectedId, { text: event.target.value }, 'text')} /><div className="field-grid"><Field label="Кегль" value={selected.fontSize} min={6} max={600} onChange={fontSize => patchLayer(selectedId, { fontSize }, 'font-size')} /><label className="color-field"><input aria-label="Цвет текста" type="color" value={selected.color} onChange={event => patchLayer(selectedId, { color: event.target.value })} /><span>Цвет</span></label></div><label className="toggle-row"><span>Жирный</span><input type="checkbox" checked={selected.fontStyle === 'bold'} onChange={event => patchLayer(selectedId, { fontStyle: event.target.checked ? 'bold' : 'normal' })} /></label></Section>}
              <Section title="Положение и размер"><div className="field-grid"><Field label="X" value={selected.x} onChange={x => patchLayer(selectedId, { x }, 'x')} /><Field label="Y" value={selected.y} onChange={y => patchLayer(selectedId, { y }, 'y')} /><Field label="W" value={selected.width} min={12} max={16384} onChange={width => patchLayer(selectedId, { width, height: selected.height * width / selected.width }, 'size')} /><Field label="H" value={selected.height} min={12} max={16384} onChange={height => patchLayer(selectedId, { height, width: selected.width * height / selected.height }, 'size')} /><Field label="Поворот" value={selected.rotation} min={-360} max={360} suffix="°" onChange={rotation => patchLayer(selectedId, { rotation }, 'rotation')} /><button className="center-button" onClick={() => patchLayer(selectedId, { x: project.canvas.width / 2, y: project.canvas.height / 2 })}>По центру</button></div><label className="range-field"><span>Непрозрачность<b>{Math.round(selected.opacity * 100)}%</b></span><input aria-label="Непрозрачность" type="range" min={0} max={100} value={selected.opacity * 100} onChange={event => patchLayer(selectedId, { opacity: Number(event.target.value) / 100 }, 'opacity')} /></label></Section>
            </fieldset>
          </> : <div className="empty-inspector"><span><MousePointer2 size={26} /></span><h3>Всё начинается с Пепе</h3><p>Добавь героя из коллекции или выбери объект на холсте, чтобы изменить его.</p><button className="button subtle" onClick={() => setInspector('canvas')}><Grid2X2 size={15} />Настроить холст</button></div>}
        </div>
        <section className="layers-panel"><div className="layers-heading"><h2><Layers size={16} />Слои <span>{project.layers.length}</span></h2><div><IconButton icon={ArrowUp} label="Слой выше" disabled={index < 0 || index === project.layers.length - 1 || selected?.locked} onClick={() => reorder(selectedId, index + 1)} /><IconButton icon={ArrowDown} label="Слой ниже" disabled={index <= 0 || selected?.locked} onClick={() => reorder(selectedId, index - 1)} /></div></div><div className="layer-list">{[...project.layers].reverse().map(layer => <div key={layer.id} className={`layer-row ${selectedId === layer.id ? 'selected' : ''} ${!layer.visible ? 'hidden-layer' : ''}`} draggable={!layer.locked} onDragStart={event => { draggingLayer.current = layer.id; event.dataTransfer.effectAllowed = 'move'; }} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (draggingLayer.current) reorder(draggingLayer.current, project.layers.findIndex(item => item.id === layer.id)); draggingLayer.current = null; }}>
          <button className="layer-select" onClick={() => choose(layer.id)} aria-label={`Выбрать слой ${layer.name}`}><span className="layer-thumb">{layer.type === 'text' ? <Type size={18} /> : <img src={layer.type === 'pepe' ? assetUrl(`/models/standing/png/${layer.modelId}.png`) : layer.type === 'sticker' ? assetUrl(`/references/${layer.stickerId}.png`) : project.assets[layer.assetId]?.thumbnail} alt="" />}</span><span className="layer-name">{layer.name}</span></button><IconButton icon={layer.locked ? LockKeyhole : UnlockKeyhole} label={layer.locked ? `Разблокировать ${layer.name}` : `Заблокировать ${layer.name}`} onClick={() => patchLayer(layer.id, { locked: !layer.locked })} /><IconButton icon={layer.visible ? Eye : EyeOff} label={layer.visible ? `Скрыть ${layer.name}` : `Показать ${layer.name}`} onClick={() => patchLayer(layer.id, { visible: !layer.visible })} />
        </div>)}</div><div className="layers-tip">Верхний слой — передний план · тяни для порядка</div></section>
      </aside>
    </main>
    <input ref={fileInput} type="file" accept={accepted} multiple hidden onChange={event => { importFiles(event.target.files); event.target.value = ''; }} />
    <input ref={projectInput} type="file" accept=".json" hidden onChange={event => { openFile(event.target.files[0]); event.target.value = ''; }} />
    {toast && <div className="toast" role="status"><span>{toast}</span><button onClick={() => setToast('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}
    {busy && <div className="busy-pill" role="status"><span className="spinner" />{busy}</div>}
    {dialog === 'face' && selected?.type === 'pepe' && <FaceEditor layer={selected} onApply={applyFaceEdit} onClose={() => setDialog(null)} />}
    {dialog && dialog !== 'face' && <div className="modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) setDialog(null); }}><div className="modal" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><IconButton icon={X} label="Закрыть окно" disabled={!!busy} onClick={() => setDialog(null)} />
      {dialog === 'export' && <><div className="modal-icon"><Download size={26} /></div><h2 id="dialog-title">Забрать свой plush-мир</h2><p>Композиция целиком, в исходном качестве.</p><div className="export-formats"><button className={exportFormat === 'png' ? 'active' : ''} onClick={() => setExportFormat('png')}><strong>PNG</strong><span>С прозрачностью</span>{exportFormat === 'png' && <Check size={16} />}</button><button className={exportFormat === 'jpeg' ? 'active' : ''} onClick={() => setExportFormat('jpeg')}><strong>JPG</strong><span>Компактная картинка</span>{exportFormat === 'jpeg' && <Check size={16} />}</button></div><label className="export-resolution">Размер экспорта<select aria-label="Масштаб экспорта" value={exportScale} onChange={event => setExportScale(Number(event.target.value))}>{[1, 2].map(scale => <option key={scale} value={scale}>{scale}× · {project.canvas.width * scale} × {project.canvas.height * scale} px</option>)}</select></label><p className="export-note">{exportFormat === 'jpeg' && project.canvas.transparent ? 'Прозрачные области JPG будут белыми.' : 'Экспортируется выбранный кадр каждого стикера.'}</p><button className="button primary full export-confirm" disabled={!!busy} onClick={doExport}><Download size={16} />{busy ? 'Экспортируем…' : 'Скачать изображение'}</button></>}
      {dialog === 'new' && <><h2 id="dialog-title">Новый холст</h2><p>Текущий проект заменится пустым. Его можно сохранить в файл или вернуть через отмену.</p><button className="button full" onClick={saveFile}><Save size={16} />Сначала сохранить проект</button><button className="button primary full" onClick={() => { change({ version: 1, name: 'Новый plush-мир', canvas: { width: 1080, height: 1080, background: '#ffffff', transparent: true }, assets: {}, layers: [] }); choose(null); setDialog(null); }}>Создать пустой холст</button></>}
      {dialog === 'help' && <><h2 id="dialog-title">Чуть быстрее, чуть удобнее</h2><div className="shortcut-list">{[['Отменить', 'Ctrl / ⌘ + Z'], ['Повторить', 'Ctrl / ⌘ + Shift + Z'], ['Сохранить проект', 'Ctrl / ⌘ + S'], ['Дублировать слой', 'Ctrl / ⌘ + D'], ['Удалить слой', 'Delete'], ['Сдвинуть на 1 / 10 px', 'Стрелки / Shift + стрелки'], ['Вставить картинку', 'Ctrl / ⌘ + V'], ['Точки рук и ног', 'B'], ['Выйти из костей / снять выделение', 'Esc']].map(([label, key]) => <div key={label}><span>{label}</span><kbd>{key}</kbd></div>)}</div><p>Размер и поворот меняются за ручки рамки. Порядок слоёв — перетаскиванием в списке справа.</p></>}
    </div></div>}
  </div>;
}

function PoseIcon({ pose }) {
  const paths = { stand: ['M10 14 L8 23', 'M22 14 L24 23'], hello: ['M10 14 L8 23', 'M22 14 L27 6'], hug: ['M10 14 L3 15', 'M22 14 L29 15'], yay: ['M10 14 L5 5', 'M22 14 L27 5'], step: ['M10 14 L5 20', 'M22 14 L27 12'], dance: ['M10 14 L3 8', 'M22 14 L29 18'] };
  return <svg width="32" height="32" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="16" cy="8" r="4" /><path d="M12 14 Q16 12 20 14 L21 23 Q16 25 11 23 Z" fill="currentColor" fillOpacity=".13" />{paths[pose].map(path => <path key={path} d={path} />)}<path d={pose === 'dance' || pose === 'step' ? 'M13 24 L8 29 M19 24 L24 28' : 'M13 24 L12 29 M19 24 L20 29'} /></svg>;
}

export default App;
