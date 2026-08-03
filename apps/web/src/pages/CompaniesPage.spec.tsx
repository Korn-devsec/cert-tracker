/** เทสต์หน้า Companies ตาม checklist Phase 7: list + สร้าง / แก้ไข / ปิดใช้งาน */
import { cleanup, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UserRole } from '@cert-tracker/shared';
import { loginAs, mockFetch, renderWithProviders, type MockRoute } from '../test-utils';
import { CompaniesPage } from './CompaniesPage';

const companies = [
  {
    id: 'company-sme',
    name: 'SME Bank',
    code: 'SMEBANK',
    contactEmail: 'it@smebank.example.co.th',
    isActive: true,
  },
  { id: 'company-old', name: 'บริษัทที่ปิดแล้ว', code: 'OLD', contactEmail: null, isActive: false },
];

const routes: MockRoute[] = [{ match: '/companies', body: companies }];

describe('CompaniesPage', () => {
  beforeEach(() => {
    loginAs(UserRole.ADMIN);
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('แสดงรายการบริษัทพร้อมรหัสและสถานะจาก API', async () => {
    mockFetch(routes);
    renderWithProviders(<CompaniesPage />);

    const row = (await screen.findByText('SME Bank')).closest('tr');
    expect(within(row as HTMLElement).getByText('SMEBANK')).toBeDefined();
    expect(within(row as HTMLElement).getByText('it@smebank.example.co.th')).toBeDefined();
    expect(within(row as HTMLElement).getByText('ใช้งาน')).toBeDefined();

    const inactiveRow = screen.getByText('บริษัทที่ปิดแล้ว').closest('tr');
    expect(within(inactiveRow as HTMLElement).getByText('ปิดใช้งาน')).toBeDefined();
  });

  it('สร้างบริษัทใหม่ → ยิง POST /companies ด้วยค่าที่กรอก', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/companies', method: 'POST', status: 201, body: companies[0] },
    ]);
    renderWithProviders(<CompaniesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบริษัท' }));
    await userEvent.type(screen.getByLabelText('ชื่อบริษัท'), 'บริษัทใหม่');
    await userEvent.type(screen.getByLabelText('รหัสบริษัท'), 'newco');
    await userEvent.type(screen.getByLabelText('อีเมลผู้ติดต่อ'), 'it@newco.example.com');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'POST')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'POST')?.body).toEqual({
      name: 'บริษัทใหม่',
      code: 'newco',
      contactEmail: 'it@newco.example.com',
    });
  });

  it('รหัสซ้ำ → แสดงข้อความจาก api บนฟอร์ม (ไม่ปิดฟอร์มทิ้ง)', async () => {
    mockFetch([
      ...routes,
      {
        match: '/companies',
        method: 'POST',
        status: 409,
        body: { message: 'มีบริษัทรหัส SMEBANK อยู่ในระบบแล้ว' },
      },
    ]);
    renderWithProviders(<CompaniesPage />);

    await userEvent.click(await screen.findByRole('button', { name: '+ เพิ่มบริษัท' }));
    await userEvent.type(screen.getByLabelText('ชื่อบริษัท'), 'ซ้ำ');
    await userEvent.type(screen.getByLabelText('รหัสบริษัท'), 'SMEBANK');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    expect(await screen.findByText('มีบริษัทรหัส SMEBANK อยู่ในระบบแล้ว')).toBeDefined();
    expect(screen.getByLabelText('ชื่อบริษัท')).toBeDefined(); // ฟอร์มยังเปิดอยู่
  });

  it('แก้ไขบริษัท → รหัสถูกล็อกไว้ และส่งเฉพาะชื่อ/อีเมล', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/companies/company-sme', method: 'PATCH', body: companies[0] },
    ]);
    renderWithProviders(<CompaniesPage />);

    const row = (await screen.findByText('SME Bank')).closest('tr');
    await userEvent.click(within(row as HTMLElement).getByRole('button', { name: 'แก้ไข' }));

    expect(screen.getByLabelText('รหัสบริษัท')).toHaveProperty('disabled', true);
    expect(screen.getByText(/แก้รหัสหลังสร้างไม่ได้/)).toBeDefined();

    await userEvent.clear(screen.getByLabelText('ชื่อบริษัท'));
    await userEvent.type(screen.getByLabelText('ชื่อบริษัท'), 'SME Bank (ใหม่)');
    await userEvent.click(screen.getByRole('button', { name: 'บันทึก' }));

    await waitFor(() => {
      expect(calls.some((call) => call.method === 'PATCH')).toBe(true);
    });
    expect(calls.find((call) => call.method === 'PATCH')?.body).toEqual({
      name: 'SME Bank (ใหม่)',
      contactEmail: 'it@smebank.example.co.th',
    });
  });

  it('ปิดใช้งาน → ยิง DELETE (soft delete) และเปิดกลับ → PATCH isActive', async () => {
    const calls = mockFetch([
      ...routes,
      { match: '/companies/company-sme', method: 'DELETE', body: companies[0] },
      { match: '/companies/company-old', method: 'PATCH', body: companies[1] },
    ]);
    renderWithProviders(<CompaniesPage />);

    const activeRow = (await screen.findByText('SME Bank')).closest('tr');
    await userEvent.click(
      within(activeRow as HTMLElement).getByRole('button', { name: 'ปิดใช้งาน' }),
    );
    await waitFor(() => {
      expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    });

    const inactiveRow = screen.getByText('บริษัทที่ปิดแล้ว').closest('tr');
    await userEvent.click(
      within(inactiveRow as HTMLElement).getByRole('button', { name: 'เปิดใช้งาน' }),
    );
    await waitFor(() => {
      expect(
        calls.some((call) => call.method === 'PATCH' && call.url.includes('company-old')),
      ).toBe(true);
    });
    expect(
      calls.find((call) => call.method === 'PATCH' && call.url.includes('company-old'))?.body,
    ).toEqual({ isActive: true });
  });

  it('operator เห็นรายการแต่ไม่มีปุ่มจัดการ (api อนุญาตเฉพาะ admin)', async () => {
    localStorage.clear();
    loginAs(UserRole.OPERATOR);
    mockFetch(routes);
    renderWithProviders(<CompaniesPage />);

    expect(await screen.findByText('SME Bank')).toBeDefined();
    expect(screen.queryByRole('button', { name: '+ เพิ่มบริษัท' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'แก้ไข' })).toBeNull();
  });
});
