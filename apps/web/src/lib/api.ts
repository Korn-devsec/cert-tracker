/**
 * ตัวกลางเรียก API ตัวเดียวของฝั่ง web
 *
 * - แนบ JWT ให้ทุกคำขอ
 * - แปลง error ของ api (ที่เป็นภาษาไทยอยู่แล้ว) เป็น `ApiError` ให้หน้าจอแสดงได้ตรงๆ
 * - 401 = token หมดอายุ/ถูกเพิกถอน → แจ้ง `AuthProvider` ให้ล้าง session
 */
import type {
  Attachment,
  CertificateDetail,
  CertificateListItem,
  Company,
  CompanyDetail,
  DashboardSummary,
  ImportBatchSummary,
  ImportInspectResult,
  ImportResult,
  LoginResponse,
  Paginated,
  RenewalTask,
  TaskListItem,
  UserAccount,
} from './types';

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /**
     * body ทั้งก้อนที่ api ตอบมา — หน้า Import ต้องใช้รายละเอียด (คอลัมน์ที่หาย, แถวที่พัง)
     * ไม่ใช่แค่ข้อความสรุป
     */
    readonly details?: unknown,
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
    throw await toApiError(response);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/**
 * อัปโหลดไฟล์ (multipart) — ห้ามตั้ง Content-Type เอง เพราะ browser ต้องเติม boundary ให้
 */
export async function apiUpload<T>(
  path: string,
  form: FormData,
  options: { method?: 'POST' | 'PATCH' } = {},
): Promise<T> {
  const token = readToken();
  const headers: Record<string, string> = {};
  if (token !== null) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: options.method ?? 'POST',
      headers,
      body: form,
    });
  } catch {
    throw new ApiError(0, `เชื่อมต่อ API ไม่ได้ (${API_BASE_URL}) — ตรวจว่า backend รันอยู่`);
  }

  if (response.status === 401) {
    onUnauthorized();
  }
  if (!response.ok) {
    throw await toApiError(response);
  }
  return (await response.json()) as T;
}

/**
 * ข้อความ error ของ NestJS อยู่ในฟิลด์ `message` (เป็น string หรือ array ของ string)
 * และเก็บ body ทั้งก้อนไว้ใน `details` ให้หน้าที่ต้องใช้รายละเอียด (เช่นหน้า Import)
 */
async function toApiError(response: Response): Promise<ApiError> {
  const fallback = `คำขอไม่สำเร็จ (HTTP ${response.status})`;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return new ApiError(response.status, fallback);
  }

  if (typeof body === 'object' && body !== null && 'message' in body) {
    const message = (body as { message: unknown }).message;
    if (typeof message === 'string') {
      return new ApiError(response.status, message, body);
    }
    if (Array.isArray(message)) {
      const joined = message.filter((item): item is string => typeof item === 'string').join(' · ');
      return new ApiError(response.status, joined.length > 0 ? joined : fallback, body);
    }
  }
  return new ApiError(response.status, fallback, body);
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
    expired?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<CertificateListItem>> => apiFetch(`/certificates${buildQuery(params)}`),

  certificate: (id: string): Promise<CertificateDetail> => apiFetch(`/certificates/${id}`),

  // ===== บริษัท (หน้า Companies) =====
  companiesAll: (includeInactive: boolean): Promise<Company[]> =>
    apiFetch(`/companies${buildQuery({ includeInactive: includeInactive ? 'true' : undefined })}`),

  company: (id: string): Promise<CompanyDetail> => apiFetch(`/companies/${id}`),

  createCompany: (body: { name: string; code: string; contactEmail?: string }): Promise<Company> =>
    apiFetch('/companies', { method: 'POST', body }),

  updateCompany: (
    id: string,
    body: { name?: string; contactEmail?: string; isActive?: boolean },
  ): Promise<Company> => apiFetch(`/companies/${id}`, { method: 'PATCH', body }),

  deactivateCompany: (id: string): Promise<Company> =>
    apiFetch(`/companies/${id}`, { method: 'DELETE' }),

  // ===== นำเข้าข้อมูล (หน้า Import) =====
  inspectImport: (file: File): Promise<ImportInspectResult> => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload('/imports/inspect', form);
  },

  runImport: (params: {
    file: File;
    companyId: string;
    sheetName?: string;
    dryRun: boolean;
    strict: boolean;
  }): Promise<ImportResult> => {
    const form = new FormData();
    form.append('file', params.file);
    form.append('companyId', params.companyId);
    if (params.sheetName !== undefined && params.sheetName !== '') {
      form.append('sheetName', params.sheetName);
    }
    form.append('dryRun', String(params.dryRun));
    form.append('strict', String(params.strict));
    return apiUpload('/imports', form);
  },

  importBatches: (companyId?: string): Promise<ImportBatchSummary[]> =>
    apiFetch(`/imports${buildQuery({ companyId })}`),

  // ===== งานต่ออายุ (หน้า Tasks) =====
  tasks: (params: {
    companyId?: string;
    status?: string;
    assigneeId?: string;
    risk?: string;
    open?: string;
    page?: number;
    pageSize?: number;
  }): Promise<Paginated<TaskListItem>> => apiFetch(`/tasks${buildQuery(params)}`),

  changeTaskStatus: (id: string, body: { status: string; note?: string }): Promise<RenewalTask> =>
    apiFetch(`/tasks/${id}/status`, { method: 'PATCH', body }),

  assignTask: (
    id: string,
    body: { assigneeId: string | null; dueDate?: string; note?: string },
  ): Promise<RenewalTask> => apiFetch(`/tasks/${id}/assign`, { method: 'PATCH', body }),

  createTask: (body: { certificateId: string; note?: string }): Promise<RenewalTask> =>
    apiFetch('/tasks', { method: 'POST', body }),

  // ===== ไฟล์แนบ (หน้า Certificate Detail) =====
  uploadAttachment: (certificateId: string, file: File): Promise<Attachment> => {
    const form = new FormData();
    form.append('file', file);
    return apiUpload(`/certificates/${certificateId}/attachments`, form);
  },

  attachmentDownloadUrl: (certificateId: string, attachmentId: string): string =>
    `${API_BASE_URL}/certificates/${certificateId}/attachments/${attachmentId}/download`,

  // ===== ผู้ใช้ (หน้า Settings/Users + dropdown ผู้รับผิดชอบ) =====
  users: (params: { includeInactive?: string; role?: string } = {}): Promise<UserAccount[]> =>
    apiFetch(`/users${buildQuery(params)}`),

  createUser: (body: {
    email: string;
    name: string;
    password: string;
    role: string;
  }): Promise<UserAccount> => apiFetch('/auth/register', { method: 'POST', body }),

  updateUser: (
    id: string,
    body: { name?: string; role?: string; isActive?: boolean; password?: string },
  ): Promise<UserAccount> => apiFetch(`/users/${id}`, { method: 'PATCH', body }),
};

/**
 * ดาวน์โหลดไฟล์แนบพร้อมแนบ token — `<a href>` ธรรมดาแนบ Authorization header ไม่ได้
 * จึงต้องดึงเป็น blob แล้วเปิดให้ผู้ใช้เอง
 */
export async function downloadAttachment(
  certificateId: string,
  attachmentId: string,
  filename: string,
): Promise<void> {
  const token = readToken();
  const response = await fetch(api.attachmentDownloadUrl(certificateId, attachmentId), {
    headers: token === null ? {} : { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw await toApiError(response);
  }

  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
