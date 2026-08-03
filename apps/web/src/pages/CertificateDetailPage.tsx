/**
 * หน้า Certificate Detail — ข้อมูลเทคนิคครบตาม PLAN.md Phase 7
 * (CN, SAN, Issuer, Serial, Algorithm, Key Size, SHA256, Endpoint, Owner)
 * + งานต่ออายุปัจจุบัน (เปลี่ยนสถานะ/มอบหมายได้ตามสิทธิ์) + ไทม์ไลน์ประวัติ + ไฟล์แนบ
 */
import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { formatThaiDate } from '@cert-tracker/shared';
import { TaskActions } from '../components/tasks/TaskActions';
import { Card, CardTitle } from '../components/ui/Card';
import { RiskBadge } from '../components/ui/RiskBadge';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api, downloadAttachment } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { formatDaysRemaining, RISK_COLOR, statusToneClass, workStatusLabel } from '../lib/format';
import { canOperate } from '../lib/permissions';
import type { CertificateDetail, HistoryLogEntry } from '../lib/types';

/** คำอธิบายภาษาไทยของ action ในประวัติ — ให้ไทม์ไลน์อ่านรู้เรื่องโดยไม่ต้องเดา enum */
const ACTION_LABEL: Record<string, string> = {
  IMPORT: 'นำเข้าข้อมูล',
  CERTIFICATE_CREATED: 'สร้างใบรับรองในระบบ',
  CERTIFICATE_UPDATED: 'แก้ไขข้อมูลใบรับรอง',
  TASK_CREATED: 'เปิดงานต่ออายุ',
  ASSIGN: 'มอบหมายงาน',
  STATUS_CHANGE: 'เปลี่ยนสถานะงาน',
  CONTACT_VENDOR: 'ติดต่อผู้ให้บริการ',
  CSR_GENERATED: 'ส่งคำขอให้ CA',
  CERTIFICATE_ISSUED: 'ได้รับใบรับรองใหม่',
  INSTALL: 'ติดตั้งใบรับรอง',
  VERIFY: 'ตรวจสอบ/ทดสอบ',
  COMPLETE: 'ปิดงาน (เรียบร้อย)',
  CANCEL: 'ยกเลิกงาน',
  ATTACHMENT_UPLOADED: 'แนบไฟล์',
  NOTIFICATION_SENT: 'ส่งการแจ้งเตือน',
};

