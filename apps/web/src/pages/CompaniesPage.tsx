/**
 * หน้า Companies — list + สร้าง / แก้ไข / ปิดใช้งาน (ปิดใช้งาน = soft delete ตาม Phase 2)
 *
 * รหัสบริษัท (`code`) แก้ไม่ได้หลังสร้าง เพราะประวัติการ import อ้างอิงรหัสนี้ (DECISIONS.md Phase 2)
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { canManageCompanies } from '../lib/permissions';
import type { Company } from '../lib/types';

interface FormState {
  name: string;
  code: string;
  contactEmail: string;
}

const EMPTY_FORM: FormState = { name: '', code: '', contactEmail: '' };

export function CompaniesPage(): React.JSX.Element {
  const { user } = useAuth();
  const canManage = canManageCompanies(user);
  const queryClient = useQueryClient();

  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Company | null>(null);
  const [isCreating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);

  const companiesQuery = useQuery({
    queryKey: ['companies-admin', includeInactive],
    queryFn: () => api.companiesAll(includeInactive),
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['companies-admin'] });
    // dropdown บนหน้า Dashboard ใช้ query key อีกตัว
    await queryClient.invalidateQueries({ queryKey: ['companies'] });
  };

  const createMutation = useMutation({
    mutationFn: () =>
      api.createCompany({
        name: form.name.trim(),
        code: form.code.trim(),
        contactEmail: form.contactEmail.trim() === '' ? undefined : form.contactEmail.trim(),
      }),
    onSuccess: async () => {
      closeForm();
      await invalidate();
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : String(error)),
  });

  const updateMutation = useMutation({
    mutationFn: (company: Company) =>
      api.updateCompany(company.id, {
        name: form.name.trim(),
        contactEmail: form.contactEmail.trim(),
      }),
    onSuccess: async () => {
      closeForm();
      await invalidate();
    },
    onError: (error: unknown) =>
      setFormError(error instanceof Error ? error.message : String(error)),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (company: Company) =>
      company.isActive
        ? api.deactivateCompany(company.id)
        : api.updateCompany(company.id, { isActive: true }),
    onSuccess: invalidate,
  });

  const openCreate = (): void => {
    setForm(EMPTY_FORM);
    setFormError(null);
    setCreating(true);
  };

  const openEdit = (company: Company): void => {
    setForm({
      name: company.name,
      code: company.code,
      contactEmail: company.contactEmail ?? '',
    });
    setFormError(null);
    setEditing(company);
  };

  const closeForm = (): void => {
    setCreating(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(null);
  };

  const submit = (event: React.FormEvent): void => {
    event.preventDefault();
    setFormError(null);
    if (editing !== null) {
      updateMutation.mutate(editing);
    } else {
      createMutation.mutate();
    }
  };

  const companies = companiesQuery.data ?? [];
  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>บริษัทลูกค้า</h1>
          <p>ทุก certificate ต้องผูกกับบริษัท — เลือกบริษัทก่อนนำเข้าข้อมูลทุกครั้ง</p>
        </div>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="include-inactive">แสดงบริษัทที่ปิดใช้งาน:</label>
            <select
              id="include-inactive"
              value={includeInactive ? 'true' : 'false'}
              onChange={(event) => setIncludeInactive(event.target.value === 'true')}
            >
              <option value="false">เฉพาะที่ใช้งาน</option>
              <option value="true">ทั้งหมด</option>
            </select>
          </div>
          {canManage && (
            <button type="button" className="btn" onClick={openCreate}>
              + เพิ่มบริษัท
            </button>
          )}
        </div>
      </header>

      <Card flush>
        <CardTitle>รายชื่อบริษัท ({companies.length})</CardTitle>

        {companiesQuery.isPending && <LoadingBlock />}
        {companiesQuery.isError && (
          <ErrorBlock error={companiesQuery.error} onRetry={() => void companiesQuery.refetch()} />
        )}
        {companiesQuery.isSuccess && companies.length === 0 && (
          <EmptyBlock label="ยังไม่มีบริษัทในระบบ — กด “เพิ่มบริษัท” เพื่อเริ่มต้น" />
        )}

        {companies.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>ชื่อบริษัท</th>
                <th>รหัส</th>
                <th>อีเมลผู้ติดต่อ</th>
                <th className="cell-center">สถานะ</th>
                {canManage && <th className="cell-center">จัดการ</th>}
              </tr>
            </thead>
            <tbody>
              {companies.map((company) => (
                <tr key={company.id}>
                  <td className="cell-name">{company.name}</td>
                  <td>
                    <code>{company.code}</code>
                  </td>
                  <td>{company.contactEmail ?? '-'}</td>
                  <td
                    className={`status-text ${company.isActive ? 'status-done' : 'status-cancelled'}`}
                  >
                    {company.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </td>
                  {canManage && (
                    <td className="cell-center">
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn-link"
                          onClick={() => openEdit(company)}
                        >
                          แก้ไข
                        </button>
                        <button
                          type="button"
                          className="btn-link danger"
                          disabled={toggleActiveMutation.isPending}
                          onClick={() => toggleActiveMutation.mutate(company)}
                        >
                          {company.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {toggleActiveMutation.isError && <ErrorBlock error={toggleActiveMutation.error} />}
      </Card>

      {(isCreating || editing !== null) && (
        <Modal
          title={editing === null ? 'เพิ่มบริษัท' : `แก้ไข ${editing.name}`}
          onClose={closeForm}
        >
          <form onSubmit={submit}>
            {formError !== null && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}

            <div className="field">
              <label htmlFor="company-name">ชื่อบริษัท</label>
              <input
                id="company-name"
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
            </div>

            <div className="field">
              <label htmlFor="company-code">รหัสบริษัท</label>
              <input
                id="company-code"
                required={editing === null}
                disabled={editing !== null}
                value={form.code}
                onChange={(event) => setForm({ ...form, code: event.target.value })}
              />
              <span className="field-hint">
                {editing === null
                  ? 'ใช้อ้างอิงตอนนำเข้าข้อมูล — ระบบบันทึกเป็นตัวพิมพ์ใหญ่'
                  : 'แก้รหัสหลังสร้างไม่ได้ เพราะประวัติการนำเข้าอ้างอิงรหัสนี้'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="company-email">อีเมลผู้ติดต่อ</label>
              <input
                id="company-email"
                type="email"
                value={form.contactEmail}
                onChange={(event) => setForm({ ...form, contactEmail: event.target.value })}
              />
              <span className="field-hint">ใช้เป็นผู้รับอีเมลแจ้งเตือนใบรับรองใกล้หมดอายุ</span>
            </div>

            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeForm}>
                ยกเลิก
              </button>
              <button type="submit" className="btn" disabled={isSaving}>
                {isSaving ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
