import { acceptedHeadersFor, mapHeaders, normalizeHeaderName } from './header-mapping';

/** header จริงจาก sheet Report-SSL-Jul-2026 */
const JULY_HEADERS = [
  'No',
  'Common Name',
  'Endpoints',
  'Expires',
  'Days Until Expiry',
  'Issuer',
  'Signing Algorithm',
  'Owner',
  'Status',
  'Remark',
];

/** header จริงจาก sheet Report-SSL-Jun-2026 — มี `No.` และ typo `Onwer` */
const JUNE_HEADERS = [
  'No.',
  'Common Name',
  'Endpoints',
  'Expires',
  'Days Until Expiry',
  'Issuer',
  'Signing Algorithm',
  'Onwer',
  'Status',
  'Remark',
];

describe('normalizeHeaderName', () => {
  it.each([
    ['  Common Name  ', 'common name'],
    ['COMMON NAME', 'common name'],
    ['Days  Until   Expiry', 'days until expiry'],
    ['No.', 'no'],
    ['Status:', 'status'],
    ['Owner\u00a0', 'owner'], // non-breaking space ที่ Excel มักแทรกมา
  ])('%j → %j', (input, expected) => {
    expect(normalizeHeaderName(input)).toBe(expected);
  });
});

describe('mapHeaders — ไฟล์จริง', () => {
  it('sheet Jul: map ครบและอ้างตำแหน่งคอลัมน์ถูก', () => {
    const result = mapHeaders(JULY_HEADERS);

    expect(result.missingRequired).toEqual([]);
    expect(result.columns).toEqual({
      commonName: 2,
      endpoint: 3,
      expiresAt: 4,
      daysUntilExpiry: 5,
      issuer: 6,
      signatureAlgorithm: 7,
      owner: 8,
      status: 9,
      remark: 10,
    });
    // `No` ถูกข้าม ไม่ใช่ header ที่ไม่รู้จัก
    expect(result.unknownHeaders).toEqual([]);
  });

  it('sheet Jun: typo `Onwer` map เป็น owner และ `No.` ถูกข้าม', () => {
    const result = mapHeaders(JUNE_HEADERS);

    expect(result.missingRequired).toEqual([]);
    expect(result.columns.owner).toBe(8);
    expect(result.unknownHeaders).toEqual([]);
  });
});

describe('mapHeaders — สลับตำแหน่งคอลัมน์', () => {
  it('สลับลำดับแล้วยัง map ถูก (พิสูจน์ว่าไม่ได้อ้างตำแหน่ง)', () => {
    const swapped = mapHeaders([
      'Onwer',
      'Status',
      'CN',
      'Signature Algorithm',
      'Expiry Date',
      'Endpoint',
      'No.',
      'Issuer',
    ]);

    expect(swapped.missingRequired).toEqual([]);
    expect(swapped.columns).toEqual({
      owner: 1,
      status: 2,
      commonName: 3,
      signatureAlgorithm: 4,
      expiresAt: 5,
      endpoint: 6,
      issuer: 8,
    });
  });

  it('คอลัมน์เดียวกันย้ายที่ ผลลัพธ์ต่างกันแค่เลขคอลัมน์', () => {
    const a = mapHeaders(['Common Name', 'Expires']);
    const b = mapHeaders(['Expires', 'Common Name']);

    expect(a.columns).toEqual({ commonName: 1, expiresAt: 2 });
    expect(b.columns).toEqual({ expiresAt: 1, commonName: 2 });
    expect(a.missingRequired).toEqual(b.missingRequired);
  });
});

describe('mapHeaders — header ที่จำเป็นหาย', () => {
  it('ไม่มี Common Name → รายงานว่าหาย', () => {
    const result = mapHeaders(['No', 'Endpoints', 'Expires']);
    expect(result.missingRequired).toContain('commonName');
  });

  it('ไม่มีทั้ง Expires และ Days Until → รายงานว่าหาย', () => {
    const result = mapHeaders(['No', 'Common Name', 'Endpoints', 'Issuer', 'Owner', 'Status']);
    expect(result.missingRequired).toEqual(['expiresAt หรือ daysUntilExpiry']);
  });

  it('มี Days Until อย่างเดียว (ไม่มี Expires) → ผ่าน', () => {
    const result = mapHeaders(['Common Name', 'Days Until']);
    expect(result.missingRequired).toEqual([]);
  });

  it('มี Expires อย่างเดียว (ไม่มี Days Until) → ผ่าน', () => {
    const result = mapHeaders(['Common Name', 'Expires']);
    expect(result.missingRequired).toEqual([]);
  });

  it('sheet ว่าง → หายทั้ง commonName และวันหมดอายุ', () => {
    const result = mapHeaders([null, null, null]);
    expect(result.missingRequired).toEqual(['commonName', 'expiresAt หรือ daysUntilExpiry']);
  });
});

describe('mapHeaders — กรณีพิเศษ', () => {
  it('header ที่ไม่รู้จัก → warning ไม่ทำให้ล้ม', () => {
    const result = mapHeaders(['Common Name', 'Expires', 'คอลัมน์ลับ']);
    expect(result.missingRequired).toEqual([]);
    expect(result.unknownHeaders).toEqual([{ column: 3, name: 'คอลัมน์ลับ' }]);
  });

  it('header ซ้ำ (map ฟิลด์เดียวกัน) → ใช้คอลัมน์แรก และรายงานตัวที่ซ้ำ', () => {
    const result = mapHeaders(['Common Name', 'Expires', 'CN']);
    expect(result.columns.commonName).toBe(1);
    expect(result.duplicateFields).toEqual([{ field: 'commonName', column: 3, name: 'CN' }]);
  });

  it('เซลล์ว่างระหว่าง header ไม่ทำให้เลขคอลัมน์เพี้ยน', () => {
    const result = mapHeaders(['Common Name', null, 'Expires']);
    expect(result.columns).toEqual({ commonName: 1, expiresAt: 3 });
  });

  it('acceptedHeadersFor ใช้ประกอบข้อความ error ได้', () => {
    expect(acceptedHeadersFor('commonName')).toContain('common name');
    expect(acceptedHeadersFor('commonName')).toContain('cn');
    expect(acceptedHeadersFor('owner')).toContain('onwer');
  });
});
