/**
 * หน้า Dashboard — องค์ประกอบและโทนตาม legacy/report-jul69.html
 *   การ์ดสรุป 4 ระดับ → การ์ดตัวเลขรอง → Doughnut + Grouped Bar → ตารางรายการ
 *
 * กฎเหล็กข้อ 1: ตัวเลขทุกตัวมาจาก API (`/dashboard/summary`, `/certificates`) ไม่มีข้อมูลฝังในโค้ด
 * ตัวกรอง (บริษัท/เดือน/สถานะงาน) ถูกส่งไปทั้งสอง endpoint พร้อมกัน — เปลี่ยนตัวกรองแล้ว
 * การ์ด กราฟ และตารางจึงเปลี่ยนเป็นชุดข้อมูลเดียวกันทันที
 */
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatThaiDate } from '@cert-tracker/shared';
import { ChartCanvas } from '../charts/ChartCanvas';
import {
  riskDoughnutData,
  riskDoughnutOptions,
  statusBarData,
  statusBarOptions,
} from '../charts/chart-data';
import { Card, CardTitle } from '../components/ui/Card';
import { PolicyCard } from '../components/ui/PolicyCard';
import { RiskBadge } from '../components/ui/RiskBadge';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import {
  buildMonthOptions,
  buildReportSubtitle,
  formatDaysRemaining,
  RISK_COLOR,
  RISK_ORDER,
  statusToneClass,
  workStatusLabel,
  WORK_STATUS_ORDER,
} from '../lib/format';

const PAGE_SIZE = 25;

