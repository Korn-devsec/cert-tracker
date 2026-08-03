import { useEffect, useState } from 'react';
import { RISK_LEVEL_LABEL_TH, RiskLevel } from '@cert-tracker/shared';
import { API_BASE_URL, fetchHealth, type HealthResponse } from './api-client';

const RISK_COLOR: Record<RiskLevel, string> = {
  [RiskLevel.HIGH]: 'var(--risk-high)',
  [RiskLevel.MEDIUM]: 'var(--risk-medium)',
  [RiskLevel.LOW]: 'var(--risk-low)',
  [RiskLevel.SAFE]: 'var(--risk-safe)',
};

/**
 * Phase 0: หน้าเปล่าสำหรับยืนยันว่า toolchain ทำงานครบ
 * (web → api → PostgreSQL และ web resolve @cert-tracker/shared ได้)
 * Layout/Dashboard จริงเริ่มทำใน Phase 6
 */
export function App(): React.JSX.Element {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchHealth()
      .then(setHealth)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: '2rem 1.5rem' }}>
      <h1 style={{ fontSize: '1.5rem' }}>SSL Certificate Lifecycle Management</h1>
      <p style={{ color: 'var(--text-muted)', marginTop: 0 }}>
        Phase 0 — Project Setup &amp; Infrastructure
      </p>

      <section
        style={{
          background: 'var(--card)',
          border: `1px solid var(--border)`,
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          padding: '1.25rem 1.5rem',
          marginTop: '1.5rem',
        }}
      >
        <h2 style={{ fontSize: '1.05rem', borderLeft: '4px solid var(--accent)', paddingLeft: 10 }}>
          สถานะการเชื่อมต่อ Backend
        </h2>
        <p style={{ margin: '0.25rem 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
          {API_BASE_URL}/health
        </p>
        {error !== null && (
          <p style={{ color: 'var(--risk-high)' }}>เชื่อมต่อ API ไม่ได้: {error}</p>
        )}
        {error === null && health === null && <p>กำลังตรวจสอบ…</p>}
        {health !== null && (
          <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
            <li>
              API: <strong>{health.status}</strong>
            </li>
            <li>
              Database: <strong>{health.db}</strong>
            </li>
          </ul>
        )}
      </section>

      <section
        style={{
          background: 'var(--card)',
          border: `1px solid var(--border)`,
          borderRadius: 'var(--radius-card)',
          boxShadow: 'var(--shadow-card)',
          padding: '1.25rem 1.5rem',
          marginTop: '1rem',
        }}
      >
        <h2 style={{ fontSize: '1.05rem', borderLeft: '4px solid var(--accent)', paddingLeft: 10 }}>
          ตรวจสอบ packages/shared
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {Object.values(RiskLevel).map((risk) => (
            <span
              key={risk}
              style={{
                background: RISK_COLOR[risk],
                color: '#fff',
                borderRadius: 6,
                padding: '2px 10px',
                fontSize: '0.85rem',
                fontWeight: 600,
              }}
            >
              {RISK_LEVEL_LABEL_TH[risk]}
            </span>
          ))}
        </div>
      </section>
    </main>
  );
}
