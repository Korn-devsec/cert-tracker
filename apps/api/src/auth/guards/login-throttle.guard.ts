/**
 * จำกัดจำนวนครั้งที่ลอง login (Phase 8 — ตรวจความปลอดภัยพื้นฐาน)
 *
 * นับแยกตาม IP + อีเมลที่กรอก: การเดารหัสของบัญชีหนึ่งจะไม่ปิดกั้นผู้ใช้คนอื่นที่ออกจาก IP เดียวกัน
 * ตั้งค่าได้ด้วย `LOGIN_RATE_LIMIT` (ครั้ง) และ `LOGIN_RATE_WINDOW_SECONDS` (วินาที)
 *
 * อ่าน env ตอนสร้าง guard (ครั้งเดียวต่อการ boot) และ **ล้างตัวนับเมื่อ login สำเร็จ**
 * เพื่อไม่ให้ผู้ใช้ที่พิมพ์ผิดไปสองครั้งแล้วเข้าได้ ถูกกันในรอบถัดไป
 */
import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import { FixedWindowRateLimiter } from '../../common/rate-limit';

const DEFAULT_LIMIT = 5;
const DEFAULT_WINDOW_SECONDS = 60;

@Injectable()
export class LoginThrottleGuard implements CanActivate {
  private readonly limiter: FixedWindowRateLimiter;

  constructor() {
    const limit = Number(process.env.LOGIN_RATE_LIMIT ?? DEFAULT_LIMIT);
    const windowSeconds = Number(process.env.LOGIN_RATE_WINDOW_SECONDS ?? DEFAULT_WINDOW_SECONDS);
    this.limiter = new FixedWindowRateLimiter(
      Number.isFinite(limit) && limit > 0 ? limit : DEFAULT_LIMIT,
      (Number.isFinite(windowSeconds) && windowSeconds > 0
        ? windowSeconds
        : DEFAULT_WINDOW_SECONDS) * 1000,
    );
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const key = buildKey(request);
    const decision = this.limiter.hit(key);

    if (!decision.allowed) {
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `พยายามเข้าสู่ระบบถี่เกินไป — รออีก ${decision.retryAfterSeconds} วินาทีแล้วลองใหม่`,
          retryAfterSeconds: decision.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // ให้ AuthService ล้างตัวนับได้เมื่อรหัสผ่านถูกต้อง
    attachReset(request, () => this.limiter.reset(key));
    return true;
  }
}

interface RequestWithThrottle extends Request {
  resetLoginThrottle?: () => void;
}

function attachReset(request: Request, reset: () => void): void {
  (request as RequestWithThrottle).resetLoginThrottle = reset;
}

export function resetLoginThrottle(request: Request): void {
  (request as RequestWithThrottle).resetLoginThrottle?.();
}

/** คีย์ของตัวนับ: IP + อีเมล (ตัวพิมพ์เล็ก) — ไม่มีอีเมลก็ยังนับตาม IP ได้ */
function buildKey(request: Request): string {
  const body: unknown = request.body;
  const email =
    typeof body === 'object' && body !== null && 'email' in body
      ? String((body as { email: unknown }).email)
          .trim()
          .toLowerCase()
      : '';
  return `${request.ip ?? 'unknown'}|${email}`;
}
