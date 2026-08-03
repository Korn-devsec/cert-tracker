import { assertProductionEnv, findProductionEnvIssues } from './env-check';

const VALID_SECRET = 'q7Zt3xR9vLk2sN8pW1yB4cM6dF0gH5jK';
const BASE = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://u:p@db:5432/x' };

describe('findProductionEnvIssues', () => {
  it('ไม่ใช่ production → ไม่ตรวจอะไรเลย (dev/เทสต์รันได้โดยไม่ต้องตั้งค่าเพิ่ม)', () => {
    expect(findProductionEnvIssues({ NODE_ENV: 'development' })).toEqual([]);
    expect(findProductionEnvIssues({ NODE_ENV: 'test' })).toEqual([]);
    expect(findProductionEnvIssues({})).toEqual([]);
  });

  it('ค่าครบและ secret ยาวพอ → ผ่าน', () => {
    expect(findProductionEnvIssues({ ...BASE, JWT_SECRET: VALID_SECRET })).toEqual([]);
  });

  it('ไม่ได้ตั้ง JWT_SECRET → รายงานปัญหา', () => {
    const issues = findProductionEnvIssues({ ...BASE });
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({ variable: 'JWT_SECRET', problem: 'ยังไม่ได้ตั้งค่า' });
  });

  it.each(['change-me-in-production', 'CHANGE-ME-IN-PRODUCTION', 'changeme', 'secret'])(
    'ยังใช้ค่าตัวอย่าง (%s) → รายงานปัญหา',
    (secret) => {
      const issues = findProductionEnvIssues({ ...BASE, JWT_SECRET: secret });
      expect(issues[0].variable).toBe('JWT_SECRET');
      expect(issues[0].problem).toContain('ค่าตัวอย่าง');
    },
  );

  it('secret สั้นเกินไป → รายงานพร้อมบอกวิธีสร้างค่าใหม่', () => {
    const issues = findProductionEnvIssues({ ...BASE, JWT_SECRET: 'สั้นมาก123' });
    expect(issues[0].problem).toContain('สั้นเกินไป');
    expect(issues[0].problem).toContain('openssl rand');
  });

  it('ไม่ได้ตั้ง DATABASE_URL → รายงานปัญหา', () => {
    const issues = findProductionEnvIssues({ NODE_ENV: 'production', JWT_SECRET: VALID_SECRET });
    expect(issues).toEqual([{ variable: 'DATABASE_URL', problem: 'ยังไม่ได้ตั้งค่า' }]);
  });

  it('ขาดหลายค่า → รายงานครบทุกข้อในครั้งเดียว (ไม่ให้แก้ทีละรอบ)', () => {
    expect(findProductionEnvIssues({ NODE_ENV: 'production' })).toHaveLength(2);
  });

  it('ช่องว่างล้วนถือว่าไม่ได้ตั้งค่า', () => {
    const issues = findProductionEnvIssues({ ...BASE, JWT_SECRET: '   ' });
    expect(issues[0].problem).toBe('ยังไม่ได้ตั้งค่า');
  });
});

describe('assertProductionEnv', () => {
  it('ผ่าน → ไม่ throw', () => {
    expect(() => assertProductionEnv({ ...BASE, JWT_SECRET: VALID_SECRET })).not.toThrow();
  });

  it('ไม่ผ่าน → throw พร้อมบอกทุกตัวแปรที่ต้องแก้และไฟล์ที่ต้องไปตั้ง', () => {
    expect(() => assertProductionEnv({ NODE_ENV: 'production' })).toThrow(/JWT_SECRET/);
    expect(() => assertProductionEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL/);
    expect(() => assertProductionEnv({ NODE_ENV: 'production' })).toThrow(/\.env\.example/);
  });
});
