/**
 * หน้า Reports (Phase 8)
 *   - สรุปรายเดือนเทียบเดือนก่อนหน้า (จำนวนตาม risk/status)
 *   - ดาวน์โหลดรายงาน Excel ตามตัวกรองปัจจุบัน
 *
 * ตัวเลขทั้งหมดมาจาก `/reports/monthly` ซึ่งใช้ตัวคำนวณชุดเดียวกับ Dashboard
 * ไฟล์ Excel สร้างจาก `/reports/certificates.xlsx` ด้วยตัวกรองเดียวกับที่เลือกบนหน้านี้
 */
import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { RiskLevel } from '@cert-tracker/shared';
import { Card, CardTitle } from '../components/ui/Card';
import { ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api, downloadCertificateReport } from '../lib/api';
import {
  buildMonthOptions,
  currentMonthKey,
  RISK_COLOR,
  RISK_ORDER,
  riskLabel,
  workStatusLabel,
  WORK_STATUS_ORDER,
} from '../lib/format';
import type { MonthlyBucket } from '../lib/types';

export function ReportsPage(): React.JSX.Element {
  const [companyId, setCompanyId] = useState('');
  const [month, setMonth] = useState(() => currentMonthKey(new Date()));
  const [downloadNote, setDownloadNote] = useState<string | null>(null);

  const monthOptions = useMemo(() => buildMonthOptions(new Date(), { back: 12, forward: 6 }), []);

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: () => api.companies() });

  const reportQuery = useQuery({
    queryKey: ['monthly-report', companyId, month],
    queryFn: () => api.monthlyReport({ companyId, month }),
  });

  const downloadMutation = useMutation({
    mutationFn: () => downloadCertificateReport({ companyId, month }),
    onSuccess: (result) => {
      setDownloadNote(
        result.truncated
          ? `ดาวน์โหลด ${result.filename} แล้ว — ไฟล์มี ${result.rowCount} รายการแรกเท่านั้น (ข้อมูลถูกตัด กรองให้แคบลงเพื่อดูส่วนที่เหลือ)`
          : `ดาวน์โหลด ${result.filename} แล้ว (${result.rowCount} รายการ)`,
      );
    },
  });

  const report = reportQuery.data;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>รายงาน</h1>
          <p>สรุปผลรายเดือนเทียบเดือนก่อนหน้า และส่งออกรายการเป็นไฟล์ Excel</p>
        </div>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="report-company">บริษัท:</label>
            <select
              id="report-company"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setDownloadNote(null);
              }}
            >
              <option value="">ทุกบริษัท</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="report-month">เดือน:</label>
            <select
              id="report-month"
              value={month}
              onChange={(event) => {
                setMonth(event.target.value);
                setDownloadNote(null);
              }}
            >
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="btn"
            disabled={downloadMutation.isPending}
            onClick={() => downloadMutation.mutate()}
          >
            {downloadMutation.isPending ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด Excel'}
          </button>
        </div>
      </header>

      {downloadMutation.isError && <ErrorBlock error={downloadMutation.error} />}
      {downloadNote !== null && (
        <div className="placeholder-note no-print" role="status">
          {downloadNote}
        </div>
      )}

      {reportQuery.isPending && <LoadingBlock label="กำลังสรุปตัวเลขรายเดือน…" />}
      {reportQuery.isError && (
        <ErrorBlock error={reportQuery.error} onRetry={() => void reportQuery.refetch()} />
      )}

      {report !== undefined && (
        <>
          <Card className="stack-top">
            <CardTitle>
              เทียบเดือน {report.current.monthLabel} กับ {report.previous.monthLabel}
              {report.companyName === null ? ' · ทุกบริษัท' : ` · ${report.companyName}`}
            </CardTitle>

            <table>
              <thead>
                <tr>
                  <th>หัวข้อ</th>
                  <th className="cell-center">{report.previous.monthLabel}</th>
                  <th className="cell-center">{report.current.monthLabel}</th>
                  <th className="cell-center">เปลี่ยนแปลง</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  label="รายการทั้งหมด"
                  previous={report.previous.total}
                  current={report.current.total}
                />
                {RISK_ORDER.map((risk) => (
                  <ComparisonRow
                    key={risk}
                    label={riskLabel(risk)}
                    color={RISK_COLOR[risk as RiskLevel]}
                    previous={report.previous.byRisk[risk] ?? 0}
                    current={report.current.byRisk[risk] ?? 0}
                  />
                ))}
                <ComparisonRow
                  label="เรียบร้อยแล้ว"
                  previous={report.previous.completed}
                  current={report.current.completed}
                />
                <ComparisonRow
                  label="ยังไม่เสร็จ"
                  previous={report.previous.pending}
                  current={report.current.pending}
                />
                <ComparisonRow
                  label="หมดอายุแล้ว"
                  previous={report.previous.expired}
                  current={report.current.expired}
                />
              </tbody>
            </table>
          </Card>

          <div className="charts-grid stack-top">
            <StatusBreakdownCard
              title={`สถานะงาน — ${report.current.monthLabel}`}
              bucket={report.current}
            />
            <StatusBreakdownCard
              title={`สถานะงาน — ${report.previous.monthLabel}`}
              bucket={report.previous}
            />
          </div>
        </>
      )}
    </>
  );
}

interface ComparisonRowProps {
  label: string;
  previous: number;
  current: number;
  color?: string;
}

function ComparisonRow({ label, previous, current, color }: ComparisonRowProps): React.JSX.Element {
  const delta = current - previous;
  return (
    <tr>
      <td className="cell-name" style={color === undefined ? undefined : { color }}>
        {label}
      </td>
      <td className="cell-center">{previous}</td>
      <td className="cell-center">{current}</td>
      <td className="cell-center" style={{ fontWeight: 700, color: deltaColor(delta) }}>
        {delta === 0 ? '—' : `${delta > 0 ? '+' : ''}${delta}`}
      </td>
    </tr>
  );
}

/** เพิ่มขึ้น = ส้ม (งานเข้ามามากขึ้น) · ลดลง = เขียว · เท่าเดิม = เทา */
function deltaColor(delta: number): string {
  if (delta > 0) {
    return 'var(--orange)';
  }
  if (delta < 0) {
    return 'var(--green)';
  }
  return 'var(--text-faint)';
}

function StatusBreakdownCard({
  title,
  bucket,
}: {
  title: string;
  bucket: MonthlyBucket;
}): React.JSX.Element {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <table>
        <thead>
          <tr>
            <th>สถานะงาน</th>
            <th className="cell-center">จำนวน</th>
          </tr>
        </thead>
        <tbody>
          {WORK_STATUS_ORDER.map((status) => (
            <tr key={status}>
              <td>{workStatusLabel(status)}</td>
              <td className="cell-center">{bucket.byStatus[status] ?? 0}</td>
            </tr>
          ))}
          <tr>
            <td>ยังไม่มีงานต่ออายุ</td>
            <td className="cell-center">{bucket.noTask}</td>
          </tr>
        </tbody>
      </table>
    </Card>
  );
}
