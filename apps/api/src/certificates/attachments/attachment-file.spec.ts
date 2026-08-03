import { resolve } from 'node:path';
import {
  attachmentExtension,
  buildStoredPath,
  checkAttachment,
  contentDisposition,
  decodeUploadFilename,
  resolveStoredPath,
  safeOriginalName,
} from './attachment-file';

const UPLOAD_DIR = resolve('/srv/cert-tracker/uploads');
const CERT_ID = '11111111-1111-4111-8111-111111111111';

describe('safeOriginalName / attachmentExtension', () => {
  it.each([
    ['../../.env', '.env'],
    ['C:\\Windows\\System32\\evil.pem', 'evil.pem'],
    ['/etc/passwd', 'passwd'],
    ['  wildcard.crt  ', 'wildcard.crt'],
  ])('ตัดส่วนที่เป็น path ออกจาก "%s"', (input, expected) => {
    expect(safeOriginalName(input)).toBe(expected);
  });

  it('นามสกุลไม่สนตัวพิมพ์', () => {
    expect(attachmentExtension('CERT.PEM')).toBe('.pem');
  });
});

describe('decodeUploadFilename — ชื่อไฟล์จาก multipart ที่ถูกอ่านเป็น latin1', () => {
  /** สิ่งที่ multer/busboy ส่งมาจริงเมื่อ client ส่งชื่อไฟล์ UTF-8 */
  const asLatin1 = (name: string): string => Buffer.from(name, 'utf8').toString('latin1');

  it.each(['ใบรับรอง.pem', 'ใบรับรอง ปี 2569.pdf', '证书.crt'])('คืนชื่อเดิมของ "%s"', (name) => {
    expect(decodeUploadFilename(asLatin1(name))).toBe(name);
  });

  it('ชื่อ ASCII ล้วน → ไม่แตะต้อง', () => {
    expect(decodeUploadFilename('wildcard.pem')).toBe('wildcard.pem');
  });

  it('ชื่อที่ถอดรหัสมาถูกแล้ว (มีอักขระเกินช่วง latin1) → ไม่แปลงซ้ำ', () => {
    expect(decodeUploadFilename('ใบรับรอง.pem')).toBe('ใบรับรอง.pem');
  });

  it('ชื่อ latin1 จริงๆ ที่ไม่ใช่ UTF-8 → คงค่าเดิม ไม่ทำให้เพี้ยน', () => {
    expect(decodeUploadFilename('café.pem')).toBe('café.pem');
  });
});

describe('checkAttachment', () => {
  it.each(['cert.pem', 'chain.crt', 'server.cer', 'request.csr', 'อนุมัติ.pdf', 'proof.png'])(
    'รับไฟล์ %s',
    (filename) => {
      expect(checkAttachment(filename)).toEqual({ ok: true });
    },
  );

  it.each(['server.key', 'bundle.pfx', 'store.p12', 'keystore.jks'])(
    'ปฏิเสธ %s เพราะมี private key อยู่ในไฟล์',
    (filename) => {
      const result = checkAttachment(filename);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toContain('private key');
      }
    },
  );

  it.each(['payload.exe', 'script.sh', 'macro.xlsm'])(
    'ปฏิเสธนามสกุลที่ไม่รองรับ (%s)',
    (filename) => {
      expect(checkAttachment(filename).ok).toBe(false);
    },
  );

  it('ไฟล์ที่ไม่มีนามสกุล → ปฏิเสธ', () => {
    const result = checkAttachment('README');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('ไม่มีนามสกุล');
    }
  });

  it('ชื่อไฟล์ว่าง → ปฏิเสธ', () => {
    expect(checkAttachment('   ').ok).toBe(false);
  });

  it('ชื่อไฟล์ที่มี path ปะปน ถูกตรวจจากนามสกุลจริงหลังตัด path', () => {
    expect(checkAttachment('../../secrets/id_rsa.key').ok).toBe(false);
    expect(checkAttachment('../../certs/wildcard.pem')).toEqual({ ok: true });
  });
});

describe('buildStoredPath / resolveStoredPath', () => {
  it('ชื่อไฟล์บนดิสก์ใช้ id ที่ระบบสร้าง ไม่ใช้ชื่อจากผู้ใช้', () => {
    const stored = buildStoredPath(CERT_ID, 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', '.pem');
    expect(stored).toBe(`${CERT_ID}/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.pem`);
  });

  it('path ที่อยู่ใต้ UPLOAD_DIR → คืน absolute path', () => {
    const stored = buildStoredPath(CERT_ID, 'file-id', '.crt');
    expect(resolveStoredPath(UPLOAD_DIR, stored)).toBe(resolve(UPLOAD_DIR, stored));
  });

  it.each(['../../../etc/passwd', `..${'/'}..${'/'}.env`, '/etc/passwd'])(
    'path ที่ออกนอก UPLOAD_DIR (%s) → throw',
    (badPath) => {
      expect(() => resolveStoredPath(UPLOAD_DIR, badPath)).toThrow();
    },
  );

  it('path ว่าง (ชี้ที่ตัวโฟลเดอร์เอง) → throw', () => {
    expect(() => resolveStoredPath(UPLOAD_DIR, '')).toThrow();
  });
});

describe('contentDisposition', () => {
  it('ชื่อไฟล์ภาษาไทยส่งเป็น filename* แบบ UTF-8 พร้อมตัวสำรอง ASCII', () => {
    const header = contentDisposition('ใบรับรอง 2569.pdf');
    expect(header).toContain("filename*=UTF-8''");
    expect(header).toContain(encodeURIComponent('ใบรับรอง 2569.pdf'));
    expect(header).toMatch(/filename="[\x20-\x7e]+"/);
  });

  it('อัญประกาศในชื่อไฟล์ไม่ทำให้ header เพี้ยน', () => {
    expect(contentDisposition('we"ird.pem')).toContain('filename="we_ird.pem"');
  });
});
