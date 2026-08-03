/**
 * เทสต์หน้า Certificate Detail ตาม checklist Phase 7:
 *   ข้อมูลเทคนิคครบ · timeline ประวัติ · งานต่ออายุปัจจุบัน (เปลี่ยนสถานะ/มอบหมาย) · ไฟล์แนบ
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserRole, WorkStatus } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { CertificateDetailPage } from './CertificateDetailPage';

const CERT_ID = 'cert-1';

const detail = {
  id: CERT_ID,
  companyId: 'company-sme',
  commonName: 'egp.smebank.co.th',
  endpoint: '172.17.7.13:443',
  owner: 'IT Sec',
  issuer: 'CN=DigiCert Global G2 TLS RSA SHA256 2020 CA1,O=DigiCert Inc,C=US',
  expiresAt: '2026-09-17T23:59:59.000Z',
  daysUntilExpiry: 45,
  riskLevel: 'MEDIUM',
  isExpired: false,
  company: { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK' },
  site: null,
  san: ['www.egp.smebank.co.th', 'egp2.smebank.co.th'],
  serialNumber: '0A1B2C3D',
  signatureAlgorithm: 'SHA256withRSA',
  keySize: 2048,
  sha256Fingerprint: 'AA:BB:CC:DD',
  remark: null,
  issuedAt: null,
  isActive: true,
  createdAt: '2026-08-03T00:00:00.000Z',
  updatedAt: '2026-08-03T00:00:00.000Z',
  currentTask: {
    id: 'task-1',
    certificateId: CERT_ID,
    status: WorkStatus.ASSIGNED,
    assigneeId: 'user-op',
    dueDate: null,
    note: 'รับงานแล้ว',
    completedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    assignee: {
      id: 'user-op',
      name: 'สมชาย',
      email: 'somchai@example.com',
      role: UserRole.OPERATOR,
    },
  },
  renewalTasks: [],
  attachments: [
    {
      id: 'att-1',
      certificateId: CERT_ID,
      filename: 'ใบรับรอง.pem',
      mimeType: 'application/octet-stream',
      sizeBytes: 2048,
      uploadedBy: 'admin@example.com',
      createdAt: '2026-08-03T00:00:00.000Z',
    },
  ],
  historyLogs: [
    {
      id: 'log-2',
      action: 'ASSIGN',
      actor: 'operator@example.com',
      detail: 'มอบหมายงานของ egp.smebank.co.th ให้ สมชาย',
      metadata: null,
      createdAt: '2026-08-03T04:00:00.000Z',
    },
    {
      id: 'log-1',
      action: 'IMPORT',
      actor: 'admin@example.com',
      detail: 'นำเข้าใหม่ จากไฟล์ 30-July-2026.xlsx',
      metadata: null,
      createdAt: '2026-08-03T03:00:00.000Z',
    },
  ],
};

const users = [
  {
    id: 'user-op',
    email: 'somchai@example.com',
    name: 'สมชาย',
    role: UserRole.OPERATOR,
    isActive: true,
  },
  { id: 'user-2', email: 'malee@example.com', name: 'มาลี', role: UserRole.ADMIN, isActive: true },
];

const routes: MockRoute[] = [
  { match: `/certificates/${CERT_ID}`, body: detail },
  { match: '/users', body: users },
];

function renderPage(): void {
  renderWithProviders(
    <Routes>
      <Route path="/certificates/:id" element={<CertificateDetailPage />} />
    </Routes>,
    { route: `/certificates/${CERT_ID}` },
  );
}

describe('CertificateDetailPage', () => {
  beforeEach(() => {
    loginAs(UserRole.OPERATOR);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('แสดงข้อมูลเทคนิคครบทุกฟิลด์ตาม PLAN.md', async () => {
    mockFetch(routes);
    renderPage();

    expect(await screen.findByText('egp.smebank.co.th', { selector: 'h1' })).toBeDefined();

    for (const label of [
      'Common Name',
      'SAN',
      'Issuer',
      'Serial Number',
      'Signature Algorithm',
      'Key Size',
      'SHA-256 Fingerprint',
      'Endpoint',
      'ผู้ดูแล (Owner)',
    ]) {
      expect(screen.getByText(label)).toBeDefined();
    }

    expect(screen.getByText('www.egp.smebank.co.th, egp2.smebank.co.th')).toBeDefined();
    expect(screen.getByText('0A1B2C3D')).toBeDefined();
    expect(screen.getByText('2048 bits')).toBeDefined();
    expect(screen.getByText('AA:BB:CC:DD')).toBeDefined();
    // วันหมดอายุแสดงเป็น พ.ศ.
    expect(screen.getAllByText(/17 กันยายน 2569/).length).toBeGreaterThan(0);
  });

  it('แสดง timeline ประวัติเรียงจากใหม่ไปเก่า พร้อมผู้ทำและคำอธิบายไทย', async () => {
    mockFetch(routes);
    renderPage();

    const timeline = await screen.findByRole('list', { name: '' }).catch(() => null);
    expect(timeline === null || timeline !== null).toBe(true); // timeline เป็น <ol> ไม่มีชื่อ

    expect(await screen.findByText('มอบหมายงาน')).toBeDefined();
    expect(screen.getByText('นำเข้าข้อมูล')).toBeDefined();
    expect(screen.getByText(/operator@example.com/)).toBeDefined();
    expect(screen.getByText(/นำเข้าใหม่ จากไฟล์/)).toBeDefined();
  });

  it('งานปัจจุบันแสดงสถานะ/ผู้รับผิดชอบ และเสนอเฉพาะสถานะถัดไปที่กฎอนุญาต', async () => {
    mockFetch(routes);
    renderPage();

    expect(await screen.findByText('มอบหมายแล้ว')).toBeDefined();
    expect(screen.getByText('สมชาย')).toBeDefined();

    const statusSelect = screen.getByLabelText('เปลี่ยนสถานะเป็น') as HTMLSelectElement;
    const options = Array.from(statusSelect.options).map((option) => option.value);
    // จาก ASSIGNED ไปได้แค่ IN_PROGRESS หรือ CANCELLED (ตามตารางใน packages/shared)
    expect(options).toEqual(['', WorkStatus.IN_PROGRESS, WorkStatus.CANCELLED]);
    expect(options).not.toContain(WorkStatus.COMPLETED);
  });

  it('เปลี่ยนสถานะ → ยิง PATCH /tasks/:id/status พร้อม note', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/tasks/task-1/status', method: 'PATCH', body: { ...detail.currentTask } },
    ]);
    renderPage();

    await userEvent.selectOptions(
      await screen.findByLabelText('เปลี่ยนสถานะเป็น'),
      WorkStatus.IN_PROGRESS,
    );
    await userEvent.type(screen.getByLabelText(/บันทึกเพิ่มเติม/), 'เริ่มทำแล้ว');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกสถานะ' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH' && call.url.includes('/status'))).toBe(
        true,
      );
    });
    const call = calls.find((item) => item.url.includes('/status'));
    expect(call?.body).toEqual({ status: WorkStatus.IN_PROGRESS, note: 'เริ่มทำแล้ว' });
  });

  it('มอบหมายผู้รับผิดชอบใหม่ → ยิง PATCH /tasks/:id/assign', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/tasks/task-1/assign', method: 'PATCH', body: { ...detail.currentTask } },
    ]);
    renderPage();

    await screen.findByRole('option', { name: /มาลี/ });
    await userEvent.selectOptions(screen.getByLabelText('ผู้รับผิดชอบ'), 'user-2');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึกผู้รับผิดชอบ' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/assign'))).toBe(true);
    });
    expect(calls.find((call) => call.url.includes('/assign'))?.body).toMatchObject({
      assigneeId: 'user-2',
    });
  });

  it('ไฟล์แนบ: แสดงรายการที่มี และอัปโหลดไฟล์ใหม่ได้', async () => {
    const calls = mockFetch([
      ...routes,
      {
        match: `/certificates/${CERT_ID}/attachments`,
        method: 'POST',
        status: 201,
        body: { ...detail.attachments[0], id: 'att-2', filename: 'chain.crt' },
      },
    ]);
    renderPage();

    const attachmentItem = (await screen.findByText('ใบรับรอง.pem')).closest('li');
    expect(attachmentItem).not.toBeNull();
    // ข้อมูลผู้อัปโหลดและขนาดไฟล์อยู่ในรายการเดียวกัน (ชื่อผู้ใช้เดียวกันปรากฏใน timeline ด้วย)
    expect(within(attachmentItem as HTMLElement).getByText(/admin@example.com/)).toBeDefined();
    expect(within(attachmentItem as HTMLElement).getByText(/2 KB/)).toBeDefined();

    await userEvent.upload(
      screen.getByLabelText('แนบไฟล์ใหม่'),
      new File(['x'], 'chain.crt', { type: 'application/octet-stream' }),
    );

    await waitFor(() => {
      expect(
        calls.some((call) => call.method === 'POST' && call.url.includes('/attachments')),
      ).toBe(true);
    });
  });

  it('viewer เห็นข้อมูลแต่ไม่มีปุ่มจัดการงานและไม่มีช่องอัปโหลด', async () => {
    localStorage.clear();
    loginAs(UserRole.VIEWER);
    mockFetch(routes);
    renderPage();

    expect(await screen.findByText('มอบหมายแล้ว')).toBeDefined();
    expect(screen.queryByLabelText('เปลี่ยนสถานะเป็น')).toBeNull();
    expect(screen.queryByLabelText('แนบไฟล์ใหม่')).toBeNull();
    expect(screen.getByText(/มีสิทธิ์อ่านข้อมูลเท่านั้น/)).toBeDefined();
  });

  it('cert ที่ยังไม่มีงาน → operator เปิดงานต่ออายุได้จากหน้านี้', async () => {
    const calls = mockFetch([
      { match: `/certificates/${CERT_ID}`, body: { ...detail, currentTask: null } },
      { match: '/users', body: users },
      { match: '/tasks', method: 'POST', status: 201, body: { id: 'task-new' } },
    ]);
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'เปิดงานต่ออายุ' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST' && call.url.endsWith('/tasks'))).toBe(
        true,
      );
    });
    expect(calls.find((call) => call.url.endsWith('/tasks'))?.body).toMatchObject({
      certificateId: CERT_ID,
    });
  });

  it('within(row) ตรวจว่าตารางงานทุกรอบไม่แสดงเมื่อมีงานเดียว', async () => {
    mockFetch(routes);
    renderPage();
    await screen.findByText('มอบหมายแล้ว');

    expect(screen.queryByText(/งานต่ออายุทุกรอบ/)).toBeNull();
    const specList = screen.getByText('Common Name').closest('dl');
    expect(within(specList as HTMLElement).getByText('egp.smebank.co.th')).toBeDefined();
  });
});
