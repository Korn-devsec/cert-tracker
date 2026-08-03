/**
 * ตัวห่อบางๆ ให้คำสั่ง `prisma db seed` (ใช้ตอน dev ผ่าน ts-node)
 *
 * ตัวโค้ดจริงอยู่ที่ `src/seed.ts` เพื่อให้ถูกคอมไพล์ลง `dist` — container จะรัน
 * `node dist/seed.js` ได้โดยไม่ต้องมี ts-node หรือซอร์สอยู่ใน image (ดู DECISIONS.md — Phase 8)
 */
import { main } from '../src/seed';

main().catch((error: unknown) => {
  console.error('Seed ล้มเหลว:', error);
  process.exitCode = 1;
});
