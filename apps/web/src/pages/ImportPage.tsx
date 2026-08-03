/**
 * หน้า Import — เดินทีละขั้นตามกฎเหล็กข้อ 3/4
 *   1) เลือกบริษัท (บังคับ) + ไฟล์ .xlsx → สำรวจไฟล์ว่ามี sheet อะไร header อยู่แถวไหน
 *   2) เลือก sheet → ตรวจแบบ preview (dryRun) เห็นว่าจะสร้าง/อัปเดตรายการไหน
 *   3) ยืนยัน → บันทึกจริง แล้วสรุปผล
 *
 * ถ้าไฟล์ขาดคอลัมน์ที่จำเป็นหรือมีแถวพัง จะแสดงรายละเอียดจาก api (คอลัมน์ไหนหาย /
 * ชื่อ header ที่ยอมรับ / แถวไหนพังเพราะอะไร) ไม่ใช่แค่ข้อความว่าไม่สำเร็จ
 */
import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Card, CardTitle } from '../components/ui/Card';
import { EmptyBlock, ErrorBlock } from '../components/ui/StateBlock';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { parseImportError, type ImportRejection } from '../lib/import-errors';
import { canOperate } from '../lib/permissions';
import type { ImportInspectResult, ImportResult } from '../lib/types';

