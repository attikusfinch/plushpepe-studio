import React, { useRef } from 'react';
import { Circle, Group, Line, Text } from 'react-konva';
import { limbRigs, bonePoints, boneToWorld, worldToBone } from './rig';

export default function BoneHandles({ item, zoom, onPreview, onCommit }) {
  const gesture = useRef(null);
  const size = 1 / zoom;
  const move = (event, key, index, commit) => {
    event.cancelBubble = true;
    const base = gesture.current;
    if (!base) return;
    const nextPoint = worldToBone(base.item, key, [event.target.x(), event.target.y()]);
    const points = base.points.map(point => [...point]);
    if (index === 0) {
      // Moving the attachment carries the whole limb; the other two handles bend it.
      const delta = nextPoint.map((value, axis) => value - points[0][axis]);
      points.forEach(point => { point[0] += delta[0]; point[1] += delta[1]; });
    } else points[index] = nextPoint;
    const bones = { ...base.item.bones, [key]: points };
    if (commit) { gesture.current = null; onCommit(bones); }
    else onPreview(bones);
  };
  return <Group name="bone-handles">
    {Object.entries(limbRigs).map(([key, rig]) => {
      const points = bonePoints(item.bones, key).map(point => boneToWorld(item, key, point));
      return <Group key={key}>
        <Line points={points.flat()} stroke="#151622" strokeWidth={5 * size} opacity={0.55} listening={false} />
        <Line points={points.flat()} stroke={rig.color} strokeWidth={1.5 * size} dash={[4 * size, 3 * size]} listening={false} />
        {points.map((point, index) => <React.Fragment key={index}>
          <Circle name={`bone-${key}-${index}`} x={point[0]} y={point[1]} radius={(index === 1 ? 8 : 7) * size} fill={index === 1 ? rig.color : '#252332'} stroke={rig.color} strokeWidth={2 * size} hitStrokeWidth={12 * size} draggable
            onMouseEnter={event => { event.target.getStage().container().style.cursor = 'grab'; }}
            onMouseLeave={event => { event.target.getStage().container().style.cursor = ''; }}
            onMouseDown={event => { event.cancelBubble = true; }} onTouchStart={event => { event.cancelBubble = true; }}
            onDragStart={event => { event.cancelBubble = true; gesture.current = { item, points: bonePoints(item.bones, key) }; }}
            onDragMove={event => move(event, key, index, false)} onDragEnd={event => move(event, key, index, true)} />
          <Text x={point[0] - 7 * size} y={point[1] - 5 * size} width={14 * size} height={11 * size} text={String(index + 1)} fontSize={9 * size} fontFamily="Arial" align="center" fill={index === 1 ? '#242532' : '#ffffff'} listening={false} />
        </React.Fragment>)}
      </Group>;
    })}
  </Group>;
}
