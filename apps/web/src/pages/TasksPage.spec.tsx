/**
 * เทสต์หน้า Tasks ตาม checklist Phase 7:
 *   มุมมองตาม workflow status (board แบ่งคอลัมน์) + เปลี่ยนสถานะ/มอบหมายได้ตามสิทธิ์
 */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserRole, WorkStatus } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { TasksPage } from './TasksPage';

function task(id: string, status: WorkStatus, overrides: Record<string, unknown> = {}) {
  return {
    id,
    certificateId: `cert-${id}`,
    status,
    assigneeId: null,
    dueDate: null,
    note: null,
    completedAt: null,
    createdAt: '2026-08-03T00:00:00.000Z',
    updatedAt: '2026-08-03T00:00:00.000Z',
    assignee: null,
    certificate: {
      id: `cert-${id}`,
      commonName: `${id}.smebank.local`,
      endpoint: '10.0.0.1:443',
      expiresAt: '2026-08-20T00:00:00.000Z',
      owner: 'IT Sec',
      daysUntilExpiry: 17,
      riskLevel: 'HIGH',
      isExpired: false,
      company: { id: 'company-sme', name: 'SME Bank', code: 'SMEBANK' },
    },
    ...overrides,
  };
}

const tasksPage = {
  data: [
    task('a', WorkStatus.NEW),
    task('b', WorkStatus.IN_PROGRESS, {
      assigneeId: 'user-op',
      assignee: {
        id: 'user-op',
        name: 'สมชาย',
        email: 'somchai@example.com',
        role: UserRole.OPERATOR,
      },
    }),
    task('c', WorkStatus.TESTING),
  ],
  meta: {
    page: 1,
    pageSize: 200,
    total: 3,
    totalPages: 1,
    asOf: '2026-08-03T00:00:00.000Z',
  },
};

const routes: MockRoute[] = [
  { match: '/companies', body: [] },
  { match: '/users', body: [] },
  { match: '/tasks', body: tasksPage },
];

describe('TasksPage', () => {
  beforeEach(() => {
    loginAs(UserRole.OPERATOR);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('จัดการ์ดงานลงคอลัมน์ตามสถานะ workflow', async () => {
    mockFetch(routes);
    renderWithProviders(<TasksPage />);

    const newColumn = (await screen.findByText('รายการใหม่')).closest('section');
    expect(within(newColumn as HTMLElement).getByText('a.smebank.local')).toBeDefined();

    const inProgress = screen.getByText('อยู่ระหว่างดำเนินการ').closest('section');
    expect(within(inProgress as HTMLElement).getByText('b.smebank.local')).toBeDefined();
    expect(within(inProgress as HTMLElement).getByText(/สมชาย/)).toBeDefined();

    // ค่าเริ่มต้นดูเฉพาะงานที่ยังไม่ปิด → ไม่มีคอลัมน์ "เรียบร้อยแล้ว"
    expect(screen.queryByText('เรียบร้อยแล้ว')).toBeNull();
  });

  it('การ์ดแสดงวันคงเหลือและวันหมดอายุแบบ พ.ศ.', async () => {
    mockFetch(routes);
    renderWithProviders(<TasksPage />);

    const card = (await screen.findByText('a.smebank.local')).closest('article');
    expect(within(card as HTMLElement).getByText('17 วัน')).toBeDefined();
    expect(within(card as HTMLElement).getByText(/20 สิงหาคม 2569/)).toBeDefined();
  });

  it('กดจัดการงาน → เสนอเฉพาะสถานะถัดไปที่กฎอนุญาต และบันทึกได้', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/tasks/c/status', method: 'PATCH', body: task('c', WorkStatus.COMPLETED) },
    ]);
    renderWithProviders(<TasksPage />);

    const card = (await screen.findByText('c.smebank.local')).closest('article');
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'จัดการงาน' }));

    const select = within(card as HTMLElement).getByLabelText(
      'เปลี่ยนสถานะเป็น',
    ) as HTMLSelectElement;
    // จาก TESTING ไปได้: IN_PROGRESS, COMPLETED, CANCELLED
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      '',
      WorkStatus.IN_PROGRESS,
      WorkStatus.COMPLETED,
      WorkStatus.CANCELLED,
    ]);

    await userEvent.selectOptions(select, WorkStatus.COMPLETED);
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'บันทึกสถานะ' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/tasks/c/status'))).toBe(true);
    });
    expect(calls.find((call) => call.url.includes('/tasks/c/status'))?.body).toEqual({
      status: WorkStatus.COMPLETED,
    });
  });

  it('viewer เห็น board แต่จัดการงานไม่ได้', async () => {
    localStorage.clear();
    loginAs(UserRole.VIEWER);
    mockFetch(routes);
    renderWithProviders(<TasksPage />);

    const card = (await screen.findByText('a.smebank.local')).closest('article');
    await userEvent.click(within(card as HTMLElement).getByRole('button', { name: 'จัดการงาน' }));

    expect(within(card as HTMLElement).queryByLabelText('เปลี่ยนสถานะเป็น')).toBeNull();
    expect(within(card as HTMLElement).getByText(/มีสิทธิ์อ่านข้อมูลเท่านั้น/)).toBeDefined();
    // viewer ไม่ต้องเห็นตัวกรองผู้รับผิดชอบ (เรียก /users ไม่ได้)
    expect(screen.queryByLabelText('ผู้รับผิดชอบ:')).toBeNull();
  });

  it('เปลี่ยนขอบเขตเป็น "ทั้งหมด" → ส่งพารามิเตอร์ open ใหม่และมีคอลัมน์งานที่ปิดแล้ว', async () => {
    const calls = mockFetch(routes);
    renderWithProviders(<TasksPage />);
    await screen.findByText('a.smebank.local');

    await userEvent.selectOptions(screen.getByLabelText('ขอบเขต:'), '');

    await waitFor(() => {
      expect(screen.getByText('เรียบร้อยแล้ว')).toBeDefined();
    });
    expect(
      calls.some((call) => call.url.includes('/tasks') && !call.url.includes('open=true')),
    ).toBe(true);
  });
});
