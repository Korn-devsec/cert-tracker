/**
 * หน้า Settings/Users (ADMIN) — จัดการผู้ใช้และสิทธิ์
 *
 * สร้างผู้ใช้ผ่าน `POST /auth/register` และแก้ไขผ่าน `PATCH /users/:id`
 * ข้อจำกัดที่ api บังคับไว้ (ปิด/ลดสิทธิ์ตัวเองไม่ได้, ต้องเหลือ admin ที่ใช้งานได้) จะขึ้นเป็นข้อความบนฟอร์ม
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { USER_ROLE_LABEL_TH, UserRole } from '@cert-tracker/shared';
import { Card, CardTitle } from '../components/ui/Card';
import { Modal } from '../components/ui/Modal';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { canManageUsers } from '../lib/permissions';
import type { UserAccount } from '../lib/types';

const ROLES: UserRole[] = [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER];

interface CreateForm {
  email: string;
  name: string;
  password: string;
  role: UserRole;
}

const EMPTY_CREATE: CreateForm = {
  email: '',
  name: '',
  password: '',
  role: UserRole.VIEWER,
};

export function UsersPage(): React.JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = canManageUsers(user);

  const [includeInactive, setIncludeInactive] = useState(true);
  const [isCreating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [editing, setEditing] = useState<UserAccount | null>(null);
  const [editName, setEditName] = useState('');
  const [editRole, setEditRole] = useState<UserRole>(UserRole.VIEWER);
  const [editPassword, setEditPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', 'all', includeInactive],
    queryFn: () => api.users({ includeInactive: includeInactive ? 'true' : undefined }),
    enabled: isAdmin,
  });

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const onError = (error: unknown): void =>
    setFormError(error instanceof Error ? error.message : String(error));

  const createMutation = useMutation({
    mutationFn: () =>
      api.createUser({
        email: createForm.email.trim(),
        name: createForm.name.trim(),
        password: createForm.password,
        role: createForm.role,
      }),
    onSuccess: async () => {
      setCreating(false);
      setCreateForm(EMPTY_CREATE);
      setFormError(null);
      await invalidate();
    },
    onError,
  });

  const updateMutation = useMutation({
    mutationFn: (target: UserAccount) =>
      api.updateUser(target.id, {
        name: editName.trim(),
        role: editRole,
        ...(editPassword === '' ? {} : { password: editPassword }),
      }),
    onSuccess: async () => {
      closeEdit();
      await invalidate();
    },
    onError,
  });

  const toggleActiveMutation = useMutation({
    mutationFn: (target: UserAccount) => api.updateUser(target.id, { isActive: !target.isActive }),
    onSuccess: invalidate,
  });

  const openEdit = (target: UserAccount): void => {
    setEditing(target);
    setEditName(target.name);
    setEditRole(target.role);
    setEditPassword('');
    setFormError(null);
  };

  const closeEdit = (): void => {
    setEditing(null);
    setEditPassword('');
    setFormError(null);
  };

  if (!isAdmin) {
    return (
      <>
        <header className="page-header">
          <div>
            <h1>ตั้งค่า / ผู้ใช้</h1>
            <p>จัดการบัญชีผู้ใช้และสิทธิ์การเข้าถึง</p>
          </div>
        </header>
        <Card>
          <CardTitle>ไม่มีสิทธิ์ใช้งาน</CardTitle>
          <div className="placeholder-note">หน้านี้สำหรับผู้ดูแลระบบ (ADMIN) เท่านั้น</div>
        </Card>
      </>
    );
  }

  const users = usersQuery.data ?? [];

  return (
    <>
      <header className="page-header">
        <div>
          <h1>ตั้งค่า / ผู้ใช้</h1>
          <p>
            ผู้ดูแลระบบ = จัดการทุกอย่าง · ผู้ปฏิบัติงาน = นำเข้า/ดำเนินงาน · ผู้ดูข้อมูล =
            อ่านเท่านั้น
          </p>
        </div>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="user-scope">ขอบเขต:</label>
            <select
              id="user-scope"
              value={includeInactive ? 'true' : 'false'}
              onChange={(event) => setIncludeInactive(event.target.value === 'true')}
            >
              <option value="true">ทั้งหมด</option>
              <option value="false">เฉพาะบัญชีที่ใช้งาน</option>
            </select>
          </div>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCreateForm(EMPTY_CREATE);
              setFormError(null);
              setCreating(true);
            }}
          >
            + เพิ่มผู้ใช้
          </button>
        </div>
      </header>

      <Card flush>
        <CardTitle>บัญชีผู้ใช้ ({users.length})</CardTitle>

        {usersQuery.isPending && <LoadingBlock />}
        {usersQuery.isError && (
          <ErrorBlock error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />
        )}
        {usersQuery.isSuccess && users.length === 0 && <EmptyBlock label="ไม่พบบัญชีผู้ใช้" />}

        {users.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>ชื่อ</th>
                <th>อีเมล</th>
                <th className="cell-center">สิทธิ์</th>
                <th className="cell-center">สถานะ</th>
                <th className="cell-center">จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {users.map((account) => (
                <tr key={account.id}>
                  <td className="cell-name">
                    {account.name}
                    {account.id === user?.id && <span className="tag tag-info">คุณ</span>}
                  </td>
                  <td>{account.email}</td>
                  <td className="cell-center">{USER_ROLE_LABEL_TH[account.role]}</td>
                  <td
                    className={`status-text ${account.isActive ? 'status-done' : 'status-cancelled'}`}
                  >
                    {account.isActive ? 'ใช้งาน' : 'ปิดใช้งาน'}
                  </td>
                  <td className="cell-center">
                    <div className="row-actions">
                      <button type="button" className="btn-link" onClick={() => openEdit(account)}>
                        แก้ไข
                      </button>
                      <button
                        type="button"
                        className="btn-link danger"
                        disabled={account.id === user?.id || toggleActiveMutation.isPending}
                        title={
                          account.id === user?.id ? 'ปิดใช้งานบัญชีของตัวเองไม่ได้' : undefined
                        }
                        onClick={() => toggleActiveMutation.mutate(account)}
                      >
                        {account.isActive ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {toggleActiveMutation.isError && <ErrorBlock error={toggleActiveMutation.error} />}
      </Card>

      {isCreating && (
        <Modal title="เพิ่มผู้ใช้" onClose={() => setCreating(false)}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              createMutation.mutate();
            }}
          >
            {formError !== null && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="field">
              <label htmlFor="new-user-email">อีเมล</label>
              <input
                id="new-user-email"
                type="email"
                required
                value={createForm.email}
                onChange={(event) => setCreateForm({ ...createForm, email: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="new-user-name">ชื่อ</label>
              <input
                id="new-user-name"
                required
                minLength={2}
                value={createForm.name}
                onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })}
              />
            </div>
            <div className="field">
              <label htmlFor="new-user-password">รหัสผ่าน</label>
              <input
                id="new-user-password"
                type="password"
                required
                minLength={12}
                value={createForm.password}
                onChange={(event) => setCreateForm({ ...createForm, password: event.target.value })}
              />
              <span className="field-hint">อย่างน้อย 12 ตัวอักษร</span>
            </div>
            <div className="field">
              <label htmlFor="new-user-role">สิทธิ์</label>
              <select
                id="new-user-role"
                value={createForm.role}
                onChange={(event) =>
                  setCreateForm({ ...createForm, role: event.target.value as UserRole })
                }
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABEL_TH[role]}
                  </option>
                ))}
              </select>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setCreating(false)}
              >
                ยกเลิก
              </button>
              <button type="submit" className="btn" disabled={createMutation.isPending}>
                {createMutation.isPending ? 'กำลังบันทึก…' : 'สร้างบัญชี'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {editing !== null && (
        <Modal title={`แก้ไข ${editing.email}`} onClose={closeEdit}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setFormError(null);
              updateMutation.mutate(editing);
            }}
          >
            {formError !== null && (
              <div className="form-error" role="alert">
                {formError}
              </div>
            )}
            <div className="field">
              <label htmlFor="edit-user-name">ชื่อ</label>
              <input
                id="edit-user-name"
                required
                minLength={2}
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-user-role">สิทธิ์</label>
              <select
                id="edit-user-role"
                value={editRole}
                disabled={editing.id === user?.id}
                onChange={(event) => setEditRole(event.target.value as UserRole)}
              >
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {USER_ROLE_LABEL_TH[role]}
                  </option>
                ))}
              </select>
              {editing.id === user?.id && (
                <span className="field-hint">
                  เปลี่ยนสิทธิ์ของตัวเองไม่ได้ — ให้ผู้ดูแลคนอื่นเปลี่ยนให้
                </span>
              )}
            </div>
            <div className="field">
              <label htmlFor="edit-user-password">ตั้งรหัสผ่านใหม่ (เว้นว่างถ้าไม่เปลี่ยน)</label>
              <input
                id="edit-user-password"
                type="password"
                minLength={12}
                value={editPassword}
                onChange={(event) => setEditPassword(event.target.value)}
              />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn btn-secondary" onClick={closeEdit}>
                ยกเลิก
              </button>
              <button type="submit" className="btn" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'กำลังบันทึก…' : 'บันทึก'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
