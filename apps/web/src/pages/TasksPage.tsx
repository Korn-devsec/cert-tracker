/**
 * หน้า Tasks — มุมมองตามขั้นของ workflow (board แบ่งคอลัมน์ตามสถานะ)
 * เปลี่ยนสถานะ/มอบหมายได้จากการ์ดโดยตรง ตามสิทธิ์ของผู้ใช้
 *
 * คอลัมน์เรียงตามลำดับ workflow และดึงสถานะจาก `@cert-tracker/shared` (ไม่ประกาศรายการซ้ำ)
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatThaiDate, WorkStatus } from '@cert-tracker/shared';
import { TaskActions } from '../components/tasks/TaskActions';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import {
  formatDaysRemaining,
  RISK_COLOR,
  RISK_ORDER,
  riskLabel,
  workStatusLabel,
  WORK_STATUS_ORDER,
} from '../lib/format';
import { canListUsers } from '../lib/permissions';
import type { TaskListItem } from '../lib/types';

/** ดึงทีเดียวให้ครบทุกคอลัมน์ของ board (ระดับข้อมูลของระบบนี้อยู่ในหลักร้อย) */
const BOARD_PAGE_SIZE = 200;

export function TasksPage(): React.JSX.Element {
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [risk, setRisk] = useState('');
  const [onlyOpen, setOnlyOpen] = useState('true');
  const [expandedTaskId, setExpandedTaskId] = useState<string | null>(null);

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: () => api.companies() });
  const usersQuery = useQuery({
    queryKey: ['users', 'assignable'],
    queryFn: () => api.users(),
    enabled: canListUsers(user),
  });

  const filters = { companyId, assigneeId, risk, open: onlyOpen };
  const tasksQuery = useQuery({
    queryKey: ['tasks', filters],
    queryFn: () => api.tasks({ ...filters, pageSize: BOARD_PAGE_SIZE }),
  });

  const tasks = tasksQuery.data?.data ?? [];
  const columns =
    onlyOpen === 'true'
      ? WORK_STATUS_ORDER.filter(
          (status) => status !== WorkStatus.COMPLETED && status !== WorkStatus.CANCELLED,
        )
      : WORK_STATUS_ORDER;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>งานต่ออายุ</h1>
          <p>
            ความเสี่ยงของใบรับรองกับสถานะงานเป็นคนละเรื่องกัน — ใบที่เหลือ 20
            วันแต่ปิดงานแล้วถือว่าเรียบร้อย
          </p>
        </div>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="task-company">บริษัท:</label>
            <select
              id="task-company"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              <option value="">ทุกบริษัท</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </option>
              ))}
            </select>
          </div>
          {canListUsers(user) && (
            <div className="control-group">
              <label htmlFor="task-assignee">ผู้รับผิดชอบ:</label>
              <select
                id="task-assignee"
                value={assigneeId}
                onChange={(event) => setAssigneeId(event.target.value)}
              >
                <option value="">ทุกคน</option>
                {(usersQuery.data ?? []).map((candidate) => (
                  <option key={candidate.id} value={candidate.id}>
                    {candidate.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="control-group">
            <label htmlFor="task-risk">ความเสี่ยง:</label>
            <select id="task-risk" value={risk} onChange={(event) => setRisk(event.target.value)}>
              <option value="">ทุกระดับ</option>
              {RISK_ORDER.map((level) => (
                <option key={level} value={level}>
                  {riskLabel(level)}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="task-open">ขอบเขต:</label>
            <select
              id="task-open"
              value={onlyOpen}
              onChange={(event) => setOnlyOpen(event.target.value)}
            >
              <option value="true">เฉพาะงานที่ยังไม่ปิด</option>
              <option value="">ทั้งหมด</option>
              <option value="false">เฉพาะงานที่ปิดแล้ว</option>
            </select>
          </div>
        </div>
      </header>

      {tasksQuery.isPending && <LoadingBlock />}
      {tasksQuery.isError && (
        <ErrorBlock error={tasksQuery.error} onRetry={() => void tasksQuery.refetch()} />
      )}

      {tasksQuery.isSuccess && tasks.length === 0 && (
        <Card>
          <CardTitle>ไม่มีงานตามเงื่อนไขที่เลือก</CardTitle>
          <EmptyBlock label="งานต่ออายุจะถูกสร้างอัตโนมัติเมื่อนำเข้าไฟล์ Excel หรือเปิดเองจากหน้ารายละเอียดใบรับรอง" />
        </Card>
      )}

      {tasksQuery.isSuccess && tasks.length > 0 && (
        <div className="board">
          {columns.map((status) => {
            const columnTasks = tasks.filter((task) => task.status === status);
            return (
              <section key={status} className="board-column">
                <header className="board-column-head">
                  <h3>{workStatusLabel(status)}</h3>
                  <span className="board-count">{columnTasks.length}</span>
                </header>
                <div className="board-cards">
                  {columnTasks.length === 0 && <p className="board-empty">—</p>}
                  {columnTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isExpanded={expandedTaskId === task.id}
                      onToggle={() =>
                        setExpandedTaskId((current) => (current === task.id ? null : task.id))
                      }
                      invalidateKeys={[['tasks'], ['dashboard-summary'], ['certificate']]}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

interface TaskCardProps {
  task: TaskListItem;
  isExpanded: boolean;
  onToggle: () => void;
  invalidateKeys: unknown[][];
}

function TaskCard({
  task,
  isExpanded,
  onToggle,
  invalidateKeys,
}: TaskCardProps): React.JSX.Element {
  const { certificate } = task;
  return (
    <article className="board-card">
      <Link to={`/certificates/${certificate.id}`} className="board-card-title link">
        {certificate.commonName}
      </Link>
      <div className="cell-endpoint">
        {certificate.company.code}
        {certificate.endpoint === '' ? '' : ` · ${certificate.endpoint}`}
      </div>
      <div className="board-card-meta">
        <span style={{ color: RISK_COLOR[certificate.riskLevel], fontWeight: 700 }}>
          {formatDaysRemaining(certificate.daysUntilExpiry)}
        </span>
        <span className="cell-endpoint">
          หมดอายุ {formatThaiDate(new Date(certificate.expiresAt))}
        </span>
      </div>
      <div className="board-card-meta">
        <span className="cell-endpoint">
          ผู้รับผิดชอบ: {task.assignee?.name ?? 'ยังไม่มอบหมาย'}
        </span>
      </div>

      <button type="button" className="btn-link" onClick={onToggle}>
        {isExpanded ? 'ซ่อนการจัดการ' : 'จัดการงาน'}
      </button>

      {isExpanded && <TaskActions task={task} invalidateKeys={invalidateKeys} compact />}
    </article>
  );
}
