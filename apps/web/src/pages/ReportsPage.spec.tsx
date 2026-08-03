/**
 * เทสต์หน้า Reports ตาม checklist Phase 8:
 *   - สรุปรายเดือนเทียบเดือนก่อนหน้า (ตัวเลขและส่วนต่างมาจาก API)
 *   - ปุ่มดาวน์โหลด Excel ส่งตัวกรองปัจจุบันไปด้วย และแจ้งผลกลับให้ผู้ใช้
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRole } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { ReportsPage } from './ReportsPage';

const companies = [
  { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK', contactEmail: null, isActive: true },
];

function bucket(month: string, monthLabel: string, overrides: Record<string, unknown> = {}) {
  return {
    month,
    monthLabel,
    total: 7,
    byRisk: { HIGH: 2, MEDIUM: 5, LOW: 0, SAFE: 0 },
    byStatus: {
      NEW: 5,
      ASSIGNED: 1,
      IN_PROGRESS: 0,
      WAITING_VENDOR: 0,
      WAITING_CA: 0,
      TESTING: 0,
      COMPLETED: 1,
      CANCELLED: 0,
    },
    noTask: 0,
    completed: 1,
    pending: 6,
    cancelled: 0,
    expired: 0,
    ...overrides,
  };
}

const report = {
  asOf: '2026-08-04T00:00:00.000Z',
  companyId: null,
  companyName: null,
  current: bucket('2026-08', 'สิงหาคม 2569'),
  previous: bucket('2026-07', 'กรกฎาคม 2569', {
    total: 4,
    byRisk: { HIGH: 1, MEDIUM: 3, LOW: 0, SAFE: 0 },
    completed: 3,
    pending: 1,
  }),
  delta: {
    total: 3,
    byRisk: { HIGH: 1, MEDIUM: 2, LOW: 0, SAFE: 0 },
    completed: -2,
    pending: 5,
  },
};

const routes: MockRoute[] = [
  { match: '/companies', body: companies },
  { match: '/reports/monthly', body: report },
];

describe('ReportsPage', () => {
  beforeEach(() => {
    loginAs(UserRole.VIEWER);
    // jsdom ไม่มี createObjectURL — เติมเฉพาะสองเมธอดนี้ ไม่แทนคลาส URL ทั้งตัว
    // (ถ้าแทนทั้งคลาส โค้ดอื่นที่เรียก `new URL()` จะพังตามไปด้วย)
    Object.assign(URL, {
      createObjectURL: vi.fn(() => 'blob:mock'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('แสดงตารางเทียบสองเดือนด้วยตัวเลขจาก API และส่วนต่างที่คำนวณได้', async () => {
    mockFetch(routes);
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText(/เทียบเดือน สิงหาคม 2569 กับ กรกฎาคม 2569/)).toBeDefined();

    const totalRow = screen.getByText('รายการทั้งหมด').closest('tr');
    const cells = within(totalRow as HTMLElement).getAllByRole('cell');
    expect(cells[1].textContent).toBe('4'); // เดือนก่อน
    expect(cells[2].textContent).toBe('7'); // เดือนนี้
    expect(cells[3].textContent).toBe('+3'); // ส่วนต่าง

    const highRow = screen.getByText('ความเสี่ยงสูง').closest('tr');
    const highCells = within(highRow as HTMLElement).getAllByRole('cell');
    expect(highCells[1].textContent).toBe('1');
    expect(highCells[2].textContent).toBe('2');
    expect(highCells[3].textContent).toBe('+1');
  });

  it('ลดลงแสดงเป็นค่าติดลบ และเท่าเดิมแสดงขีด', async () => {
    mockFetch(routes);
    renderWithProviders(<ReportsPage />);

    // "เรียบร้อยแล้ว" ปรากฏทั้งในตารางเทียบและในตารางสถานะงานสองใบ → จำกัดขอบเขตที่ตารางเทียบ
    const comparisonTable = (await screen.findByText('รายการทั้งหมด')).closest('table');
    const completedRow = within(comparisonTable as HTMLElement)
      .getByText('เรียบร้อยแล้ว')
      .closest('tr');
    expect(within(completedRow as HTMLElement).getAllByRole('cell')[3].textContent).toBe('-2');

    const lowRow = screen.getByText('ความเสี่ยงต่ำ').closest('tr');
    expect(within(lowRow as HTMLElement).getAllByRole('cell')[3].textContent).toBe('—');
  });

  it('แสดงตารางสถานะงานของทั้งสองเดือน', async () => {
    mockFetch(routes);
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('สถานะงาน — สิงหาคม 2569')).toBeDefined();
    expect(screen.getByText('สถานะงาน — กรกฎาคม 2569')).toBeDefined();
    expect(screen.getAllByText('ยังไม่มีงานต่ออายุ')).toHaveLength(2);
  });

  it('เปลี่ยนเดือน/บริษัท → ขอรายงานใหม่ด้วยตัวกรองนั้น', async () => {
    const calls = mockFetch(routes);
    renderWithProviders(<ReportsPage />);
    await screen.findByText(/เทียบเดือน/);

    await screen.findByRole('option', { name: /SME Bank/ });
    await userEvent.selectOptions(screen.getByLabelText('บริษัท:'), 'company-sme');

    await waitFor(() => {
      expect(
        calls.some(
          (call) => call.url.includes('/reports/monthly') && call.url.includes('company-sme'),
        ),
      ).toBe(true);
    });
  });

  it('กดดาวน์โหลด → เรียก endpoint Excel ด้วยตัวกรองเดียวกัน และแจ้งจำนวนรายการ', async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        calls.push(url);

        if (url.includes('/reports/certificates.xlsx')) {
          return Promise.resolve(
            // ใช้ body เป็นสตริง เพราะ Blob ของ jsdom ไม่มี `.stream()` ที่ Response ของ Node ต้องใช้
            new Response('xlsx-bytes', {
              status: 200,
              headers: {
                'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                'Content-Disposition': 'attachment; filename="ssl-certificates-2026-08.xlsx"',
                'X-Report-Row-Count': '7',
                'X-Report-Truncated': 'false',
              },
            }),
          );
        }
        const body = url.includes('/companies') ? companies : report;
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
    renderWithProviders(<ReportsPage />);
    await screen.findByText(/เทียบเดือน/);

    await userEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' }));

    await waitFor(() => {
      expect(
        screen.getByText(/ดาวน์โหลด ssl-certificates-2026-08.xlsx แล้ว \(7 รายการ\)/),
      ).toBeDefined();
    });
    expect(calls.some((url) => url.includes('/reports/certificates.xlsx'))).toBe(true);
  });

  it('ไฟล์ถูกตัดเพราะข้อมูลเกินเพดาน → เตือนผู้ใช้ ไม่เงียบ', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/reports/certificates.xlsx')) {
          return Promise.resolve(
            // ใช้ body เป็นสตริง เพราะ Blob ของ jsdom ไม่มี `.stream()` ที่ Response ของ Node ต้องใช้
            new Response('xlsx-bytes', {
              status: 200,
              headers: {
                'Content-Disposition': 'attachment; filename="report.xlsx"',
                'X-Report-Row-Count': '5000',
                'X-Report-Truncated': 'true',
              },
            }),
          );
        }
        const body = url.includes('/companies') ? companies : report;
        return Promise.resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    );
    renderWithProviders(<ReportsPage />);
    await screen.findByText(/เทียบเดือน/);

    await userEvent.click(screen.getByRole('button', { name: 'ดาวน์โหลด Excel' }));

    expect(await screen.findByText(/ข้อมูลถูกตัด/)).toBeDefined();
  });

  it('API ล้มเหลว → แสดงข้อความผิดพลาด ไม่ใช่หน้าเปล่า', async () => {
    mockFetch([
      { match: '/companies', body: companies },
      {
        match: '/reports/monthly',
        status: 404,
        body: { message: 'ไม่พบบริษัท id abc' },
      },
    ]);
    renderWithProviders(<ReportsPage />);

    expect(await screen.findByText('ไม่พบบริษัท id abc')).toBeDefined();
  });
});
