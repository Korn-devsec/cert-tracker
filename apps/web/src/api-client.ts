export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'connected' | 'disconnected';
}

/** เรียก GET /health ของ api — ใช้ยืนยันว่า web ต่อ backend ได้จริง (เกณฑ์ตรวจรับ Phase 0) */
export async function fetchHealth(): Promise<HealthResponse> {
  const response = await fetch(`${API_BASE_URL}/health`);
  return (await response.json()) as HealthResponse;
}
