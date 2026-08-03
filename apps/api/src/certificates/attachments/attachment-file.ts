/**
 * กฎเรื่องไฟล์แนบ — แยกเป็นฟังก์ชันล้วนเพื่อเทสต์ได้โดยไม่ต้องแตะดิสก์หรือ DB
 *
 * สองเรื่องที่ต้องระวังที่สุด:
 *  1. ห้ามให้ชื่อไฟล์จาก client มีผลต่อ path ที่เขียนลงดิสก์ (path traversal)
 *  2. ไม่รับไฟล์ที่มี private key อยู่ข้างใน — ระบบนี้ติดตามวงจรชีวิต cert ไม่ใช่ที่เก็บกุญแจ
 */
import { basename, extname, relative, resolve, sep } from 'node:path';

/** ไฟล์รับรอง / คำขอ / เอกสารประกอบที่ใช้งานจริงในกระบวนการต่ออายุ */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  '.pem',
  '.crt',
  '.cer',
  '.der',
  '.csr',
  '.p7b',
  '.p7c',
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.txt',
  '.log',
  '.zip',
  '.xlsx',
  '.docx',
] as const;

/** นามสกุลที่ปฏิเสธพร้อมเหตุผล เพราะไฟล์รูปแบบนี้มี private key รวมอยู่ */
export const PRIVATE_KEY_EXTENSIONS = ['.key', '.pfx', '.p12', '.jks', '.pk8'] as const;

export type AttachmentCheck = { ok: true } | { ok: false; reason: string };

/** นามสกุลตัวพิมพ์เล็กของชื่อไฟล์ (ตัด path ที่ client อาจแนบมาออกก่อน) */
export function attachmentExtension(filename: string): string {
  return extname(safeOriginalName(filename)).toLowerCase();
}

/** ชื่อไฟล์ที่ปลอดภัยพอจะเก็บลง DB และส่งกลับตอนดาวน์โหลด (ไม่มีส่วนของ path) */
export function safeOriginalName(filename: string): string {
  return basename(filename.replace(/\\/g, '/')).trim();
}

/**
 * ชื่อไฟล์ที่มาจาก multipart form
 *
 * busboy (ที่ multer ใช้) ถอดรหัสส่วนหัว `filename` เป็น latin1 ทำให้ชื่อไฟล์ภาษาไทย
 * กลายเป็นตัวอักษรขยะ (`ใบรับรอง.pem` → `à¹à¸à¸£...`) ถ้าเก็บลง DB แบบนั้น
 * ผู้ใช้จะดาวน์โหลดกลับมาแล้วอ่านชื่อไฟล์ไม่ได้เลย จึงแปลงกลับเป็น UTF-8 ที่ขอบทางเข้า
 *
 * แปลงเฉพาะกรณีที่เข้าเงื่อนไขจริง — ถ้าชื่อไฟล์ถูกต้องอยู่แล้วหรือถอดกลับไม่ได้ ให้คงค่าเดิม
 */
export function decodeUploadFilename(rawName: string): string {
  const codePoints = [...rawName].map((character) => character.codePointAt(0) ?? 0);
  if (codePoints.every((code) => code < 0x80)) {
    return rawName; // ASCII ล้วน ไม่มีอะไรต้องแก้
  }
  if (codePoints.some((code) => code > 0xff)) {
    return rawName; // มีอักขระที่ latin1 สร้างไม่ได้ = ถอดรหัสมาถูกแล้ว
  }
  const decoded = Buffer.from(rawName, 'latin1').toString('utf8');
  const replacementChar = String.fromCharCode(0xfffd);
  // U+FFFD = ลำดับไบต์ไม่ใช่ UTF-8 (เช่นชื่อ latin1 จริงๆ อย่าง café.pem) → ไม่ใช่กรณีที่ต้องแปลง
  return decoded.includes(replacementChar) ? rawName : decoded;
}

export function checkAttachment(filename: string): AttachmentCheck {
  const name = safeOriginalName(filename);
  if (name.length === 0) {
    return { ok: false, reason: 'ไม่มีชื่อไฟล์' };
  }

  const extension = attachmentExtension(name);
  if (extension.length === 0) {
    return { ok: false, reason: `ไฟล์ "${name}" ไม่มีนามสกุล` };
  }
  if ((PRIVATE_KEY_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      reason:
        `ไม่รับไฟล์ ${extension} เพราะเป็นรูปแบบที่มี private key อยู่ข้างใน — ` +
        'แนบได้เฉพาะใบรับรอง (.pem/.crt/.cer), คำขอ (.csr) และเอกสารประกอบ',
    };
  }
  if (!(ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(extension)) {
    return {
      ok: false,
      reason:
        `นามสกุล ${extension} ไม่อยู่ในรายการที่รองรับ — ` +
        `รองรับ ${ALLOWED_ATTACHMENT_EXTENSIONS.join(', ')}`,
    };
  }
  return { ok: true };
}

/**
 * path ที่เก็บใน DB — เก็บแบบ **relative ต่อ UPLOAD_DIR** เพื่อให้ย้ายที่เก็บไฟล์ได้
 * ชื่อไฟล์บนดิสก์ใช้ id ที่ระบบสร้าง ไม่ใช้ชื่อจาก client เลย
 */
export function buildStoredPath(
  certificateId: string,
  storedId: string,
  extension: string,
): string {
  return `${certificateId}/${storedId}${extension}`;
}

/**
 * แปลง path ใน DB เป็น absolute path พร้อมยืนยันว่ายังอยู่ใต้ UPLOAD_DIR
 * (กันกรณีข้อมูลในตารางถูกแก้ให้ชี้ออกนอกโฟลเดอร์ เช่น `../../.env`)
 */
export function resolveStoredPath(uploadDir: string, storedPath: string): string {
  const root = resolve(uploadDir);
  const target = resolve(root, storedPath);
  const relativePath = relative(root, target);
  if (relativePath.length === 0 || relativePath.startsWith(`..${sep}`) || relativePath === '..') {
    throw new Error(`path ของไฟล์แนบออกนอก UPLOAD_DIR: ${storedPath}`);
  }
  return target;
}

/**
 * ส่วนหัว Content-Disposition ที่รองรับชื่อไฟล์ภาษาไทย
 * (ชื่อแบบ ASCII เป็นตัวสำรองให้ client รุ่นเก่า ส่วน `filename*` เป็นตัวจริงตาม RFC 5987)
 */
export function contentDisposition(filename: string): string {
  const name = safeOriginalName(filename);
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}
