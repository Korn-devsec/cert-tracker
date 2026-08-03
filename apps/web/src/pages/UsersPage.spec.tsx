/** เทสต์หน้า Settings/Users ตาม checklist Phase 7: จัดการผู้ใช้และ role (admin เท่านั้น) */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserRole } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { UsersPage } from './UsersPage';

const users = [
  { id: 'user-me', email: 'me@example.com', name: 'ฉันเอง', role: UserRole.ADMIN, isActive: true },
  {
    id: 'user-op',
    email: 'somchai@example.com',
    name: 'สมชาย',
    role: UserRole.OPERATOR,
    isActive: true,
  },
  {
    id: 'user-off',
    email: 'off@example.com',
    name: 'ปิดแล้ว',
    role: UserRole.VIEWER,
    isActive: false,
  },
];

const routes: MockRoute[] = [{ match: '/users', body: users }];

describe('UsersPage', () => {
  beforeEach(() => {
    loginAs(UserRole.ADMIN, 'user-me');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('แสดงบัญชีทั้งหมดพร้อมสิทธิ์ภาษาไทยและทำเครื่องหมายบัญชีของตัวเอง', async () => {
    mockFetch(routes);
    renderWithProviders(<UsersPage />);

    const myRow = (await screen.findByText('ฉันเอง')).closest('tr');
    expect(within(myRow as HTMLElement).getByText('ผู้ดูแลระบบ')).toBeDefined();
    expect(within(myRow as HTMLElement).getByText('คุณ')).toBeDefined();
    // ปิดบัญชีตัวเองไม่ได้ → ปุ่มถูกปิดไว้
    expect(within(myRow as HTMLElement).getByRole('button', { name: 'ปิดใช้งาน' })).toHaveProperty(
      'disabled',
      true,
    );

    const operatorRow = screen.getByText('สมชาย').closest('tr');
    expect(within(operatorRow as HTMLElement).getByText('ผู้ปฏิบัติงาน')).toBeDefined();
    expect(screen.getByText('ปิดแล้ว')).toBeDefined();
  });

  it('สร้างผู้ใช้ใหม่ → ยิง POST /auth/register พร้อม role ที่เลือก', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/auth/register', method: 'POST', status: 201, body: users[1] },
    ]);
    renderWithProviders(<UsersPage />);

    await userEvent.click(await screen.findByRole('button', { name: '+ เพิ่มผู้ใช้' }));
    await userEvent.type(screen.getByLabelText('อีเมล'), 'new@example.com');
    await userEvent.type(screen.getByLabelText('ชื่อ'), 'คนใหม่');
    await userEvent.type(screen.getByLabelText('รหัสผ่าน'), 'Passw0rd!12345');
    await userEvent.selectOptions(screen.getByLabelText('สิทธิ์'), UserRole.OPERATOR);
    await userEvent.click(screen.getByRole('button', { name: 'สร้างบัญชี' }));

    await waitFor(() => {
      expect(calls.some((call) => call.url.includes('/auth/register'))).toBe(true);
    });
    expect(calls.find((call) => call.url.includes('/auth/register'))?.body).toEqual({
      email: 'new@example.com',
      name: 'คนใหม่',
      password: 'Passw0rd!12345',
      role: UserRole.OPERATOR,
    });
  });

  it('แก้ไขผู้ใช้คนอื่น → เปลี่ยน role ได้ และรีเซ็ตรหัสผ่านได้', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/users/user-op', method: 'PATCH', body: users[1] },
    ]);
    renderWithProviders(<UsersPage />);

    const row = (await screen.findByText('สมชาย')).closest('tr');
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'แก้ไข' }));

    await userEvent.selectOptions(screen.getByLabelText('สิทธิ์'), UserRole.ADMIN);
    await userEvent.type(screen.getByLabelText(/ตั้งรหัสผ่านใหม่/), 'Reset-Passw0rd!');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      name: 'สมชาย',
      role: UserRole.ADMIN,
      password: 'Reset-Passw0rd!',
    });
  });

  it('แก้ไขบัญชีตัวเอง → ช่องสิทธิ์ถูกล็อกพร้อมคำอธิบาย', async () => {
    mockFetch(routes);
    renderWithProviders(<UsersPage />);

    const myRow = (await screen.findByText('ฉันเอง')).closest('tr');
    await userEvent.click(within(myRow as HTMLElement).getByRole('button', { name: 'แก้ไข' }));

    expect(screen.getByLabelText('สิทธิ์')).toHaveProperty('disabled', true);
    expect(screen.getByText(/เปลี่ยนสิทธิ์ของตัวเองไม่ได้/)).toBeDefined();
  });

  it('api ปฏิเสธ (เช่น ต้องเหลือ admin หนึ่งคน) → แสดงข้อความบนฟอร์ม', async () => {
    mockFetch([
      ...routes,
      {
        match: '/users/user-op',
        method: 'PATCH',
        status: 400,
        body: { message: 'ระบบต้องมีผู้ดูแล (ADMIN) ที่ใช้งานได้อย่างน้อยหนึ่งบัญชี' },
      },
    ]);
    renderWithProviders(<UsersPage />);

    const row = (await screen.findByText('สมชาย')).closest('tr');
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'แก้ไข' }));
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByText(/ต้องมีผู้ดูแล \(ADMIN\)/)).toBeDefined();
  });

  it('operator เปิดหน้านี้ → บอกว่าเป็นหน้าของ admin เท่านั้น และไม่เรียก /users', async () => {
    localStorage.clear();
    loginAs(UserRole.OPERATOR);
    const calls = mockFetch(routes);
    renderWithProviders(<UsersPage />);

    expect(await screen.findByText('ไม่มีสิทธิ์ใช้งาน')).toBeDefined();
    expect(calls.some((call) => call.url.includes('/users'))).toBe(false);
  });
});
