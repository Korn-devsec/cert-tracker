// tsc คอมไพล์ ESM ออกมาเป็นไฟล์ .js — ต้องมี package.json { "type": "module" }
// วางไว้ใน dist/esm เพื่อให้ Node/bundler ตีความเป็น ES module (ส่วน dist/cjs ยังเป็น CommonJS ตามค่า default)
import { mkdirSync, writeFileSync } from 'node:fs';

const esmDir = new URL('../dist/esm/', import.meta.url);
mkdirSync(esmDir, { recursive: true });
writeFileSync(
  new URL('package.json', esmDir),
  `${JSON.stringify({ type: 'module' }, null, 2)}\n`,
  'utf8',
);
