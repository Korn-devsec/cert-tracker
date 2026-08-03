/** รูปแบบ response ของ GET /health ตามเกณฑ์ตรวจรับ Phase 0 */
export interface HealthResponse {
  status: 'ok' | 'error';
  db: 'connected' | 'disconnected';
}
