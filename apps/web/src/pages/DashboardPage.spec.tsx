/**
 * เทสต์ระดับหน้าจอตามเกณฑ์ตรวจรับ Phase 6
 *   - ตัวเลขบนการ์ด/ตารางมาจาก API เท่านั้น (กฎเหล็กข้อ 1 — ไม่มีข้อมูลฝังในโค้ด)
 *   - เปลี่ยน dropdown บริษัท → ยิง API ใหม่ด้วย companyId นั้น แล้วทั้งหน้าเปลี่ยนตาม
 *
 * กราฟถูกแทนด้วย stub เพราะ jsdom ไม่มี canvas 2d context ให้ Chart.js วาด
 * (ตัวข้อมูลที่ป้อนเข้ากราฟมีเทสต์แยกใน charts/chart-data.spec.ts แล้ว)
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CertificateListItem, Company, DashboardSummary, Paginated } from '../lib/types';

vi.mock('../charts/ChartCanvas', () => ({
  ChartCanvas: ({ ariaLabel }: { ariaLabel: string }) => <div role="img" aria-label={ariaLabel} />,
}));

const companies: Company[] = [
  { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK', contactEmail: null, isActive: true },
  { id: 'company-ptt', name: 'PTT', code: 'PTT', contactEmail: null, isActive: true },
];

function summaryFor(companyId: string | null): DashboardSummary {
  const isSme = companyId === 'company-sme' || companyId === null;
  return {
    asOf: '2026-08-03T00:00:00.000Z',
    companyId,
    month: null,
    status: null,
    total: isSme ? 7 : 2,
    byRisk: isSme
      ? { HIGH: 1, MEDIUM: 6, LOW: 0, SAFE: 0 }
      : { HIGH: 0, MEDIUM: 0, LOW: 1, SAFE: 1 },
    byStatus: {
      NEW: isSme ? 7 : 0,
      ASSIGNED: 0,
      IN_PROGRESS: 0,
      WAITING_VENDOR: 0,
      WAITING_CA: 0,
      TESTING: 0,
      COMPLETED: isSme ? 0 : 2,
      CANCELLED: 0,
    },
    byRiskStatus: {
      HIGH: { done: 0, pending: isSme ? 1 : 0, cancelled: 0 },
      MEDIUM: { done: 0, pending: isSme ? 6 : 0, cancelled: 0 },
      LOW: { done: isSme ? 0 : 1, pending: 0, cancelled: 0 },
      SAFE: { done: isSme ? 0 : 1, pending: 0, cancelled: 0 },
    },
    noTask: 0,
    expiringSoon: isSme ? 1 : 0,
    expired: 0,
    completed: isSme ? 0 : 2,
    pending: isSme ? 7 : 0,
    cancelled: 0,
  };
}

function certificate(overrides: Partial<CertificateListItem>): CertificateListItem {
  return {
    id: 'cert-1',
    companyId: 'company-sme',
    commonName: 'smewormdc02.smebank.local',
    endpoint: '192.168.254.67:443',
    owner: 'IT Sec',
    issuer: 'Veritas MSDP',
    expiresAt: '2026-08-20T09:10:50.000Z',
    daysUntilExpiry: 17,
    riskLevel: 'HIGH' as CertificateListItem['riskLevel'],
    isExpired: false,
    company: { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK' },
    site: null,
    currentTask: { id: 'task-1', status: 'NEW' as never, assigneeId: null, dueDate: null },
    ...overrides,
  };
}

function certificatesFor(companyId: string | null): Paginated<CertificateListItem> {
  const data =
    companyId === 'company-ptt'
      ? [
          certificate({
            id: 'cert-ptt',
            commonName: 'portal.ptt.example.co.th',
            companyId: 'company-ptt',
            company: { id: 'company-ptt', name: 'PTT', code: 'PTT' },
            daysUntilExpiry: 120,
            riskLevel: 'SAFE' as CertificateListItem['riskLevel'],
            currentTask: {
              id: 'task-ptt',
              status: 'COMPLETED' as never,
              assigneeId: null,
              dueDate: null,
            },
          }),
        ]
      : [certificate({})];

  return {
    data,
    meta: {
      page: 1,
      pageSize: 25,
      total: data.length,
      totalPages: 1,
      asOf: '2026-08-03T00:00:00.000Z',
    },
  };
}

/** จำลอง API ทั้งหมดผ่าน fetch — ถ้าหน้าจอมีข้อมูล hard-code เทสต์นี้จะจับได้ */
function mockApi(): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      calls.push(url);

      const companyId = new URL(url).searchParams.get('companyId');
      let body: unknown;
      if (url.includes('/companies')) {
        body = companies;
      } else if (url.includes('/dashboard/summary')) {
        body = summaryFor(companyId);
      } else if (url.includes('/certificates')) {
        body = certificatesFor(companyId);
      } else {
        throw new Error(`เทสต์ยังไม่ได้จำลอง endpoint นี้: ${url}`);
      }

      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );
  return { calls };
}

