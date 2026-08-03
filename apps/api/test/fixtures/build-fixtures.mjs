/**
 * สร้างไฟล์ fixture สำหรับเทสต์ import
 *   node test/fixtures/build-fixtures.mjs      (รันจาก apps/api)
 *
 * - 30-July-2026.xlsx        คัดลอกไฟล์จริงจาก docs/samples (ห้ามแก้เนื้อหา)
 * - columns-swapped.xlsx     ข้อมูลเดียวกันแต่สลับลำดับคอลัมน์ + ใช้ชื่อ alias/typo
 * - missing-expiry.xlsx      ตัดคอลัมน์ Expires และ Days Until Expiry ออก → ต้อง reject
 * - broken-rows.xlsx         มีแถวที่ Common Name ว่าง และแถวที่วันที่ parse ไม่ได้
 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ExcelJS from 'exceljs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..', '..', '..');
mkdirSync(here, { recursive: true });

// 1) ไฟล์จริง
copyFileSync(
  join(repoRoot, 'docs', 'samples', '30-July-2026.xlsx'),
  join(here, '30-July-2026.xlsx'),
);
console.log('copied 30-July-2026.xlsx');

/** เขียน sheet โดยวาง header ไว้แถวที่ 3 เหมือนไฟล์จริง */
function writeSheet(worksheet, title, headers, rows) {
  worksheet.getCell('B1').value = title;
  headers.forEach((name, index) => {
    worksheet.getRow(3).getCell(index + 1).value = name;
  });
  rows.forEach((row, rowIndex) => {
    row.forEach((value, colIndex) => {
      if (value !== null && value !== undefined) {
        worksheet.getRow(4 + rowIndex).getCell(colIndex + 1).value = value;
      }
    });
  });
}

// 2) สลับลำดับคอลัมน์ + ใช้ชื่อ alias และ typo `Onwer`
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Swapped');
  writeSheet(
    ws,
    'Report on 30-Jul-2026',
    ['Onwer', 'Status', 'CN', 'Signature Algorithm', 'Expiry Date', 'Endpoint', 'No.', 'Issuer'],
    [
      [
        'IT Sec',
        'อยู่ระหว่างดำเนินการ',
        'Self Cert',
        'SHA256withRSA',
        '2026-09-18T12:25:54',
        '192.168.239.101:4443',
        1,
        '<selfsigned>',
      ],
      [
        'IT Sec',
        'ดำเนินการแล้ว ',
        'k3s',
        'SHA256withECDSA',
        '2026-07-30T07:29:14',
        '192.168.110.21:6443',
        2,
        'CN=k3s-server-ca@1753860553',
      ],
      [
        null,
        'อยู่ระหว่างดำเนินการ',
        'sme-olvmcenter2.smebank.local',
        'SHA256withRSA',
        '2026-09-10T09:04:31',
        '192.168.223.205:9696\n192.168.223.205:35357',
        3,
        'CN=sme-olvmcenter2',
      ],
    ],
  );
  await wb.xlsx.writeFile(join(here, 'columns-swapped.xlsx'));
  console.log('wrote columns-swapped.xlsx');
}

// 3) ขาดคอลัมน์วันหมดอายุทั้งสองแบบ → ต้อง reject ทั้งไฟล์
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('NoExpiry');
  writeSheet(
    ws,
    'Report on 30-Jul-2026',
    ['No', 'Common Name', 'Endpoints', 'Issuer', 'Signing Algorithm', 'Owner', 'Status'],
    [
      [
        1,
        'Self Cert',
        '192.168.239.101:4443',
        '<selfsigned>',
        'SHA256withRSA',
        'IT Sec',
        'อยู่ระหว่างดำเนินการ',
      ],
      [
        2,
        'egp.smebank.co.th',
        '172.17.7.13:443',
        'CN=DigiCert',
        'SHA256withRSA',
        'IT Sec',
        'อยู่ระหว่างดำเนินการ',
      ],
    ],
  );
  await wb.xlsx.writeFile(join(here, 'missing-expiry.xlsx'));
  console.log('wrote missing-expiry.xlsx');
}

// 4) แถวข้อมูลพัง: Common Name ว่าง / วันที่กำกวม / วันที่ไม่มีจริง
{
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Broken');
  writeSheet(
    ws,
    'Report on 30-Jul-2026',
    ['No', 'Common Name', 'Endpoints', 'Expires', 'Days Until Expiry', 'Owner', 'Status'],
    [
      [
        1,
        'ok.example.com',
        '10.0.0.1:443',
        '2026-09-18T12:25:54',
        50,
        'IT Sec',
        'อยู่ระหว่างดำเนินการ',
      ],
      [2, null, '10.0.0.2:443', '2026-09-18T12:25:54', 50, 'IT Sec', 'อยู่ระหว่างดำเนินการ'],
      [
        3,
        'bad-date.example.com',
        '10.0.0.3:443',
        '18/09/2026',
        50,
        'IT Sec',
        'อยู่ระหว่างดำเนินการ',
      ],
      [
        4,
        'not-real-date.example.com',
        '10.0.0.4:443',
        '2026-02-31',
        50,
        'IT Sec',
        'สถานะแปลกที่ไม่รู้จัก',
      ],
    ],
  );
  await wb.xlsx.writeFile(join(here, 'broken-rows.xlsx'));
  console.log('wrote broken-rows.xlsx');
}

console.log('เสร็จแล้ว');
