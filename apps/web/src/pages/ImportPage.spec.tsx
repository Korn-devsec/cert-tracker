/**
 * เทสต์หน้า Import ตาม checklist Phase 7:
 *   เลือกบริษัท (บังคับ) → upload → preview ผล mapping → confirm → สรุปผล
 *   และถ้า validate ไม่ผ่านต้องบอกชัดว่าคอลัมน์ไหนหาย/แถวไหนพัง
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserRole } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { ImportPage } from './ImportPage';

const companies = [
  { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK', contactEmail: null, isActive: true },
];

const inspectResult = {
  filename: '30-July-2026.xlsx',
  suggestedSheet: 'Report-SSL-Jul-2026',
  sheets: [
    {
      name: 'Report',
      headerRow: 7,
      dataRowCount: 4,
      mappedFieldCount: 3,
      importable: false,
      missingRequired: ['owner'],
    },
    {
      name: 'Report-SSL-Jul-2026',
      headerRow: 3,
      dataRowCount: 6,
      mappedFieldCount: 7,
      importable: true,
      missingRequired: [],
    },
  ],
};

const previewResult = {
  batchId: null,
  dryRun: true,
  status: 'SUCCESS',
  companyId: 'company-sme',
  filename: '30-July-2026.xlsx',
  sheetName: 'Report-SSL-Jul-2026',
  headerRow: 3,
  scannedRows: 6,
  rowCount: 7,
  createdCount: 7,
  updatedCount: 0,
  skippedCount: 0,
  tasksCreated: 0,
  errors: [],
  warnings: [{ excelRow: 0, message: 'ไม่รู้จักคอลัมน์ "No" — ข้ามคอลัมน์นี้' }],
  preview: [
    {
      excelRow: 4,
      commonName: 'Self Cert',
      endpoint: '192.168.239.101:4443',
      expiresAt: '2026-09-18T12:25:54.000Z',
      daysUntilExpiry: 46,
      riskLevel: 'MEDIUM',
      owner: 'IT Sec',
      issuer: '<selfsigned>',
      workStatus: 'NEW',
      action: 'create' as const,
    },
  ],
};

const finalResult = { ...previewResult, dryRun: false, batchId: 'batch-1', tasksCreated: 7 };

const baseRoutes: MockRoute[] = [
  { match: '/companies', body: companies },
  { match: '/imports', body: [] }, // ประวัติการนำเข้า (GET)
];

function xlsxFile(): File {
  return new File(['dummy'], '30-July-2026.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

/** รอให้รายชื่อบริษัทจาก API มาถึงก่อนเลือก (dropdown เริ่มต้นมีแต่ตัวเลือกว่าง) */
async function selectCompany(): Promise<void> {
  await screen.findByRole('option', { name: /SME Bank/ });
  await userEvent.selectOptions(screen.getByLabelText('บริษัท (จำเป็น)'), 'company-sme');
}

