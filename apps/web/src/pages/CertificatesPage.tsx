/** หน้า Certificates — รายการทั้งหมด + ค้นหา/กรอง แล้วกดเข้าไปดูรายละเอียด */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { formatThaiDate, RiskLevel } from '@cert-tracker/shared';
import { Card, CardTitle } from '../components/ui/Card';
import { RiskBadge } from '../components/ui/RiskBadge';
import { EmptyBlock, ErrorBlock, LoadingBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import {
  formatDaysRemaining,
  RISK_COLOR,
  RISK_ORDER,
  riskLabel,
  statusToneClass,
  workStatusLabel,
  WORK_STATUS_ORDER,
} from '../lib/format';

const PAGE_SIZE = 25;

export function CertificatesPage(): React.JSX.Element {
  const [companyId, setCompanyId] = useState('');
  const [risk, setRisk] = useState('');
  const [status, setStatus] = useState('');
  const [expired, setExpired] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: () => api.companies() });

  const filters = { companyId, risk, status, expired, search };
  const certificatesQuery = useQuery({
    queryKey: ['certificates-page', filters, page],
    queryFn: () => api.certificates({ ...filters, page, pageSize: PAGE_SIZE }),
  });

  const change = (setter: (value: string) => void) => (value: string) => {
    setter(value);
    setPage(1);
  };

  const data = certificatesQuery.data;

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Certificates</h1>
          <p>วันคงเหลือและระดับความเสี่ยงคำนวณสดจากวันหมดอายุทุกครั้งที่เปิดหน้านี้</p>
        </div>
        <div className="controls">
          <div className="control-group">
            <label htmlFor="cert-search">ค้นหา:</label>
            <input
              id="cert-search"
              type="search"
              placeholder="CN / endpoint / ผู้ดูแล"
              value={search}
              onChange={(event) => change(setSearch)(event.target.value)}
            />
          </div>
          <div className="control-group">
            <label htmlFor="cert-company">บริษัท:</label>
            <select
              id="cert-company"
              value={companyId}
              onChange={(event) => change(setCompanyId)(event.target.value)}
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
            <label htmlFor="cert-risk">ความเสี่ยง:</label>
            <select
              id="cert-risk"
              value={risk}
              onChange={(event) => change(setRisk)(event.target.value)}
            >
              <option value="">ทุกระดับ</option>
              {RISK_ORDER.map((level) => (
                <option key={level} value={level}>
                  {riskLabel(level as RiskLevel)}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="cert-status">สถานะงาน:</label>
            <select
              id="cert-status"
              value={status}
              onChange={(event) => change(setStatus)(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              {WORK_STATUS_ORDER.map((workStatus) => (
                <option key={workStatus} value={workStatus}>
                  {workStatusLabel(workStatus)}
                </option>
              ))}
            </select>
          </div>
          <div className="control-group">
            <label htmlFor="cert-expired">หมดอายุแล้ว:</label>
            <select
              id="cert-expired"
              value={expired}
              onChange={(event) => change(setExpired)(event.target.value)}
            >
              <option value="">ทั้งหมด</option>
              <option value="true">เฉพาะที่หมดอายุแล้ว</option>
              <option value="false">เฉพาะที่ยังไม่หมดอายุ</option>
            </select>
          </div>
        </div>
      </header>

      <Card flush>
        <CardTitle>
          รายการ Certificate{data === undefined ? '' : ` (${data.meta.total} รายการ)`}
        </CardTitle>

        {certificatesQuery.isPending && <LoadingBlock />}
        {certificatesQuery.isError && (
          <ErrorBlock
            error={certificatesQuery.error}
            onRetry={() => void certificatesQuery.refetch()}
          />
        )}
        {data !== undefined && data.data.length === 0 && (
          <EmptyBlock label="ไม่พบ certificate ตามเงื่อนไขที่เลือก" />
        )}

        {data !== undefined && data.data.length > 0 && (
          <>
            <table>
              <thead>
                <tr>
                  <th className="cell-center">ลำดับ</th>
                  <th>ชื่อรายการ (Common Name)</th>
                  <th>บริษัท</th>
                  <th>วันหมดอายุ</th>
                  <th className="cell-center">วันคงเหลือ</th>
                  <th className="cell-center">ความเสี่ยง</th>
                  <th className="cell-center">สถานะงาน</th>
                </tr>
              </thead>
              <tbody>
                {data.data.map((certificate, index) => (
                  <tr key={certificate.id}>
                    <td className="cell-index">
                      {(data.meta.page - 1) * data.meta.pageSize + index + 1}
                    </td>
                    <td className="cell-name">
                      <Link to={`/certificates/${certificate.id}`} className="link">
                        {certificate.commonName}
                      </Link>
                      <div className="cell-endpoint">
                        {certificate.endpoint === '' ? 'ไม่ระบุ endpoint' : certificate.endpoint}
                      </div>
                    </td>
                    <td>{certificate.company.code}</td>
                    <td>{formatThaiDate(new Date(certificate.expiresAt))}</td>
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
                หน้า {data.meta.page}/{data.meta.totalPages} · ทั้งหมด {data.meta.total} รายการ
              </span>
              <div className="pager">
                <button
                  type="button"
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                  disabled={data.meta.page <= 1}
                >
                  ก่อนหน้า
                </button>
                <button
                  type="button"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={data.meta.page >= data.meta.totalPages}
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