export function ImportPage(): React.JSX.Element {
  const { user } = useAuth();
  const allowed = canOperate(user);

  const [companyId, setCompanyId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sheetName, setSheetName] = useState('');
  const [strict, setStrict] = useState(true);
  const [inspection, setInspection] = useState<ImportInspectResult | null>(null);
  const [preview, setPreview] = useState<ImportResult | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rejection, setRejection] = useState<ImportRejection | null>(null);

  const companiesQuery = useQuery({ queryKey: ['companies'], queryFn: () => api.companies() });

  const resetAfterFileChange = (nextFile: File | null): void => {
    setFile(nextFile);
    setInspection(null);
    setSheetName('');
    setPreview(null);
    setResult(null);
    setRejection(null);
  };

  const inspectMutation = useMutation({
    mutationFn: () => {
      if (file === null) {
        throw new Error('ยังไม่ได้เลือกไฟล์');
      }
      return api.inspectImport(file);
    },
    onSuccess: (data) => {
      setInspection(data);
      setRejection(null);
      // เลือก sheet ที่ระบบแนะนำไว้ให้ก่อน ผู้ใช้เปลี่ยนได้
      setSheetName(data.suggestedSheet ?? '');
    },
    onError: (error: unknown) => setRejection(parseImportError(error)),
  });

  const runMutation = useMutation({
    mutationFn: (dryRun: boolean) => {
      if (file === null) {
        throw new Error('ยังไม่ได้เลือกไฟล์');
      }
      return api.runImport({ file, companyId, sheetName, dryRun, strict });
    },
    onSuccess: (data) => {
      setRejection(null);
      if (data.dryRun) {
        setPreview(data);
        setResult(null);
      } else {
        setResult(data);
        setPreview(null);
      }
    },
    onError: (error: unknown) => setRejection(parseImportError(error)),
  });

  const companyName =
    companiesQuery.data?.find((company) => company.id === companyId)?.name ?? null;
  const canInspect = file !== null && companyId !== '';

  if (!allowed) {
    return (
      <>
        <header className="page-header">
          <div>
            <h1>นำเข้าข้อมูล</h1>
            <p>นำเข้ารายงาน SSL รายเดือนจากไฟล์ Excel</p>
          </div>
        </header>
        <Card>
          <CardTitle>ไม่มีสิทธิ์ใช้งาน</CardTitle>
          <div className="placeholder-note">
            บัญชีของคุณมีสิทธิ์อ่านข้อมูลเท่านั้น —
            การนำเข้าข้อมูลต้องเป็นผู้ดูแลระบบหรือผู้ปฏิบัติงาน
          </div>
        </Card>
      </>
    );
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>นำเข้าข้อมูลจาก Excel</h1>
          <p>ข้อมูลจริงเก็บในฐานข้อมูล — ไฟล์ Excel เป็นเพียงช่องทางนำเข้า</p>
        </div>
      </header>

      <Card>
        <CardTitle>ขั้นที่ 1 — เลือกบริษัทและไฟล์</CardTitle>
        <div className="import-step">
          <div className="field">
            <label htmlFor="import-company">บริษัท (จำเป็น)</label>
            <select
              id="import-company"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              <option value="">— เลือกบริษัท —</option>
              {(companiesQuery.data ?? []).map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </option>
              ))}
            </select>
            <span className="field-hint">
              ทุกรายการในไฟล์จะถูกผูกกับบริษัทนี้ — ระบบไม่อ่านชื่อบริษัทจากไฟล์
            </span>
          </div>

          <div className="field">
            <label htmlFor="import-file">ไฟล์ .xlsx</label>
            <input
              id="import-file"
              type="file"
              accept=".xlsx"
              onChange={(event) => resetAfterFileChange(event.target.files?.[0] ?? null)}
            />
            {file !== null && <span className="field-hint">{file.name}</span>}
          </div>

          <button
            type="button"
            className="btn"
            disabled={!canInspect || inspectMutation.isPending}
            onClick={() => inspectMutation.mutate()}
          >
            {inspectMutation.isPending ? 'กำลังอ่านไฟล์…' : 'สำรวจไฟล์'}
          </button>
        </div>
      </Card>

      {inspection !== null && (
        <Card className="stack-top">
          <CardTitle>ขั้นที่ 2 — เลือก sheet และตรวจข้อมูล</CardTitle>

          <table>
            <thead>
              <tr>
                <th className="cell-center">เลือก</th>
                <th>ชื่อ sheet</th>
                <th className="cell-center">แถว header</th>
                <th className="cell-center">จำนวนแถวข้อมูล</th>
                <th className="cell-center">คอลัมน์ที่ map ได้</th>
                <th>สถานะ</th>
              </tr>
            </thead>
            <tbody>
              {inspection.sheets.map((sheet) => (
                <tr key={sheet.name}>
                  <td className="cell-center">
                    <input
                      type="radio"
                      name="sheet"
                      aria-label={`เลือก sheet ${sheet.name}`}
                      checked={sheetName === sheet.name}
                      disabled={!sheet.importable}
                      onChange={() => {
                        setSheetName(sheet.name);
                        setPreview(null);
                        setResult(null);
                      }}
                    />
                  </td>
                  <td className="cell-name">
                    {sheet.name}
                    {inspection.suggestedSheet === sheet.name && (
                      <span className="tag tag-info">ระบบแนะนำ</span>
                    )}
                  </td>
                  <td className="cell-center">{sheet.headerRow ?? '-'}</td>
                  <td className="cell-center">{sheet.dataRowCount}</td>
                  <td className="cell-center">{sheet.mappedFieldCount}</td>
                  <td className={sheet.importable ? 'status-done' : 'status-cancelled'}>
                    {sheet.importable
                      ? 'นำเข้าได้'
                      : `ขาดคอลัมน์: ${sheet.missingRequired.join(', ')}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="import-step" style={{ marginTop: 16 }}>
            <div className="field">
              <label htmlFor="import-strict">โหมดตรวจเข้ม</label>
              <select
                id="import-strict"
                value={strict ? 'true' : 'false'}
                onChange={(event) => setStrict(event.target.value === 'true')}
              >
                <option value="true">เข้ม — มีแถวเสียแม้แถวเดียวไม่บันทึกทั้งไฟล์</option>
                <option value="false">ผ่อน — บันทึกเฉพาะแถวที่ใช้ได้</option>
              </select>
            </div>
            <button
              type="button"
              className="btn"
              disabled={sheetName === '' || runMutation.isPending}
              onClick={() => runMutation.mutate(true)}
            >
              {runMutation.isPending ? 'กำลังตรวจ…' : 'ตรวจข้อมูล (ยังไม่บันทึก)'}
            </button>
          </div>
        </Card>
      )}

      {rejection !== null && <ImportRejectionCard rejection={rejection} />}

      {preview !== null && (
        <Card className="stack-top">
          <CardTitle>ขั้นที่ 3 — ตรวจผลก่อนบันทึก</CardTitle>

          <div className="summary-row">
            <SummaryPill label="รายการที่อ่านได้" value={preview.rowCount} />
            <SummaryPill label="สร้างใหม่" value={preview.createdCount} tone="var(--green)" />
            <SummaryPill label="อัปเดตของเดิม" value={preview.updatedCount} tone="var(--accent)" />
            <SummaryPill label="ข้าม" value={preview.skippedCount} tone="var(--amber)" />
          </div>

          {preview.warnings.length > 0 && (
            <div className="warning-box">
              <strong>คำเตือน {preview.warnings.length} รายการ</strong>
              <ul>
                {preview.warnings.slice(0, 10).map((warning, index) => (
                  <li key={`${warning.excelRow}-${index}`}>
                    {warning.excelRow > 0 ? `แถว ${warning.excelRow}: ` : ''}
                    {warning.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <table>
            <thead>
              <tr>
                <th className="cell-center">แถวในไฟล์</th>
                <th>Common Name</th>
                <th>Endpoint</th>
                <th className="cell-center">วันคงเหลือ</th>
                <th className="cell-center">ผลที่จะเกิด</th>
              </tr>
            </thead>
            <tbody>
              {preview.preview.map((row) => (
                <tr key={`${row.excelRow}-${row.endpoint}`}>
                  <td className="cell-center">{row.excelRow}</td>
                  <td className="cell-name">{row.commonName}</td>
                  <td className="cell-endpoint">{row.endpoint === '' ? '-' : row.endpoint}</td>
                  <td className="cell-center">{row.daysUntilExpiry} วัน</td>
                  <td className="cell-center">
                    <span className={`tag ${row.action === 'create' ? 'tag-new' : 'tag-update'}`}>
                      {row.action === 'create' ? 'สร้างใหม่' : 'อัปเดต'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="modal-actions" style={{ marginTop: 16 }}>
            <button
              type="button"
              className="btn"
              disabled={runMutation.isPending}
              onClick={() => runMutation.mutate(false)}
            >
              {runMutation.isPending
                ? 'กำลังบันทึก…'
                : `ยืนยันนำเข้า ${preview.rowCount} รายการเข้าบริษัท ${companyName ?? ''}`}
            </button>
          </div>
        </Card>
      )}

      {result !== null && (
        <Card className="stack-top">
          <CardTitle>ผลการนำเข้า</CardTitle>
          <div className="summary-row">
            <SummaryPill label="สร้างใหม่" value={result.createdCount} tone="var(--green)" />
            <SummaryPill label="อัปเดต" value={result.updatedCount} tone="var(--accent)" />
            <SummaryPill label="ข้าม" value={result.skippedCount} tone="var(--amber)" />
            <SummaryPill label="สร้างงานต่ออายุ" value={result.tasksCreated} />
          </div>
          <p className="import-done">
            นำเข้าไฟล์ <strong>{result.filename}</strong> (sheet {result.sheetName}) สำเร็จ — สถานะ{' '}
            {result.status} · ดูผลได้ที่หน้า Dashboard และ Certificates
          </p>
          {result.errors.length > 0 && (
            <div className="warning-box">
              <strong>แถวที่ข้ามไป {result.errors.length} รายการ</strong>
              <ul>
                {result.errors.slice(0, 10).map((issue, index) => (
                  <li key={`${issue.excelRow}-${index}`}>
                    แถว {issue.excelRow}: {issue.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}

      <ImportHistory companyId={companyId} />
    </>
  );
}

function ImportRejectionCard({ rejection }: { rejection: ImportRejection }): React.JSX.Element {
  return (
    <Card className="stack-top">
      <CardTitle>ไฟล์นี้นำเข้าไม่ได้</CardTitle>
      <div className="form-error" role="alert">
        {rejection.message}
      </div>

      {rejection.missingColumns !== undefined && (
        <div className="reject-detail">
          <h4>คอลัมน์ที่จำเป็นแต่หาไม่เจอ</h4>
          <ul>
            {rejection.missingColumns.map((column) => (
              <li key={column}>{column}</li>
            ))}
          </ul>
          {rejection.acceptedHeaders !== undefined && (
            <>
              <h4>ชื่อหัวคอลัมน์ที่ระบบยอมรับ</h4>
              <ul>
                {Object.entries(rejection.acceptedHeaders).map(([field, headers]) => (
                  <li key={field}>
                    <code>{field}</code>: {headers.join(', ')}
                  </li>
                ))}
              </ul>
            </>
          )}
          {rejection.headersFound !== undefined && (
            <>
              <h4>หัวคอลัมน์ที่เจอในไฟล์ (แถว {rejection.headerRow ?? '-'})</h4>
              <p className="cell-endpoint">{rejection.headersFound.join(' · ')}</p>
            </>
          )}
        </div>
      )}

      {rejection.errors !== undefined && (
        <div className="reject-detail">
          <h4>แถวที่ข้อมูลไม่ถูกต้อง ({rejection.errors.length} แถว)</h4>
          <ul>
            {rejection.errors.slice(0, 20).map((issue, index) => (
              <li key={`${issue.excelRow}-${index}`}>
                แถว {issue.excelRow}
                {issue.column === undefined ? '' : ` คอลัมน์ ${issue.column}`}: {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      {rejection.availableSheets !== undefined && (
        <div className="reject-detail">
          <h4>sheet ที่มีในไฟล์</h4>
          <p className="cell-endpoint">{rejection.availableSheets.join(' · ')}</p>
        </div>
      )}
    </Card>
  );
}

function ImportHistory({ companyId }: { companyId: string }): React.JSX.Element {
  const batchesQuery = useQuery({
    queryKey: ['import-batches', companyId],
    queryFn: () => api.importBatches(companyId === '' ? undefined : companyId),
  });

  return (
    <Card flush className="stack-top">
      <CardTitle>ประวัติการนำเข้า</CardTitle>
      {batchesQuery.isError && <ErrorBlock error={batchesQuery.error} />}
      {batchesQuery.isSuccess && batchesQuery.data.length === 0 && (
        <EmptyBlock label="ยังไม่มีประวัติการนำเข้า" />
      )}
      {batchesQuery.isSuccess && batchesQuery.data.length > 0 && (
        <table>
          <thead>
            <tr>
              <th>ไฟล์</th>
              <th>บริษัท</th>
              <th>sheet</th>
              <th className="cell-center">สร้าง/อัปเดต/ข้าม</th>
              <th className="cell-center">สถานะ</th>
              <th>ผู้นำเข้า</th>
            </tr>
          </thead>
          <tbody>
            {batchesQuery.data.map((batch) => (
              <tr key={batch.id}>
                <td className="cell-name">{batch.filename}</td>
                <td>{batch.company.code}</td>
                <td className="cell-endpoint">{batch.sheetName ?? '-'}</td>
                <td className="cell-center">
                  {batch.createdCount}/{batch.updatedCount}/{batch.skippedCount}
                </td>
                <td
                  className={`status-text ${batch.status === 'SUCCESS' ? 'status-done' : 'status-pending'}`}
                >
                  {batch.status}
                </td>
                <td className="cell-endpoint">{batch.importedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  );
}

function SummaryPill({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}): React.JSX.Element {
  return (
    <div className="summary-pill">
      <span>{label}</span>
      <strong style={tone === undefined ? undefined : { color: tone }}>{value}</strong>
    </div>
  );
}
