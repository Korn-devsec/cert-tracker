/**
 * ตัวกลางเรียก API ตัวเดียวของฝั่ง web
 *
 * - แนบ JWT ให้ทุกคำขอ
 * - แปลง error ของ api (ที่เป็นภาษาไทยอยู่แล้ว) เป็น `ApiError` ให้หน้าจอแสดงได้ตรงๆ
 * - 401 = token หมดอายุ/ถูกเพิกถอน → แจ้ง `AuthProvider` ให้ล้าง session
 */
import type {
  CertificateListItem,
  Company,
  DashboardSummary,
  LoginResponse,
  Paginated,
} from './types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get isUnauthorized(): boolean {
    return this.status === 401;
  }
}

type TokenReader = () => string | null;

let readToken: TokenReader = () => null;
let onUnauthorized: () => void = () => undefined;

/** ให้ AuthProvider ผูก token store เข้ากับตัวเรียก API (ไม่อ่าน localStorage กระจายทั่วโค้ด) */
export function configureApi(options: { getToken: TokenReader; onUnauthorized: () => void }): void {
  readToken = options.getToken;
  onUnauthorized = options.onUnauthorized;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** ข้ามการแนบ token (ใช้กับ /auth/login) */
  anonymous?: boolean;
}

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = options.anonymous === true ? null : readToken();
  const headers: Record<string, string> = {};
  if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new ApiError(0, `เชื่อมต่อ API ไม่ได้ (${API_BASE_URL}) — ตรวจว่า backend รันอยู่`);
  }

  if (response.status === 401 && options.anonymous !== true) {
    onUnauthorized();
  }

  if (!response.ok) {
    throw new ApiError(response.status, await readErrorMessage(response));
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** ข้อความ error ของ NestJS อยู่ในฟิลด์ `message` (เป็น string หรือ array ของ string) */
async function readErrorMessage(response: Response): Promise<string> {
  const fallback = `คำขอไม่สำเร็จ (HTTP ${response.status})`;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'message' in body) {
      const message = (body as { message: unknown }).message;
      if (typeof message === 'string') {
        return message;
      }
      if (Array.isArray(message)) {
        return message.filter((item): item is string => typeof item === 'string').join(' · ');
      }
    }
    return fallback;
  } catch {
    return fallback;
  }
}

/** ต่อ query string โดยตัดค่าที่ว่าง/undefined ออก */
export function buildQuery(params: Record<string, string | number | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query.length > 0 ? `?${query}` : '';
}

// ===== endpoint ที่หน้าจอใช้ =====

export const api = {
  login: (email: string, password: string): Promise<LoginResponse> =>
    apiFetch<LoginResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    }),

  me: (): Promise<LoginResponse['user']> => apiFetch('/auth/me'),

  companies: (): Promise<Company[]> => apiFetch('/companies'),

  dashboardSummary: (params: {
    companyId?: string;
    month?: string;
    status?: string;
  }): Promise<DashboardSummary> => apiFetch(`/dashboard/summary${buildQuery(params)}`),

  certificates: (params: {
    companyId?: string;
    month?: string;
    status?: string;
    risk?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<CertificateListItem>> => apiFetch(`/certificates${buildQuery(params)}`),
};
