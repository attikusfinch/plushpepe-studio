// Three control points per limb, in the native 002 vector coordinates.
// The first point is the attachment, the second the bend, the third the hand/foot.
export const limbRigs = {
  leftArm: { label: 'Рука слева', color: '#62ded6', points: [[181, 322], [155, 382], [164, 443]] },
  rightArm: { label: 'Рука справа', color: '#c6a4ff', points: [[333, 336], [345, 385], [351, 437]] },
  leftLeg: { label: 'Нога слева', color: '#f4c176', points: [[210, 411], [197, 453], [195, 490]] },
  rightLeg: { label: 'Нога справа', color: '#b5e88b', points: [[304, 410], [312, 452], [320, 489]] },
};

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const mul = (a, n) => [a[0] * n, a[1] * n];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const rotate = (p, angle) => [p[0] * Math.cos(angle) - p[1] * Math.sin(angle), p[0] * Math.sin(angle) + p[1] * Math.cos(angle)];

export function bonePoints(bones, key) {
  return (bones?.[key] || limbRigs[key].points).map(point => [...point]);
}

// A Hermite spine passes through all three handles. Its tangent gives the
// local limb orientation; rotating cross sections preserves their thickness.
function spine(points, middle, t) {
  const derivatives = [mul(sub(points[1], points[0]), 1 / middle), sub(points[2], points[0]), mul(sub(points[2], points[1]), 1 / (1 - middle))];
  if (t < 0) return { point: add(points[0], mul(derivatives[0], t)), tangent: derivatives[0] };
  if (t > 1) return { point: add(points[2], mul(derivatives[2], t - 1)), tangent: derivatives[2] };
  const i = t < middle ? 0 : 1;
  const start = i === 0 ? 0 : middle;
  const span = i === 0 ? middle : 1 - middle;
  const u = (t - start) / span;
  const a = points[i], b = points[i + 1];
  const da = mul(derivatives[i], span), db = mul(derivatives[i + 1], span);
  const blend = weights => [0, 1].map(axis => weights[0] * a[axis] + weights[1] * da[axis] + weights[2] * b[axis] + weights[3] * db[axis]);
  return {
    point: blend([2 * u ** 3 - 3 * u ** 2 + 1, u ** 3 - 2 * u ** 2 + u, -2 * u ** 3 + 3 * u ** 2, u ** 3 - u ** 2]),
    tangent: mul(blend([6 * u ** 2 - 6 * u, 3 * u ** 2 - 4 * u + 1, -6 * u ** 2 + 6 * u, 3 * u ** 2 - 2 * u]), 1 / span),
  };
}

export function limbWarp(key, target) {
  const rest = limbRigs[key].points;
  const axis = sub(rest[2], rest[0]);
  const lengthSquared = dot(axis, axis);
  const middle = dot(sub(rest[1], rest[0]), axis) / lengthSquared;
  return point => {
    const t = dot(sub(point, rest[0]), axis) / lengthSquared;
    const before = spine(rest, middle, t);
    const after = spine(target, middle, t);
    const angle = Math.hypot(...after.tangent) < 0.0001 ? 0 : Math.atan2(after.tangent[1], after.tangent[0]) - Math.atan2(before.tangent[1], before.tangent[0]);
    return add(after.point, rotate(sub(point, before.point), angle));
  };
}

function bezier(a, b, c, d, t) {
  const s = 1 - t;
  return [0, 1].map(axis => s ** 3 * a[axis] + 3 * s ** 2 * t * b[axis] + 3 * s * t ** 2 * c[axis] + t ** 3 * d[axis]);
}
function tangent(a, b, c, d, t) {
  return [0, 1].map(axis => 3 * (1 - t) ** 2 * (b[axis] - a[axis]) + 6 * (1 - t) * t * (c[axis] - b[axis]) + 3 * t ** 2 * (d[axis] - c[axis]));
}
function mappedHandle(warp, point, handle) {
  const epsilon = 0.0005;
  return mul(sub(warp(add(point, mul(handle, epsilon))), warp(point)), 1 / epsilon);
}

// Subdivision keeps long Bezier paths smooth through an elbow/knee. Each
// control tangent is mapped through the local derivative of the deformation.
export function warpPath(path, warp) {
  const result = { ...path, v: [], i: [], o: [] };
  const segments = path.c ? path.v.length : path.v.length - 1;
  let first = true;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % path.v.length;
    const a = path.v[index], b = add(a, path.o[index]);
    const d = path.v[next], c = add(d, path.i[next]);
    const length = Math.hypot(...sub(b, a)) + Math.hypot(...sub(c, b)) + Math.hypot(...sub(d, c));
    const pieces = Math.max(1, Math.min(48, Math.ceil(length / 12)));
    for (let part = 0; part < pieces; part++) {
      const t0 = part / pieces, t1 = (part + 1) / pieces;
      const start = bezier(a, b, c, d, t0), end = bezier(a, b, c, d, t1);
      if (first) { result.v.push(warp(start)); result.i.push([0, 0]); result.o.push([0, 0]); first = false; }
      result.o[result.o.length - 1] = mappedHandle(warp, start, mul(tangent(a, b, c, d, t0), 1 / (3 * pieces)));
      const incoming = mappedHandle(warp, end, mul(tangent(a, b, c, d, t1), -1 / (3 * pieces)));
      if (path.c && index === segments - 1 && part === pieces - 1) result.i[0] = incoming;
      else { result.v.push(warp(end)); result.i.push(incoming); result.o.push([0, 0]); }
    }
  }
  return result;
}

export function deformLimb(layer, key, target) {
  if (!target || target.every((point, index) => point.every((value, axis) => value === limbRigs[key].points[index][axis]))) return;
  const warp = limbWarp(key, target);
  const visit = items => {
    for (const item of items || []) {
      if (item.ty === 'gr') visit(item.it);
      if (item.ty === 'sh' && item.ks?.k?.v) item.ks.k = warpPath(item.ks.k, warp);
      if (item.ty === 'gf' || item.ty === 'gs') {
        if (Array.isArray(item.s?.k)) item.s.k = warp(item.s.k);
        if (Array.isArray(item.e?.k)) item.e.k = warp(item.e.k);
      }
    }
  };
  visit(layer.shapes);
  for (const mask of layer.masksProperties || []) if (mask.pt?.k?.v) mask.pt.k = warpPath(mask.pt.k, warp);
}

// Native 002 coordinates -> 768 px model image -> transformed scene object.
export function boneToWorld(layer, key, point) {
  const pivot = limbRigs[key].points[0];
  const angle = (layer.pose?.[key] || 0) * Math.PI / 180;
  const posed = add(pivot, rotate(sub(point, pivot), angle));
  const local = [(posed[0] * 1.24 + 73 - 384) * layer.width / 768 * (layer.flipX ? -1 : 1), (posed[1] * 1.24 - 33 - 384) * layer.height / 768 * (layer.flipY ? -1 : 1)];
  return add([layer.x, layer.y], rotate(local, layer.rotation * Math.PI / 180));
}

export function worldToBone(layer, key, point) {
  const local = rotate(sub(point, [layer.x, layer.y]), -layer.rotation * Math.PI / 180);
  const posed = [(local[0] * (layer.flipX ? -1 : 1) * 768 / layer.width + 384 - 73) / 1.24, (local[1] * (layer.flipY ? -1 : 1) * 768 / layer.height + 384 + 33) / 1.24];
  const pivot = limbRigs[key].points[0];
  return add(pivot, rotate(sub(posed, pivot), -(layer.pose?.[key] || 0) * Math.PI / 180));
}