describe('ImportPage', () => {
  beforeEach(() => {
    loginAs(UserRole.OPERATOR);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('viewer เข้าหน้านี้ → บอกว่าไม่มีสิทธิ์ ไม่แสดงฟอร์มนำเข้า', async () => {
    localStorage.clear();
    loginAs(UserRole.VIEWER);
    mockFetch(baseRoutes);
    renderWithProviders(<ImportPage />);

    expect(await screen.findByText('ไม่มีสิทธิ์ใช้งาน')).toBeDefined();
    expect(screen.queryByLabelText('ไฟล์ .xlsx')).toBeNull();
  });

  it('ยังไม่เลือกบริษัทหรือไฟล์ → ปุ่มสำรวจไฟล์ยังกดไม่ได้ (บังคับเลือกบริษัทก่อน)', async () => {
    mockFetch(baseRoutes);
    renderWithProviders(<ImportPage />);

    const inspectButton = await screen.findByRole('button', { name: 'สำรวจไฟล์' });
    expect(inspectButton).toHaveProperty('disabled', true);

    await userEvent.upload(screen.getByLabelText('ไฟล์ .xlsx'), xlsxFile());
    // มีไฟล์แล้วแต่ยังไม่เลือกบริษัท → ยังกดไม่ได้
    expect(screen.getByRole('button', { name: 'สำรวจไฟล์' })).toHaveProperty('disabled', true);

    await userEvent.selectOptions(screen.getByLabelText('บริษัท (จำเป็น)'), 'company-sme');
    expect(screen.getByRole('button', { name: 'สำรวจไฟล์' })).toHaveProperty('disabled', false);
  });

  it('flow ครบ: สำรวจ → เลือก sheet → preview → ยืนยัน → สรุปผล', async () => {
    const calls = mockFetch([
      ...baseRoutes,
      { match: '/imports/inspect', method: 'POST', status: 201, body: inspectResult },
      { match: '/imports', method: 'POST', status: 201, body: previewResult },
    ]);
    renderWithProviders(<ImportPage />);

    await selectCompany();
    await userEvent.upload(screen.getByLabelText('ไฟล์ .xlsx'), xlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'สำรวจไฟล์' }));

    // ขั้นที่ 2: เห็นทุก sheet พร้อมแถว header และ sheet ที่ระบบแนะนำถูกเลือกไว้
    expect(await screen.findByText('Report-SSL-Jul-2026')).toBeDefined();
    expect(screen.getByText('ระบบแนะนำ')).toBeDefined();
    expect(screen.getByLabelText('เลือก sheet Report-SSL-Jul-2026')).toHaveProperty(
      'checked',
      true,
    );
    // sheet ที่คอลัมน์ไม่ครบต้องเลือกไม่ได้ และบอกว่าขาดอะไร
    expect(screen.getByLabelText('เลือก sheet Report')).toHaveProperty('disabled', true);
    expect(screen.getByText(/ขาดคอลัมน์: owner/)).toBeDefined();

    // ขั้นที่ 3: preview (dryRun) — ยังไม่บันทึก
    await userEvent.click(screen.getByRole('button', { name: 'ตรวจข้อมูล (ยังไม่บันทึก)' }));
    expect(await screen.findByText('ขั้นที่ 3 — ตรวจผลก่อนบันทึก')).toBeDefined();
    const previewRow = screen.getByText('Self Cert').closest('tr');
    expect(previewRow).not.toBeNull();
    // ป้ายในแถวบอกว่าจะ "สร้างใหม่" (ต่างจากป้ายเดียวกันในการ์ดสรุปด้านบน)
    expect(within(previewRow as HTMLElement).getByText('สร้างใหม่')).toBeDefined();
    expect(within(previewRow as HTMLElement).getByText('46 วัน')).toBeDefined();
    expect(screen.getByText(/ไม่รู้จักคอลัมน์/)).toBeDefined();

    const dryRunCall = calls.find(
      (call) => call.method === 'POST' && call.url.endsWith('/imports'),
    );
    expect(dryRunCall?.body).toMatchObject({
      companyId: 'company-sme',
      sheetName: 'Report-SSL-Jul-2026',
      dryRun: 'true',
      strict: 'true',
    });

    // ยืนยันบันทึกจริง
    mockFetch([
      ...baseRoutes,
      { match: '/imports', method: 'POST', status: 201, body: finalResult },
    ]);
    await userEvent.click(screen.getByRole('button', { name: /ยืนยันนำเข้า 7 รายการ/ }));

    expect(await screen.findByText('ผลการนำเข้า')).toBeDefined();
    expect(screen.getByText(/สำเร็จ/)).toBeDefined();
    expect(screen.getByText('สร้างงานต่ออายุ')).toBeDefined();
  });

  it('ไฟล์ขาดคอลัมน์ที่จำเป็น → แสดงคอลัมน์ที่หายและชื่อ header ที่ยอมรับ', async () => {
    mockFetch([
      ...baseRoutes,
      {
        match: '/imports/inspect',
        method: 'POST',
        status: 400,
        body: {
          message: 'ไฟล์ขาดคอลัมน์ที่จำเป็น จึง import ไม่ได้ทั้งไฟล์',
          sheetName: 'NoExpiry',
          headerRow: 1,
          missingColumns: ['expiresAt หรือ daysUntilExpiry'],
          acceptedHeaders: { expiresAt: ['expires', 'expiry date'] },
          headersFound: ['Common Name', 'Owner'],
        },
      },
    ]);
    renderWithProviders(<ImportPage />);

    await selectCompany();
    await userEvent.upload(screen.getByLabelText('ไฟล์ .xlsx'), xlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'สำรวจไฟล์' }));

    await waitFor(() => {
      expect(screen.getByText('ไฟล์นี้นำเข้าไม่ได้')).toBeDefined();
    });
    expect(screen.getByText('expiresAt หรือ daysUntilExpiry')).toBeDefined();
    expect(screen.getByText(/expires, expiry date/)).toBeDefined();
    expect(screen.getByText(/Common Name · Owner/)).toBeDefined();
  });

  it('โหมด strict มีแถวพัง → แสดงเลขแถวและเหตุผลรายแถว', async () => {
    mockFetch([
      ...baseRoutes,
      { match: '/imports/inspect', method: 'POST', status: 201, body: inspectResult },
      {
        match: '/imports',
        method: 'POST',
        status: 400,
        body: {
          message: 'พบข้อมูลผิดพลาด 2 แถว — โหมด strict จึงไม่บันทึกทั้งไฟล์',
          errors: [
            { excelRow: 5, message: 'commonName ว่าง' },
            { excelRow: 6, column: 'Expires', message: 'รูปแบบวันที่ 18/09/2026 กำกวม' },
          ],
        },
      },
    ]);
    renderWithProviders(<ImportPage />);

    await selectCompany();
    await userEvent.upload(screen.getByLabelText('ไฟล์ .xlsx'), xlsxFile());
    await userEvent.click(screen.getByRole('button', { name: 'สำรวจไฟล์' }));
    await userEvent.click(await screen.findByRole('button', { name: 'ตรวจข้อมูล (ยังไม่บันทึก)' }));

    expect(await screen.findByText(/แถวที่ข้อมูลไม่ถูกต้อง/)).toBeDefined();
    expect(screen.getByText(/แถว 5: commonName ว่าง/)).toBeDefined();
    expect(screen.getByText(/แถว 6 คอลัมน์ Expires/)).toBeDefined();
  });
});