export function DashboardPage(): React.JSX.Element {
  const [companyId, setCompanyId] = useState('');
  const [month, setMonth] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);

  // รายการเดือนคำนวณจากวันที่ปัจจุบัน (ไม่ hard-code) — ป้ายเป็น พ.ศ.
  const monthOptions = useMemo(() => buildMonthOptions(new Date()), []);

  const companiesQuery = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies(),
  });

  const filters = { companyId, month, status };

  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', filters],
    queryFn: () => api.dashboardSummary(filters),
  });

  const certificatesQuery = useQuery({
    queryKey: ['certificates', filters, page],
    queryFn: () => api.certificates({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  /** เปลี่ยนตัวกรองแล้วต้องกลับไปหน้าแรก ไม่ให้ค้างที่หน้าที่ไม่มีข้อมูลแล้ว */
  const changeFilter = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const companyName =
    companyId === ''
      ? null
      : (companiesQuery.data?.find((company) => company.id === companyId)?.name ?? null);

  const summary = summaryQuery.data;
  const certificates = certificatesQuery.data;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Dashboard ติดตามสถานะ Certificate</h1>
          <p>{buildReportSubtitle({ month, companyName })}</p>
        </div>

        <div className="controls">
          <div className="control-group">
            <label htmlFor="filter-company">บริษัท:</label>
            <select
              id="filter-company"
              value={companyId}
              onChange={(event) => changeFilter(setCompanyId)(event.target.value)}
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
            <label htmlFor="filter-month">เลือกเดือน:</label>
            <select
              id="filter-month"
              value={month}
              onChange={(event) => changeFilter(setMonth)(event.target.value)}
            >
              <option value="">ทุกเดือน</option>
              {monthOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="control-group">
            <label htmlFor="filter-status">สถานะงาน:</label>
            <select
              id="filter-status"
              value={status}
              onChange={(event) => changeFilter(setStatus)(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {WORK_STATUS_ORDER.map((workStatus) => (
                <option key={workStatus} value={workStatus}>
                  {workStatusLabel(workStatus)}
                </option>
              ))}
            </select>
          </div>

          <button type="button" className="btn" onClick={() => window.print()}>
            พิมพ์รายงาน
          </button>
        </div>
      </header>

      {companiesQuery.isError && <ErrorBlock error={companiesQuery.error} />}

      {summaryQuery.isError && (
        <ErrorBlock error={summaryQuery.error} onRetry={() => void summaryQuery.refetch()} />
      )}
      {summaryQuery.isPending && <LoadingBlock label="กำลังคำนวณตัวเลขสรุป…" />}

      {summary !== undefined && (
        <>
          <div className="policy-container">
            {RISK_ORDER.map((risk) => (
              <PolicyCard key={risk} risk={risk} count={summary.byRisk[risk] ?? 0} />
            ))}
          </div>

          <div className="stat-container">
            <StatCard label="รายการทั้งหมด" value={summary.total} hint="ในขอบเขตที่กรอง" />
            <StatCard
              label="ใกล้หมดอายุ"
              value={summary.expiringSoon}
              hint="เหลือไม่เกิน 30 วัน"
              tone="var(--orange)"
            />
            <StatCard
              label="เรียบร้อยแล้ว"
              value={summary.completed}
              hint="ต่ออายุเสร็จแล้ว"
              tone="var(--green)"
            />
            <StatCard
              label="อยู่ระหว่างดำเนินการ"
              value={summary.pending}
              hint={`ยังไม่มีงาน ${summary.noTask} รายการ`}
              tone="var(--amber)"
            />
            <StatCard
              label="หมดอายุแล้ว"
              value={summary.expired}
              hint="ต้องต่ออายุด่วน"
              tone="var(--red)"
            />
          </div>

          <div className="charts-grid">
            <Card>
              <CardTitle>สัดส่วนความเสี่ยงประจำเดือน</CardTitle>
              <div className="chart-box">
                <ChartCanvas
                  type="doughnut"
                  data={riskDoughnutData(summary)}
                  options={riskDoughnutOptions}
                  ariaLabel="สัดส่วนใบรับรองแยกตามระดับความเสี่ยง"
                />
              </div>
            </Card>
            <Card>
              <CardTitle>สถานะงานรายกลุ่มความเสี่ยง</CardTitle>
              <div className="chart-box">
                <ChartCanvas
                  type="bar"
                  data={statusBarData(summary)}
                  options={statusBarOptions}
                  ariaLabel="จำนวนงานที่เรียบร้อยแล้วและอยู่ระหว่างดำเนินการ แยกตามระดับความเสี่ยง"
                />
              </div>
            </Card>
          </div>
        </>
      )}

      <Card flush>
        <CardTitle>รายละเอียดรายการ Certificate</CardTitle>

        {certificatesQuery.isError && (
          <ErrorBlock
            error={certificatesQuery.error}
            onRetry={() => void certificatesQuery.refetch()}
          />
        )}
        {certificatesQuery.isPending && <LoadingBlock />}

        {certificates !== undefined && certificates.data.length === 0 && (
          <EmptyBlock label="ไม่พบรายการ certificate ตามเงื่อนไขที่เลือก" />
        )}

        {certificates !== undefined && certificates.data.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th className="cell-center">ลำดับ</th>
                  <th>ชื่อรายการ (Common Name)</th>
                  <th className="cell-center">วันคงเหลือ</th>
                  <th className="cell-center">ระดับความเสี่ยง</th>
                  <th className="cell-center">สถานะ</th>
                </tr>
              </thead>
              <tbody>
                {certificates.data.map((certificate, index) => (
                  <tr key={certificate.id}>
                    <td className="cell-index">
                      {(certificates.meta.page - 1) * certificates.meta.pageSize + index + 1}
                    </td>
                    <td className="cell-name">
                      {certificate.commonName}
                      <div className="cell-endpoint">
                        {companyId === '' ? `${certificate.company.code} · ` : ''}
                        {certificate.endpoint.length > 0
                          ? certificate.endpoint
                          : 'ไม่ระบุ endpoint'}
                        {' · หมดอายุ '}
                        {formatThaiDate(new Date(certificate.expiresAt))}
                      </div>
                    </td>
                    <td className="cell-days" style={{ color: RISK_COLOR[certificate.riskLevel] }}>
                      {formatDaysRemaining(certificate.daysUntilExpiry)}
                    </td>
                    <td className="cell-center">
                      <RiskBadge risk={certificate.riskLevel} />
                    </td>
                    <td
                      className={`status-text ${statusToneClass(certificate.currentTask?.status ?? null)}`}
                    >
                      {certificate.currentTask === null
                        ? 'ยังไม่มีงาน'
                        : workStatusLabel(certificate.currentTask.status)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="table-footer">
              <span>
                แสดง {certificates.data.length} จาก {certificates.meta.total} รายการ · หน้า{' '}
                {certificates.meta.page}/{certificates.meta.totalPages}
              </span>
              <div className="pager">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={certificates.meta.page <= 1}
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={certificates.meta.page >= certificates.meta.totalPages}
                >
                  ถัดไป
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  hint: string;
  tone?: string;
}

function StatCard({ label, value, hint, tone }: StatCardProps): React.JSX.Element {
  return (
    <div className="stat-card">
      <h4>{label}</h4>
      <div className="stat-value" style={tone === undefined ? undefined : { color: tone }}>
        {value}
      </div>
      <div className="stat-hint">{hint}</div>
    </div>
  );
}
