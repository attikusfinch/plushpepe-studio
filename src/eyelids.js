const constant = k => ({ a: 0, k });

function flatten(items) {
  return items.flatMap(item => item.ty === 'gr' ? flatten(item.it) : [item]);
}

// An upper cap uses the eye's own outline and material, so stitches, metallic
// gradients and differently shaped eyes retain the style of their model.
export function eyelidLayer(eye, bounds, amount, parent, ind) {
  if (amount <= 0) return null;
  const shapes = flatten(eye.shapes);
  const outline = shapes.find(shape => shape.ty === 'sh' && shape.ks?.k?.c);
  const stroke = shapes.find(shape => ['gs', 'st'].includes(shape.ty) && !shape.d);
  if (!outline || !stroke) return null;
  const fill = stroke.ty === 'gs'
    ? { ty: 'gf', g: structuredClone(stroke.g), s: structuredClone(stroke.s), e: structuredClone(stroke.e), t: stroke.t }
    : { ty: 'fl', c: structuredClone(stroke.c) };
  Object.assign(fill, { nm: 'Eyelid material', o: constant(100), r: 1, bm: 0 });
  const { x, y, width: w, height: h } = bounds;
  const bottom = y + h * amount, margin = w * .1;
  // A slightly slanted, curved edge follows the relaxed expression of 002.
  const cap = { c: true,
    v: [[x - margin, y - h], [x + w + margin, y - h], [x + w + margin, bottom - h * .07], [x - margin, bottom + h * .14]],
    i: [[0, 0], [0, 0], [0, 0], [w * .35, -h * .16]],
    o: [[0, 0], [0, 0], [-w * .35, -h * .09], [0, 0]],
  };
  return {
    ty: 4, ind, nm: `Upper eyelid / ${eye.ind}`, parent, ddd: 0,
    ip: eye.ip, op: eye.op, st: 0, sr: 1,
    ks: { o: constant(100), p: constant([0, 0, 0]), a: constant([0, 0, 0]), r: constant(0), s: constant([100, 100, 100]) },
    shapes: [{ ty: 'gr', nm: 'Upper eyelid', it: [structuredClone(outline), fill,
      { ty: 'tr', o: constant(100), p: constant([0, 0]), a: constant([0, 0]), r: constant(0), s: constant([100, 100]) }] }],
    hasMask: true,
    masksProperties: [{ inv: false, mode: 'a', nm: 'Soft upper edge', x: constant(0), o: constant(100), pt: constant(cap) }],
  };
}
