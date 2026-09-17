import React, { useEffect, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Text, Transformer } from 'react-konva';
import { createSource } from './media';
import BoneHandles from './BoneHandles';

function Figure({ item, assets, selected, editingBones, onSelect, onChange, onMetadata, onError }) {
  const node = useRef(); const transformer = useRef();
  const [source, setSource] = useState(null); const [image, setImage] = useState(null);
  const [revision, setRevision] = useState(0); const queue = useRef(Promise.resolve());
  const callbacks = useRef({ onMetadata, onError }); callbacks.current = { onMetadata, onError };
  const poseKey = JSON.stringify([item.pose, item.bones]);
  useEffect(() => {
    if (item.type === 'text') return;
    let canceled = false; let resource;
    setSource(null);
    createSource(item, assets).then(value => {
      resource = value;
      if (canceled) return value.dispose();
      setSource(value);
      callbacks.current.onMetadata(item.id, { frames: value.frames, fps: value.fps, video: value.video || false });
    }).catch(error => { if (!canceled) callbacks.current.onError(error.message); });
    return () => { canceled = true; if (resource) queue.current.finally(() => resource.dispose()); };
  }, [item.type, item.modelId, item.stickerId, item.assetId, assets[item.assetId]?.data, poseKey]);
  useEffect(() => {
    if (!source) return;
    let canceled = false;
    queue.current = queue.current.catch(() => {}).then(async () => {
      if (canceled) return;
      const rendered = await source.draw(Math.min(source.frames - 1, Math.max(0, item.frame || 0)));
      if (canceled) return;
      const snapshot = document.createElement('canvas'); snapshot.width = source.width; snapshot.height = source.height;
      snapshot.getContext('2d').drawImage(rendered, 0, 0);
      setImage(snapshot); setRevision(value => value + 1);
    }).catch(error => { if (!canceled) callbacks.current.onError(error.message); });
    return () => { canceled = true; };
  }, [source, item.frame]);
  useEffect(() => { if (selected && !item.locked && transformer.current && node.current) { transformer.current.nodes([node.current]); transformer.current.getLayer().batchDraw(); } }, [selected, item.locked, image, item.width, item.height, revision, editingBones]);
  const props = { ref: node, id: item.id, name: 'studio-object', x: item.x, y: item.y, width: item.width, height: item.height,
    offsetX: item.width / 2, offsetY: item.height / 2, rotation: item.rotation, opacity: item.opacity,
    scaleX: item.flipX ? -1 : 1, scaleY: item.flipY ? -1 : 1, draggable: !item.locked && !editingBones,
    onClick: onSelect, onTap: onSelect,
    onDragStart: onSelect,
    onDragEnd: event => onChange({ x: event.target.x(), y: event.target.y() }),
    onTransformEnd: () => {
      const current = node.current; const sx = Math.abs(current.scaleX()); const sy = Math.abs(current.scaleY());
      current.scaleX(item.flipX ? -1 : 1); current.scaleY(item.flipY ? -1 : 1);
      onChange({ x: current.x(), y: current.y(), width: Math.max(12, item.width * sx), height: Math.max(12, item.height * sy), rotation: current.rotation(), ...(item.type === 'text' ? { fontSize: item.fontSize * sy } : {}) });
    } };
  return <>
    {item.type === 'text' ? <Text {...props} text={item.text} fontSize={item.fontSize} fontFamily="Arial" fontStyle={item.fontStyle || 'normal'} fill={item.color} align="center" verticalAlign="middle" lineHeight={1.2} wrap="none" ellipsis={false} /> : <KonvaImage {...props} image={image} />}
    {selected && !item.locked && !editingBones && <Transformer ref={transformer} rotateEnabled flipEnabled={false} keepRatio enabledAnchors={['top-left', 'top-right', 'bottom-left', 'bottom-right']} anchorSize={9} anchorCornerRadius={3} borderStroke="#7561ff" anchorStroke="#7561ff" anchorFill="#ffffff" rotateAnchorOffset={24} boundBoxFunc={(oldBox, nextBox) => Math.abs(nextBox.width) < 12 || Math.abs(nextBox.height) < 12 ? oldBox : nextBox} />}
  </>;
}

export default function Canvas({ project, selectedId, onSelect, onChange, onMetadata, onError, zoom, setZoom, fitSignal, importFiles, boneMode }) {
  const holder = useRef(); const [available, setAvailable] = useState({ width: 700, height: 700 });
  const { width, height, background, transparent } = project.canvas;
  const [preview, setPreview] = useState(null);
  const previewFrame = useRef(null);
  const pendingBones = useRef(null);
  const selected = project.layers.find(item => item.id === selectedId);
  const rigVisible = boneMode && selected?.type === 'pepe' && selected.visible && !selected.locked;
  useEffect(() => {
    setPreview(null);
    return () => { if (previewFrame.current) cancelAnimationFrame(previewFrame.current); previewFrame.current = null; };
  }, [selectedId, boneMode]);
  const previewBones = bones => {
    pendingBones.current = { id: selectedId, bones };
    if (!previewFrame.current) previewFrame.current = requestAnimationFrame(() => { previewFrame.current = null; setPreview(pendingBones.current); });
  };
  const commitBones = bones => {
    if (previewFrame.current) cancelAnimationFrame(previewFrame.current);
    previewFrame.current = null;
    onChange(selectedId, { bones });
    setPreview(null);
  };
  const shown = item => preview?.id === item.id && rigVisible ? { ...item, bones: preview.bones } : item;
  useEffect(() => {
    const observer = new ResizeObserver(entries => { const rect = entries[0].contentRect; setAvailable({ width: rect.width, height: rect.height }); });
    observer.observe(holder.current); return () => observer.disconnect();
  }, []);
  const fit = Math.max(0.05, Math.min((available.width - 110) / width, (available.height - 100) / height, 1));
  useEffect(() => { setZoom(fit); }, [fit, fitSignal]);
  return <div ref={holder} className="canvas-viewport" data-testid="canvas-viewport" onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files.length) importFiles(event.dataTransfer.files); }} onPointerDown={event => { if (event.target === event.currentTarget) onSelect(null); }}>
    <div className="canvas-space" style={{ minWidth: width * zoom + 100, minHeight: height * zoom + 100 }}>
      <div className="artboard-wrap">
        <div className="artboard-label"><span>{project.name || 'Без названия'}</span><span>{width} × {height}</span></div>
        <div className={`artboard ${transparent ? 'checker' : ''}`} style={{ width: width * zoom, height: height * zoom, backgroundColor: transparent ? undefined : background }}>
          <Stage width={width * zoom} height={height * zoom} scaleX={zoom} scaleY={zoom} onMouseDown={event => { if (event.target === event.target.getStage()) onSelect(null); }} onTouchStart={event => { if (event.target === event.target.getStage()) onSelect(null); }}>
            <Layer>{project.layers.filter(item => item.visible).map(item => <Figure key={item.id} item={shown(item)} assets={project.assets} editingBones={rigVisible && item.id === selectedId} selected={selectedId === item.id} onSelect={() => onSelect(item.id)} onChange={patch => onChange(item.id, patch)} onMetadata={onMetadata} onError={onError} />)}</Layer>
            {rigVisible && <Layer><BoneHandles item={shown(selected)} zoom={zoom} onPreview={previewBones} onCommit={commitBones} /></Layer>}
          </Stage>
        </div>
      </div>
    </div>
  </div>;
}