function renderDashboard(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

// import หลัง vi.mock เพื่อให้ stub ของกราฟถูกใช้
const { DashboardPage } = await import('./DashboardPage');

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.setItem('cert-tracker.token', 'test-token');
  });

  // ไม่ได้เปิด globals ของ vitest ไว้ RTL จึงลงทะเบียน cleanup อัตโนมัติไม่ได้ ต้องเรียกเอง
  // (ไม่เรียก = DOM ของเทสต์ก่อนหน้าค้างอยู่ แล้ว query เจอ element ซ้ำ)
  afterEach(() => {
    cleanup();
  });

  it('แสดงการ์ดความเสี่ยง 4 ใบด้วยตัวเลขจาก API', async () => {
    mockApi();
    renderDashboard();

    const high = await screen.findByText('ความเสี่ยงสูง (High)');
    // ตัวเลขอยู่ในการ์ดเดียวกับหัวข้อ
    expect(high.closest('.policy-card')?.textContent).toContain('1');

    const medium = screen.getByText('ความเสี่ยงกลาง (Medium)');
    expect(medium.closest('.policy-card')?.textContent).toContain('6');

    // ข้อความบนการ์ดตรงกับไฟล์ต้นแบบ (ขึ้นบรรทัดใหม่ด้วย <br> จึงใช้ regex จับข้อความบางส่วน)
    expect(screen.getByText(/เหลืออายุน้อยกว่า 30 วัน/)).toBeDefined();
    expect(screen.getByText(/ต้องดำเนินการทันที/)).toBeDefined();
    expect(screen.getByText('ปกติ (Safe)')).toBeDefined();
  });

  it('แสดงการ์ดตัวเลขรองและกราฟทั้งสองตัว', async () => {
    mockApi();
    renderDashboard();

    expect(await screen.findByText('รายการทั้งหมด')).toBeDefined();
    expect(screen.getByText('ใกล้หมดอายุ')).toBeDefined();
    expect(screen.getByText('หมดอายุแล้ว')).toBeDefined();
    expect(screen.getByLabelText('สัดส่วนใบรับรองแยกตามระดับความเสี่ยง')).toBeDefined();
    expect(
      screen.getByLabelText(
        'จำนวนงานที่เรียบร้อยแล้วและอยู่ระหว่างดำเนินการ แยกตามระดับความเสี่ยง',
      ),
    ).toBeDefined();
  });

  it('ตารางแสดงข้อมูลจาก API: ลำดับ, CN, วันคงเหลือ, badge, สถานะไทย', async () => {
    mockApi();
    renderDashboard();

    const row = (await screen.findByText('smewormdc02.smebank.local')).closest('tr');
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText('17 วัน')).toBeDefined();
    expect(cells.getByText('สูง')).toBeDefined(); // badge ความเสี่ยง
    expect(cells.getByText('รายการใหม่')).toBeDefined(); // สถานะงานภาษาไทย
    expect(row?.textContent).toContain('192.168.254.67:443');
    // วันหมดอายุแสดงเป็น พ.ศ.
    expect(row?.textContent).toContain('2569');
  });

  it('เปลี่ยน dropdown บริษัท → เรียก API ใหม่ด้วย companyId และตัวเลข/ตารางเปลี่ยนตาม', async () => {
    const { calls } = mockApi();
    renderDashboard();
    await screen.findByText('smewormdc02.smebank.local');

    await userEvent.selectOptions(screen.getByLabelText('บริษัท:'), 'company-ptt');

    await waitFor(() => {
      expect(screen.getByText('portal.ptt.example.co.th')).toBeDefined();
    });

    // การ์ดเปลี่ยนเป็นตัวเลขของ PTT (Low 1, Safe 1, High 0)
    const safeCard = screen.getByText('ปกติ (Safe)').closest('.policy-card');
    expect(safeCard?.textContent).toContain('1');
    const highCard = screen.getByText('ความเสี่ยงสูง (High)').closest('.policy-card');
    expect(highCard?.querySelector('.policy-count')?.textContent).toBe('0');
    // แถวของบริษัทเดิมต้องหายไปแล้ว
    expect(screen.queryByText('smewormdc02.smebank.local')).toBeNull();

    // ทั้ง summary และ certificates ต้องถูกเรียกด้วย companyId ใหม่
    expect(
      calls.some((url) => url.includes('/dashboard/summary') && url.includes('company-ptt')),
    ).toBe(true);
    expect(calls.some((url) => url.includes('/certificates') && url.includes('company-ptt'))).toBe(
      true,
    );
  });

  it('ตัวกรองสถานะงานถูกส่งไปทั้ง summary และ certificates (การ์ดกับตารางใช้ชุดข้อมูลเดียวกัน)', async () => {
    const { calls } = mockApi();
    renderDashboard();
    await screen.findByText('smewormdc02.smebank.local');

    await userEvent.selectOptions(screen.getByLabelText('สถานะงาน:'), 'COMPLETED');

    await waitFor(() => {
      expect(
        calls.some((url) => url.includes('/dashboard/summary') && url.includes('status=COMPLETED')),
      ).toBe(true);
    });
    expect(
      calls.some((url) => url.includes('/certificates') && url.includes('status=COMPLETED')),
    ).toBe(true);
  });

  it('ตัวเลือกเดือนเป็น พ.ศ. และมีตัวเลือก "ทุกเดือน"', async () => {
    mockApi();
    renderDashboard();

    const monthSelect = (await screen.findByLabelText('เลือกเดือน:')) as HTMLSelectElement;
    const labels = Array.from(monthSelect.options).map((option) => option.textContent);

    expect(labels[0]).toBe('ทุกเดือน');
    expect(labels.slice(1).every((label) => /25\d{2}$/.test(label ?? ''))).toBe(true);
  });

  it('API ล้มเหลว → แสดงข้อความผิดพลาดของ api ให้ผู้ใช้เห็น ไม่ใช่หน้าเปล่า', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          new Response(JSON.stringify({ message: 'ไม่พบบริษัท id abc' }), { status: 404 }),
        ),
      ),
    );
    renderDashboard();

    expect((await screen.findAllByText('ไม่พบบริษัท id abc')).length).toBeGreaterThan(0);
  });
});
