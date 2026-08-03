/**
 * ตรวจค่าคอนฟิกที่ "ห้ามพลาด" ตอนรันจริง (Phase 8)
 *
 * ยอมให้แอปไม่ขึ้นเลย ดีกว่าขึ้นมาแล้วใช้ JWT secret ค่าตัวอย่างที่ใครก็เดาได้
 * — ปัญหาแบบนั้นไม่มีอะไรเตือนและอยู่กับระบบไปเงียบๆ
 *
 * ตรวจเฉพาะเมื่อ `NODE_ENV=production` เพื่อให้ dev/เทสต์รันได้โดยไม่ต้องตั้งค่าเพิ่ม
 */

/** ค่าที่แจกมาใน .env.example — ถ้ายังเป็นค่านี้อยู่แปลว่ายังไม่ได้ตั้งของจริง */
export const PLACEHOLDER_SECRETS = ['change-me-in-production', 'changeme', 'secret'];

const MIN_SECRET_LENGTH = 32;

export interface EnvIssue {
  variable: string;
  problem: string;
}

/** คืนรายการปัญหาที่พบ (ว่าง = ผ่าน) — แยกจากการ throw เพื่อให้เทสต์ตรวจได้ตรงๆ */
export function findProductionEnvIssues(env: NodeJS.ProcessEnv): EnvIssue[] {
  const issues: EnvIssue[] = [];

  if ((env.NODE_ENV ?? '') !== 'production') {
    return issues;
  }

  const jwtSecret = env.JWT_SECRET?.trim() ?? '';
  if (jwtSecret.length === 0) {
    issues.push({ variable: 'JWT_SECRET', problem: 'ยังไม่ได้ตั้งค่า' });
  } else if (PLACEHOLDER_SECRETS.includes(jwtSecret.toLowerCase())) {
    issues.push({
      variable: 'JWT_SECRET',
      problem: 'ยังเป็นค่าตัวอย่างจาก .env.example — ต้องเปลี่ยนเป็นค่าสุ่มของตัวเอง',
    });
  } else if (jwtSecret.length < MIN_SECRET_LENGTH) {
    issues.push({
      variable: 'JWT_SECRET',
      problem: `สั้นเกินไป (${jwtSecret.length} ตัวอักษร) ต้องยาวอย่างน้อย ${MIN_SECRET_LENGTH} — ใช้ \`openssl rand -base64 48\``,
    });
  }

  if ((env.DATABASE_URL ?? '').trim().length === 0) {
    issues.push({ variable: 'DATABASE_URL', problem: 'ยังไม่ได้ตั้งค่า' });
  }

  return issues;
}

/** @throws Error ถ้าค่าคอนฟิกยังไม่พร้อมสำหรับ production */
export function assertProductionEnv(env: NodeJS.ProcessEnv = process.env): void {
  const issues = findProductionEnvIssues(env);
  if (issues.length === 0) {
    return;
  }

  const details = issues.map((issue) => `  - ${issue.variable}: ${issue.problem}`).join('\n');
  throw new Error(
    `ค่าคอนฟิกสำหรับใช้งานจริงยังไม่ครบ จึงไม่เริ่มระบบ:\n${details}\n` +
      'ตั้งค่าใน .env ที่ root (ดูตัวอย่างใน .env.example) แล้วรันใหม่',
  );
}
