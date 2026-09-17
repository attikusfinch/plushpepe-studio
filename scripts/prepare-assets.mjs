import { mkdir, readdir, copyFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const source = new URL('assets/sources/tgs/', root);
const target = new URL('public/stickers/', root);
await mkdir(target, { recursive: true });
for (const name of await readdir(source)) if (name.endsWith('.tgs')) await copyFile(new URL(name, source), new URL(name, target));
console.log('Original TGS stickers prepared for the app.');
