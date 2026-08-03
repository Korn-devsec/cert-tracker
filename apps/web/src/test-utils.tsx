/**
 * ตัวช่วยสำหรับเทสต์ระดับ component — provider ชุดเดียวกับแอปจริง (React Query + Router + Auth)
 * และตัวจำลอง `fetch` แบบกำหนดคำตอบต่อ endpoint
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import type { UserRole } from '@cert-tracker/shared';
import { AuthProvider } from './lib/auth';

export interface MockRoute {
  /** ส่วนของ URL ที่ต้องตรงกัน (เช่น `/companies`) */
  match: string;
  method?: string;
  status?: number;
  body: unknown;
}

export interface RecordedCall {
  url: string;
  method: string;
  body?: unknown;
}

/**
 * จำลอง API ทั้งหมด — route ตัวแรกที่ตรงทั้ง path และ method จะถูกใช้
 * ทำให้เทสต์เห็นเฉพาะข้อมูลที่ "API ส่งมา" เท่านั้น (คุมกฎเหล็กข้อ 1)
 */
export function mockFetch(routes: MockRoute[]): RecordedCall[] {
  const calls: RecordedCall[] = [];

  vi.stubGlobal(
    'fetch',
    vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? 'GET';
      let parsedBody: unknown;
      if (typeof init?.body === 'string') {
        parsedBody = JSON.parse(init.body);
      } else if (init?.body instanceof FormData) {
        parsedBody = Object.fromEntries(
          Array.from(init.body.entries()).map(([key, value]) => [
            key,
            value instanceof File ? `file:${value.name}` : value,
          ]),
        );
      }
      calls.push({ url, method, body: parsedBody });

      const route = routes.find(
        (candidate) =>
          url.includes(candidate.match) && (candidate.method ?? 'GET') === method.toUpperCase(),
      );
      if (route === undefined) {
        return Promise.reject(new Error(`ไม่ได้จำลอง endpoint นี้ไว้: ${method} ${url}`));
      }

      return Promise.resolve(
        new Response(JSON.stringify(route.body), {
          status: route.status ?? 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );
    }),
  );

  return calls;
}

export function loginAs(role: UserRole, id = 'user-me'): void {
  localStorage.setItem('cert-tracker.token', 'test-token');
  localStorage.setItem(
    'cert-tracker.user',
    JSON.stringify({ id, email: 'me@example.com', name: 'ฉันเอง', role }),
  );
}

export function renderWithProviders(
  ui: React.ReactNode,
  options: { route?: string } = {},
): ReturnType<typeof render> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter initialEntries={[options.route ?? '/']}>{ui}</MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
}
