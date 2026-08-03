/**
 * แผงจัดการงานต่ออายุ — ใช้ทั้งในหน้า Certificate Detail และหน้า Tasks
 *
 * ปลายทางของสถานะมาจาก `allowedNextWorkStatuses` ใน `@cert-tracker/shared`
 * ซึ่งเป็นตารางเดียวกับที่ api ใช้ตรวจ → ปุ่มบนหน้าจอจะไม่เสนอสิ่งที่ api จะปฏิเสธ
 */
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { allowedNextWorkStatuses, WorkStatus } from '@cert-tracker/shared';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth-context';
import { workStatusLabel } from '../../lib/format';
import { canListUsers, canOperate } from '../../lib/permissions';
import type { TaskDetailView } from '../../lib/types';

interface TaskActionsProps {
  task: TaskDetailView;
  /** query key ที่ต้อง refetch หลังเปลี่ยนข้อมูลสำเร็จ */
  invalidateKeys: unknown[][];
  compact?: boolean;
}

export function TaskActions({
  task,
  invalidateKeys,
  compact = false,
}: TaskActionsProps): React.JSX.Element {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const allowed = canOperate(user);

  const nextStatuses = allowedNextWorkStatuses(task.status as unknown as WorkStatus);
  const [status, setStatus] = useState('');
  const [assigneeId, setAssigneeId] = useState(task.assigneeId ?? '');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const usersQuery = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => api.users(),
    enabled: allowed && canListUsers(user),
  });

  const invalidate = async (): Promise<void> => {
    setError(null);
    setNote('');
    setStatus('');
    for (const key of invalidateKeys) {
      await queryClient.invalidateQueries({ queryKey: key });
    }
  };

  const onError = (mutationError: unknown): void => {
    setError(mutationError instanceof Error ? mutationError.message : String(mutationError));
  };

  const statusMutation = useMutation({
    mutationFn: () =>
      api.changeTaskStatus(task.id, {
        status,
        note: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: invalidate,
    onError,
  });

  const assignMutation = useMutation({
    mutationFn: () =>
      api.assignTask(task.id, {
        assigneeId: assigneeId === '' ? null : assigneeId,
        note: note.trim() === '' ? undefined : note.trim(),
      }),
    onSuccess: invalidate,
    onError,
  });

  if (!allowed) {
    return (
      <p className="cell-endpoint">
        บัญชีของคุณมีสิทธิ์อ่านข้อมูลเท่านั้น —
        การเปลี่ยนสถานะและมอบหมายงานต้องเป็นผู้ดูแลระบบหรือผู้ปฏิบัติงาน
      </p>
    );
  }

  const isClosed = nextStatuses.length === 0;

  return (
    <div className={`task-actions${compact ? ' compact' : ''}`}>
      {error !== null && (
        <div className="form-error" role="alert">
          {error}
        </div>
      )}

      {isClosed ? (
        <p className="cell-endpoint">
          งานนี้ปิดแล้ว ({workStatusLabel(task.status)}) — ถ้าต้องต่ออายุรอบใหม่ให้เปิดงานใบใหม่
        </p>
      ) : (
        <>
          <div className="task-action-row">
            <div className="field">
              <label htmlFor={`status-${task.id}`}>เปลี่ยนสถานะเป็น</label>
              <select
                id={`status-${task.id}`}
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">— เลือกสถานะ —</option>
                {nextStatuses.map((next) => (
                  <option key={next} value={next}>
                    {workStatusLabel(next)}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn"
              disabled={status === '' || statusMutation.isPending}
              onClick={() => statusMutation.mutate()}
            >
              {statusMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกสถานะ'}
            </button>
          </div>

          <div className="task-action-row">
            <div className="field">
              <label htmlFor={`assignee-${task.id}`}>ผู้รับผิดชอบ</label>
              <select
                id={`assignee-${task.id}`}
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">— ไม่มอบหมาย —</option>
                {(usersQuery.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name} ({candidate.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={assignMutation.isPending || assigneeId === (task.assigneeId ?? '')}
              onClick={() => assignMutation.mutate()}
            >
              {assignMutation.isPending ? 'กำลังบันทึก…' : 'บันทึกผู้รับผิดชอบ'}
            </button>
          </div>

          <div className="field">
            <label htmlFor={`note-${task.id}`}>บันทึกเพิ่มเติม (จะถูกเก็บในประวัติ)</label>
            <input
              id={`note-${task.id}`}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="เช่น ส่ง CSR ให้ CA แล้ว"
            />
          </div>
        </>
      )}
    </div>
  );
}
