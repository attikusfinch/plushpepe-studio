import { test, expect } from '@playwright/test';

test('all 50 figures render with visible artwork and no clipped raised limbs', async ({ page }) => {
  test.setTimeout(120000);
  await page.goto('/');
  const report = await page.evaluate(async () => {
    const { renderLayer } = await import('/src/media.js');
    const { poses } = await import('/src/core.js');
    const output = [];
    for (let number = 34; number <= 83; number++) {
      for (const pose of [poses[0], poses[3]]) {
        const modelId = String(number).padStart(3, '0');
        const canvas = await renderLayer({ type: 'pepe', modelId, pose: pose.values }, {});
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let visible = 0; let edge = 0;
        for (let offset = 3; offset < pixels.length; offset += 4) {
          if (pixels[offset] < 10) continue;
          visible++;
          const index = (offset - 3) / 4; const x = index % canvas.width; const y = Math.floor(index / canvas.width);
          if (x < 2 || y < 2 || x >= canvas.width - 2 || y >= canvas.height - 2) edge++;
        }
        output.push({ modelId, pose: pose.id, visible, edge });
      }
    }
    return output;
  });
  expect(report).toHaveLength(100);
  for (const item of report) {
    expect(item.visible, `${item.modelId} ${item.pose}: empty or missing artwork`).toBeGreaterThan(65000);
    expect(item.edge, `${item.modelId} ${item.pose}: clipped limb`).toBe(0);
  }
});

test('WebM import can seek to a different moment and export it', async ({ page }) => {
  await page.goto('/');
  const bytes = await page.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = 120;
    const context = canvas.getContext('2d');
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp9' });
    const parts = []; recorder.ondataavailable = event => parts.push(event.data);
    const stopped = new Promise(resolve => { recorder.onstop = resolve; });
    recorder.start();
    for (let frame = 0; frame < 20; frame++) {
      context.fillStyle = frame < 10 ? '#ff0055' : '#0066ff'; context.fillRect(0, 0, 120, 120);
      await new Promise(resolve => setTimeout(resolve, 35));
    }
    recorder.stop(); await stopped; stream.getTracks().forEach(track => track.stop());
    return Array.from(new Uint8Array(await new Blob(parts, { type: 'video/webm' }).arrayBuffer()));
  });
  await page.locator('input[type=file]').first().setInputFiles({ name: 'motion.webm', mimeType: 'video/webm', buffer: Buffer.from(bytes) });
  await expect(page.getByRole('heading', { name: 'Момент видео', exact: true })).toBeVisible();
  const frame = page.getByRole('spinbutton', { name: 'Кадр', exact: true });
  await frame.fill('15'); await expect(frame).toHaveValue('15');
  const file = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  await page.getByRole('button', { name: 'Скачать изображение' }).click();
  expect((await file).suggestedFilename()).toMatch(/\.png$/);
});
