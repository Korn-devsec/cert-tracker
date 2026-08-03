import {
  cleanText,
  parseExcelDate,
  parseInteger,
  splitEndpoints,
  type RawCellValue,
} from './cell-parsers';

describe('cleanText', () => {
  it.each([
    ['  Self Cert  ', 'Self Cert'],
    ['IT   Sec', 'IT Sec'],
    ['IT Sec', 'IT Sec'], // non-breaking space
    ['', null],
    ['    ', null],
  ])('%j → %j', (input, expected) => {
    expect(cleanText(input)).toBe(expected);
  });

  it('รองรับ richText ที่ ExcelJS คืนเป็น object', () => {
    const value: RawCellValue = { richText: [{ text: 'sme-' }, { text: 'olvm.local' }] };
    expect(cleanText(value)).toBe('sme-olvm.local');
  });

  it('รองรับ hyperlink และ formula', () => {
    expect(cleanText({ text: 'egp.smebank.co.th' })).toBe('egp.smebank.co.th');
    expect(cleanText({ formula: 'A1', result: 'ผลลัพธ์' })).toBe('ผลลัพธ์');
  });

  it('เซลล์ error ของ Excel → null', () => {
    expect(cleanText({ error: '#REF!' })).toBeNull();
  });
});

describe('parseExcelDate', () => {
  it('รูปแบบจริงในไฟล์ "2026-09-18T12:25:54" (ไม่มี timezone) → ตีความเป็น UTC', () => {
    const result = parseExcelDate('2026-09-18T12:25:54');
    expect(result.error).toBeUndefined();
    expect(result.value?.toISOString()).toBe('2026-09-18T12:25:54.000Z');
  });

  it('วันที่ล้วน "2026-09-18" → เที่ยงคืน UTC', () => {
    expect(parseExcelDate('2026-09-18').value?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });

  it('มี Z หรือ offset → เคารพ offset นั้น', () => {
    expect(parseExcelDate('2026-09-18T12:25:54Z').value?.toISOString()).toBe(
      '2026-09-18T12:25:54.000Z',
    );
    expect(parseExcelDate('2026-09-18T12:25:54+07:00').value?.toISOString()).toBe(
      '2026-09-18T05:25:54.000Z',
    );
  });

  it('Date object จาก Excel date cell ใช้ได้ตรงๆ', () => {
    const date = new Date('2026-08-20T09:10:50.000Z');
    expect(parseExcelDate(date).value).toBe(date);
  });

  it('รูปแบบ 18-Sep-2026 และ 18 Sep 2026 (ไม่กำกวม) → ผ่าน', () => {
    expect(parseExcelDate('18-Sep-2026').value?.toISOString()).toBe('2026-09-18T00:00:00.000Z');
    expect(parseExcelDate('18 September 2026').value?.toISOString()).toBe(
      '2026-09-18T00:00:00.000Z',
    );
  });

  it('Excel serial number → วันที่ถูกต้อง (เทียบกับ anchor ที่รู้ค่าแน่นอน)', () => {
    // 44927 = 2023-01-01 เป็นค่าอ้างอิงที่ใช้ตรวจสอบสูตรแปลง serial ได้
    expect(parseExcelDate(44927).value?.toISOString().slice(0, 10)).toBe('2023-01-01');
    expect(parseExcelDate(46283).value?.toISOString().slice(0, 10)).toBe('2026-09-18');
  });

  it('รูปแบบ 18/09/2026 → ปฏิเสธ เพราะกำกวมกับ 09/18/2026', () => {
    const result = parseExcelDate('18/09/2026');
    expect(result.value).toBeNull();
    expect(result.error).toContain('กำกวม');
  });

  it('วันที่ไม่มีจริงในปฏิทิน (2026-02-31) → error ไม่เลื่อนเป็นเดือนถัดไปเงียบๆ', () => {
    const result = parseExcelDate('2026-02-31');
    expect(result.value).toBeNull();
    expect(result.error).toContain('ไม่มีวันที่');
  });

  it('เซลล์ว่าง → null แต่ไม่ใช่ error (ผู้เรียกจะไป fallback ที่ Days Until)', () => {
    expect(parseExcelDate(null)).toEqual({ value: null });
    expect(parseExcelDate('')).toEqual({ value: null });
  });

  it('ข้อความที่ไม่ใช่วันที่ → error พร้อมบอกรูปแบบที่รองรับ', () => {
    const result = parseExcelDate('ไม่ใช่วันที่');
    expect(result.value).toBeNull();
    expect(result.error).toContain('2026-09-18');
  });

  it('ตัวเลขที่เล็ก/ใหญ่เกินช่วง serial → error (กันเลขทั่วไปกลายเป็นวันที่)', () => {
    expect(parseExcelDate(50).error).toBeDefined();
    expect(parseExcelDate(999_999).error).toBeDefined();
  });
});

describe('parseInteger', () => {
  it.each([
    [50, 50],
    ['50', 50],
    ['2,048', 2048],
    [-3, -3],
    ['-3', -3],
    [50.6, 51],
  ])('%j → %j', (input, expected) => {
    expect(parseInteger(input).value).toBe(expected);
  });

  it('ว่าง → null ไม่ error', () => {
    expect(parseInteger(null)).toEqual({ value: null });
  });

  it('ไม่ใช่ตัวเลข → error', () => {
    expect(parseInteger('ห้าสิบ').error).toBeDefined();
  });
});

describe('splitEndpoints', () => {
  it('ค่าจริงจากไฟล์: newline ในเซลล์เดียว → แตกเป็น 2 รายการ', () => {
    expect(splitEndpoints('192.168.223.205:9696\n192.168.223.205:35357')).toEqual([
      '192.168.223.205:9696',
      '192.168.223.205:35357',
    ]);
  });

  it('รองรับ \\r\\n, comma, semicolon และช่องว่างหลายตัว', () => {
    expect(splitEndpoints('a:443\r\nb:443')).toEqual(['a:443', 'b:443']);
    expect(splitEndpoints('a:443, b:443')).toEqual(['a:443', 'b:443']);
    expect(splitEndpoints('a:443; b:443')).toEqual(['a:443', 'b:443']);
    expect(splitEndpoints('a:443   b:443')).toEqual(['a:443', 'b:443']);
  });

  it('ค่าเดียว → รายการเดียว', () => {
    expect(splitEndpoints('192.168.239.101:4443')).toEqual(['192.168.239.101:4443']);
  });

  it('ค่าซ้ำในเซลล์เดียวกัน → เหลือตัวเดียว คงลำดับเดิม', () => {
    expect(splitEndpoints('a:443\nb:443\na:443')).toEqual(['a:443', 'b:443']);
  });

  it('เซลล์ว่าง → array ว่าง (cert ยัง import ได้ด้วย endpoint = "")', () => {
    expect(splitEndpoints(null)).toEqual([]);
    expect(splitEndpoints('   ')).toEqual([]);
  });
});
