/**
 * Hash/verify รหัสผ่านด้วย scrypt จาก node:crypto
 *
 * ใช้ของที่มีใน Node เพื่อไม่เพิ่ม dependency ที่ยังไม่ได้ตกลงกัน (ดู DECISIONS.md)
 * scrypt เป็น KDF ที่ทน brute-force (memory-hard) และเป็นตัวเลือกที่ NIST/OWASP ยอมรับ
 * ถ้าภายหลังต้องการเปลี่ยนเป็น bcrypt/argon2 ให้เปลี่ยนที่ไฟล์นี้ที่เดียว —
 * รูปแบบที่เก็บมี prefix ของ scheme อยู่แล้วจึงรองรับการย้ายแบบค่อยเป็นค่อยไปได้
 *
 * รูปแบบที่เก็บลง DB: `scrypt$<salt base64>$<derivedKey base64>`
 */
import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

// scrypt มี overload หลายแบบ ทำให้ promisify อนุมาน type ไม่ได้ จึงต้องระบุ signature ที่ใช้จริง
const scrypt = promisify(scryptCallback) as (
  password: string,
  salt: Buffer,
  keylen: number,
) => Promise<Buffer>;

const SCHEME = 'scrypt';
const SALT_BYTES = 16;
const KEY_BYTES = 64;

export async function hashPassword(plainPassword: string): Promise<string> {
  if (plainPassword.length === 0) {
    throw new Error('รหัสผ่านว่างไม่ได้');
  }
  const salt = randomBytes(SALT_BYTES);
  const derivedKey = await scrypt(plainPassword, salt, KEY_BYTES);
  return `${SCHEME}$${salt.toString('base64')}$${derivedKey.toString('base64')}`;
}

/** เทียบรหัสผ่านแบบ constant-time — คืน false เมื่อรูปแบบ hash ไม่ถูกต้อง (ไม่ throw) */
export async function verifyPassword(plainPassword: string, storedHash: string): Promise<boolean> {
  const [scheme, saltBase64, keyBase64] = storedHash.split('$');
  if (scheme !== SCHEME || !saltBase64 || !keyBase64) {
    return false;
  }

  const salt = Buffer.from(saltBase64, 'base64');
  const expectedKey = Buffer.from(keyBase64, 'base64');
  if (salt.length === 0 || expectedKey.length === 0) {
    return false;
  }

  const derivedKey = await scrypt(plainPassword, salt, expectedKey.length);
  return derivedKey.length === expectedKey.length && timingSafeEqual(derivedKey, expectedKey);
}
