import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { poseModel, poses, initialProject, validateProject, joints } from '../src/core.js';

test('all 50 models support the pose presets without losing masks or artwork', async () => {
  for (let id = 34; id <= 83; id++) {
    const source = JSON.parse(await readFile(new URL(`../public/models/standing/lottie/${String(id).padStart(3, '0')}.json`, import.meta.url)));
    const before = JSON.stringify(source);
    for (const pose of poses) {
      const result = poseModel(source, pose.values);
      assert.equal(result.layers.length, source.layers.length);
      assert.equal(result.w, 768);
      for (const [key, joint] of Object.entries(joints)) {
        const indices = id === 61 ? [joint.grey] : [4000 + joint.limb, 6000 + joint.limb, 6100 + joint.limb];
        const limb = result.layers.find(layer => layer.ind === indices[0]);
        assert.ok(limb, `${id}: ${key} missing`);
        for (const layer of result.layers.filter(item => indices.includes(item.ind))) {
          assert.equal(layer.ks.r.k, pose.values[key]);
          assert.deepEqual(layer.ks.a.k, [...joint.pivot, 0]);
          const original = source.layers.find(item => item.ind === layer.ind);
          assert.deepEqual(layer.shapes, original.shapes);
          assert.equal(layer.tt, original.tt);
          assert.equal(layer.td, original.td);
        }
      }
    }
    assert.equal(JSON.stringify(source), before, 'source is never mutated');
  }
});

test('project round-trip preserves composition, pose, visibility and order', () => {
  const project = initialProject();
  project.layers[2].visible = false;
  project.layers[3].locked = true;
  const restored = validateProject(JSON.parse(JSON.stringify(project)));
  assert.deepEqual(restored, project);
  restored.layers[0].x = 0;
  assert.notEqual(restored.layers[0].x, project.layers[0].x);
});

test('invalid project files are rejected before replacing the current scene', () => {
  const broken = [null, {}, { ...initialProject(), version: 2 }];
  const duplicate = initialProject(); duplicate.layers.push(duplicate.layers[0]); broken.push(duplicate);
  const huge = initialProject(); huge.canvas.width = 100000; broken.push(huge);
  const missing = initialProject(); missing.layers[0] = { ...missing.layers[0], type: 'image', assetId: 'missing' }; broken.push(missing);
  const external = initialProject(); external.assets.bad = { data: 'https://example.com/a.png', kind: 'image' }; broken.push(external);
  for (const value of broken) assert.throws(() => validateProject(value));
});