export function CertificateDetailPage(): React.JSX.Element {
  const { id = '' } = useParams<{ id: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const certificateQuery = useQuery({
    queryKey: ['certificate', id],
    queryFn: () => api.certificate(id),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => api.uploadAttachment(id, file),
    onSuccess: async () => {
      setUploadError(null);
      if (fileInputRef.current !== null) {
        fileInputRef.current.value = '';
      }
      await queryClient.invalidateQueries({ queryKey: ['certificate', id] });
    },
    onError: (error: unknown) =>
      setUploadError(error instanceof Error ? error.message : String(error)),
  });

  const createTaskMutation = useMutation({
    mutationFn: () => api.createTask({ certificateId: id, note: 'เปิดงานจากหน้ารายละเอียด' }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['certificate', id] }),
  });

  if (certificateQuery.isPending) {
    return <LoadingBlock />;
  }
  if (certificateQuery.isError) {
    return (
      <ErrorBlock error={certificateQuery.error} onRetry={() => void certificateQuery.refetch()} />
    );
  }

  const certificate: CertificateDetail = certificateQuery.data;
  const currentTask = certificate.currentTask;

  return (
    <>
      <header className="page-header">
        <div>
          <p className="breadcrumb">
            <Link to="/certificates" className="link">
              ← กลับไปรายการ Certificates
            </Link>
          </p>
          <h1>{certificate.commonName}</h1>
          <p>
            {certificate.company.name} ({certificate.company.code})
            {certificate.site === null ? '' : ` · ${certificate.site.name}`}
          </p>
        </div>
        <div className="detail-risk">
          <RiskBadge risk={certificate.riskLevel} />
          <div className="detail-days" style={{ color: RISK_COLOR[certificate.riskLevel] }}>
            {formatDaysRemaining(certificate.daysUntilExpiry)}
          </div>
          <div className="cell-endpoint">
            หมดอายุ {formatThaiDate(new Date(certificate.expiresAt))}
          </div>
        </div>
      </header>

      <div className="detail-grid">
        <Card>
          <CardTitle>ข้อมูลใบรับรอง</CardTitle>
          <dl className="spec-list">
            <SpecItem label="Common Name" value={certificate.commonName} />
            <SpecItem
              label="SAN"
              value={certificate.san.length === 0 ? null : certificate.san.join(', ')}
            />
            <SpecItem label="Issuer" value={certificate.issuer} />
            <SpecItem label="Serial Number" value={certificate.serialNumber} mono />
            <SpecItem label="Signature Algorithm" value={certificate.signatureAlgorithm} />
            <SpecItem
              label="Key Size"
              value={certificate.keySize === null ? null : `${certificate.keySize} bits`}
            />
            <SpecItem label="SHA-256 Fingerprint" value={certificate.sha256Fingerprint} mono />
            <SpecItem
              label="Endpoint"
              value={certificate.endpoint === '' ? null : certificate.endpoint}
              mono
            />
            <SpecItem label="ผู้ดูแล (Owner)" value={certificate.owner} />
            <SpecItem
              label="วันหมดอายุ"
              value={`${formatThaiDate(new Date(certificate.expiresAt))} (${formatDaysRemaining(
                certificate.daysUntilExpiry,
              )})`}
            />
            <SpecItem label="หมายเหตุ" value={certificate.remark} />
          </dl>
        </Card>

        <div className="detail-side">
          <Card>
            <CardTitle>งานต่ออายุปัจจุบัน</CardTitle>
            {currentTask === null ? (
              <>
                <EmptyBlock label="ยังไม่มีงานต่ออายุสำหรับใบนี้" />
                {canOperate(user) && (
                  <button
                    type="button"
                    className="btn"
                    disabled={createTaskMutation.isPending}
                    onClick={() => createTaskMutation.mutate()}
                  >
                    {createTaskMutation.isPending ? 'กำลังเปิดงาน…' : 'เปิดงานต่ออายุ'}
                  </button>
                )}
                {createTaskMutation.isError && <ErrorBlock error={createTaskMutation.error} />}
              </>
            ) : (
              <>
                <div className="task-summary">
                  <div>
                    <span className="cell-endpoint">สถานะ</span>
                    <div className={`status-text ${statusToneClass(currentTask.status)}`}>
                      {workStatusLabel(currentTask.status)}
                    </div>
                  </div>
                  <div>
                    <span className="cell-endpoint">ผู้รับผิดชอบ</span>
                    <div>{currentTask.assignee?.name ?? 'ยังไม่มอบหมาย'}</div>
                  </div>
                  <div>
                    <span className="cell-endpoint">กำหนดเสร็จ</span>
                    <div>
                      {currentTask.dueDate === null
                        ? '-'
                        : formatThaiDate(new Date(currentTask.dueDate))}
                    </div>
                  </div>
                </div>
                {currentTask.note !== null && <p className="task-note">{currentTask.note}</p>}
                <TaskActions
                  task={currentTask}
                  invalidateKeys={[['certificate', id], ['tasks'], ['dashboard-summary']]}
                />
              </>
            )}
          </Card>

          <Card className="stack-top">
            <CardTitle>ไฟล์แนบ ({certificate.attachments.length})</CardTitle>
            {certificate.attachments.length === 0 && <EmptyBlock label="ยังไม่มีไฟล์แนบ" />}
            {certificate.attachments.length > 0 && (
              <ul className="attachment-list">
                {certificate.attachments.map((attachment) => (
                  <li key={attachment.id}>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() =>
                        void downloadAttachment(id, attachment.id, attachment.filename)
                      }
                    >
                      {attachment.filename}
                    </button>
                    <span className="cell-endpoint">
                      {attachment.uploadedBy} · {formatThaiDate(new Date(attachment.createdAt))}
                      {attachment.sizeBytes === null
                        ? ''
                        : ` · ${Math.ceil(attachment.sizeBytes / 1024)} KB`}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {canOperate(user) && (
              <div className="field" style={{ marginTop: 12 }}>
                <label htmlFor="attachment-file">แนบไฟล์ใหม่</label>
                <input
                  id="attachment-file"
                  ref={fileInputRef}
                  type="file"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file !== undefined) {
                      uploadMutation.mutate(file);
                    }
                  }}
                />
                <span className="field-hint">
                  รับไฟล์ใบรับรอง (.pem/.crt/.cer), คำขอ (.csr) และเอกสารประกอบ — ไม่รับไฟล์ที่มี
                  private key
                </span>
                {uploadMutation.isPending && <span className="field-hint">กำลังอัปโหลด…</span>}
                {uploadError !== null && (
                  <div className="form-error" role="alert">
                    {uploadError}
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>

      <Card className="stack-top">
        <CardTitle>ประวัติการดำเนินการ ({certificate.historyLogs.length})</CardTitle>
        {certificate.historyLogs.length === 0 ? (
          <EmptyBlock label="ยังไม่มีประวัติ" />
        ) : (
          <ol className="timeline">
            {certificate.historyLogs.map((entry) => (
              <TimelineItem key={entry.id} entry={entry} />
            ))}
          </ol>
        )}
      </Card>

      {certificate.renewalTasks.length > 1 && (
        <Card flush className="stack-top">
          <CardTitle>งานต่ออายุทุกรอบ ({certificate.renewalTasks.length})</CardTitle>
          <table>
            <thead>
              <tr>
                <th>เปิดงานเมื่อ</th>
                <th className="cell-center">สถานะ</th>
                <th>ผู้รับผิดชอบ</th>
                <th>ปิดงานเมื่อ</th>
              </tr>
            </thead>
            <tbody>
              {certificate.renewalTasks.map((task) => (
                <tr key={task.id}>
                  <td>{formatThaiDate(new Date(task.createdAt))}</td>
                  <td className={`status-text ${statusToneClass(task.status)}`}>
                    {workStatusLabel(task.status)}
                  </td>
                  <td>{task.assignee?.name ?? '-'}</td>
                  <td>
                    {task.completedAt === null ? '-' : formatThaiDate(new Date(task.completedAt))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}

function SpecItem({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}): React.JSX.Element {
  return (
    <>
      <dt>{label}</dt>
      <dd className={mono ? 'mono' : undefined}>{value ?? '-'}</dd>
    </>
  );
}

function TimelineItem({ entry }: { entry: HistoryLogEntry }): React.JSX.Element {
  const timestamp = new Date(entry.createdAt);
  const time = `${String(timestamp.getHours()).padStart(2, '0')}:${String(
    timestamp.getMinutes(),
  ).padStart(2, '0')}`;

  return (
    <li>
      <div className="timeline-marker" aria-hidden="true" />
      <div className="timeline-body">
        <div className="timeline-head">
          <strong>{ACTION_LABEL[entry.action] ?? entry.action}</strong>
          <span className="cell-endpoint">
            {formatThaiDate(timestamp)} {time} · {entry.actor}
          </span>
        </div>
        {entry.detail !== null && <p>{entry.detail}</p>}
      </div>
    </li>
  );
}
