import { hashPassword, verifyPassword } from './password';

describe('password (scrypt)', () => {
  const plain = 'S3cret-Passw0rd!';

  it('hash แล้ว verify กลับได้', async () => {
    const hash = await hashPassword(plain);
    await expect(verifyPassword(plain, hash)).resolves.toBe(true);
  });

  it('รหัสผ่านผิด → false', async () => {
    const hash = await hashPassword(plain);
    await expect(verifyPassword('wrong-password', hash)).resolves.toBe(false);
  });

  it('salt สุ่มใหม่ทุกครั้ง — รหัสผ่านเดียวกันได้ hash ไม่ซ้ำ', async () => {
    const [first, second] = await Promise.all([hashPassword(plain), hashPassword(plain)]);
    expect(first).not.toBe(second);
    await expect(verifyPassword(plain, first)).resolves.toBe(true);
    await expect(verifyPassword(plain, second)).resolves.toBe(true);
  });

  it('เก็บในรูปแบบ scheme$salt$key และไม่มีรหัสผ่านดิบอยู่ในนั้น', async () => {
    const hash = await hashPassword(plain);
    expect(hash.split('$')).toHaveLength(3);
    expect(hash.startsWith('scrypt$')).toBe(true);
    expect(hash).not.toContain(plain);
  });

  it.each(['', 'not-a-hash', 'scrypt$onlysalt', 'bcrypt$abc$def', 'scrypt$$'])(
    'hash รูปแบบผิด (%s) → false ไม่ throw',
    async (badHash) => {
      await expect(verifyPassword(plain, badHash)).resolves.toBe(false);
    },
  );

  it('รหัสผ่านว่าง → throw', async () => {
    await expect(hashPassword('')).rejects.toThrow();
  });
});
