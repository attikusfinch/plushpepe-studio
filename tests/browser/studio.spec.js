import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const fixtures = path.resolve('tests/fixtures');
const upload = page => page.locator('input[type=file]').first();
const choose = (page, name) => page.getByRole('button', { name: `Выбрать слой ${name}`, exact: true });
async function start(page) {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Добавить Пепе/ })).toHaveCount(50);
  await expect(page.getByText('Сохранено на устройстве')).toBeVisible();
}
async function exportFile(page, format, output) {
  await page.getByRole('button', { name: 'Экспорт', exact: true }).click();
  if (format === 'jpg') await page.getByRole('button', { name: 'JPG Компактная картинка' }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать изображение' }).click();
  const result = await download; await result.saveAs(output);
  return readFile(output);
}
async function pixel(page, bytes, x, y) {
  return page.evaluate(async ({ base64, x, y }) => {
    const image = new Image(); image.src = `data:image/${base64.startsWith('/9j') ? 'jpeg' : 'png'};base64,${base64}`; await image.decode();
    const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
    const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
    return { width: image.width, height: image.height, rgba: Array.from(ctx.getImageData(x, y, 1, 1).data) };
  }, { base64: bytes.toString('base64'), x, y });
}

test('compose, pose, transform, layer controls, undo and export', async ({ page }, testInfo) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await start(page);
  await page.getByRole('button', { name: 'Добавить Пепе 034', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Название слоя' })).toHaveValue('Pepe 034 · Радуга');
  await page.getByRole('button', { name: 'Ура!', exact: true }).click();
  await page.getByText('Настроить руки и ноги', { exact: true }).click();
  await expect(page.getByRole('slider', { name: 'Рука слева', exact: true })).toHaveValue('135');
  await page.getByRole('spinbutton', { name: 'X', exact: true }).fill('440');
  await page.getByRole('spinbutton', { name: 'Поворот', exact: true }).fill('12');
  await page.getByRole('button', { name: 'Отразить по горизонтали', exact: true }).click();
  await page.getByRole('button', { name: 'Дублировать слой', exact: true }).click();
  await expect(choose(page, 'Pepe 034 · Радуга · копия')).toBeVisible();
  await page.getByRole('button', { name: 'Удалить слой', exact: true }).click();
  await expect(choose(page, 'Pepe 034 · Радуга · копия')).toHaveCount(0);
  await page.getByRole('button', { name: 'Отменить · Ctrl+Z', exact: true }).click();
  await expect(choose(page, 'Pepe 034 · Радуга · копия')).toBeVisible();
  await choose(page, 'Pepe 034 · Радуга').click();
  await page.getByRole('button', { name: 'Заблокировать Pepe 034 · Радуга', exact: true }).click();
  await expect(page.getByRole('spinbutton', { name: 'X', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Разблокировать Pepe 034 · Радуга', exact: true }).click();
  await page.getByRole('button', { name: 'Слой ниже', exact: true }).click();
  await page.getByRole('button', { name: 'Скрыть Pepe 034 · Радуга', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Показать Pepe 034 · Радуга', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Показать Pepe 034 · Радуга', exact: true }).click();
  const bytes = await exportFile(page, 'png', testInfo.outputPath('composition.png'));
  expect(bytes.readUInt32BE(16)).toBe(1080); expect(bytes.readUInt32BE(20)).toBe(1080);
  expect(bytes.length).toBeGreaterThan(100000);
  await page.screenshot({ path: testInfo.outputPath('editor.png') });
  expect(errors).toEqual([]);
});

test('animated TGS frame selection changes actual exported pixels', async ({ page }, testInfo) => {
  await start(page);
  await page.getByRole('tab', { name: 'Стикеры', exact: true }).click();
  await page.getByRole('button', { name: 'Добавить стикер 002', exact: true }).click();
  const frame = page.getByRole('spinbutton', { name: 'Кадр', exact: true });
  await expect(frame).toBeVisible(); await frame.fill('3');
  const first = await exportFile(page, 'png', testInfo.outputPath('frame-3.png'));
  await frame.fill('35');
  const second = await exportFile(page, 'png', testInfo.outputPath('frame-35.png'));
  expect(first.equals(second)).toBe(false);
  await page.getByRole('button', { name: 'Просмотреть анимацию' }).click();
  await expect(frame).not.toHaveValue('35');
  await page.getByRole('button', { name: 'Остановить анимацию' }).click();
});

test('image and animated imports survive project save and restore', async ({ page }, testInfo) => {
  await start(page);
  await upload(page).setInputFiles([path.join(fixtures, 'red.png'), path.join(fixtures, 'motion.gif'), path.join(fixtures, 'motion.webp'), path.resolve('assets/sources/tgs/002.tgs')]);
  await expect(choose(page, '002.tgs')).toBeVisible();
  for (const name of ['motion.gif', 'motion.webp']) {
    await choose(page, name).click();
    const frame = page.getByRole('spinbutton', { name: 'Кадр', exact: true });
    await expect(frame).toBeVisible(); await frame.fill('2');
    await expect(frame).toHaveValue('2');
  }
  const saved = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Сохранить проект · Ctrl+S' }).click();
  const projectFile = testInfo.outputPath('project.plush.json'); await (await saved).saveAs(projectFile);
  const project = JSON.parse(await readFile(projectFile, 'utf8'));
  expect(Object.keys(project.assets)).toHaveLength(4);
  expect(project.layers.filter(layer => layer.type === 'image')).toHaveLength(4);
  await expect(page.getByText('Сохранено на устройстве')).toBeVisible();
  await page.reload();
  await expect(choose(page, 'motion.gif')).toBeVisible();
  await page.locator('input[type=file]').nth(1).setInputFiles(projectFile);
  await expect(page.getByText('Проект открыт.', { exact: true })).toBeVisible();
  await choose(page, 'motion.webp').click();
  await expect(page.getByRole('spinbutton', { name: 'Кадр', exact: true })).toHaveValue('2');
});

test('custom canvas exports transparency in PNG and white in JPG', async ({ page }, testInfo) => {
  await start(page);
  await page.getByRole('button', { name: 'Холст', exact: true }).click();
  await page.getByRole('spinbutton', { name: 'Ширина', exact: true }).fill('640');
  await page.getByRole('spinbutton', { name: 'Высота', exact: true }).fill('480');
  await page.getByRole('checkbox', { name: 'Прозрачный фон', exact: true }).check();
  const png = await exportFile(page, 'png', testInfo.outputPath('transparent.png'));
  expect(await pixel(page, png, 0, 0)).toEqual({ width: 640, height: 480, rgba: [0, 0, 0, 0] });
  const jpg = await exportFile(page, 'jpg', testInfo.outputPath('white.jpg'));
  expect(await pixel(page, jpg, 0, 0)).toEqual({ width: 640, height: 480, rgba: [255, 255, 255, 255] });
});
