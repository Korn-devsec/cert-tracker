/**
 * ตัวนับคำขอแบบ fixed window ในหน่วยความจำ — ฟังก์ชันล้วน เทสต์ได้โดยไม่ต้องมี HTTP
 *
 * ใช้กับหน้า login เพื่อชะลอการเดารหัสผ่าน (Phase 8) โดยนับแยกตาม "IP + อีเมลที่พยายามเข้า"
 * เพื่อไม่ให้การเดารหัสของบัญชีหนึ่งไปปิดกั้นผู้ใช้คนอื่นที่ออกจาก IP เดียวกัน (เช่น NAT ของออฟฟิศ)
 *
 * ข้อจำกัดที่ต้องรู้: เก็บใน process เดียว — ถ้าขยายเป็นหลาย instance ต้องย้ายไปใช้ store ร่วม
 * (เช่น Redis) ส่วนการจำกัดระดับ IP ทั้งหมดทำที่ reverse proxy (nginx `limit_req`) แล้ว
 */

export interface RateLimitDecision {
  allowed: boolean;
  /** จำนวนครั้งที่ใช้ไปในหน้าต่างนี้ */
  hits: number;
  /** วินาทีที่ต้องรอก่อนลองใหม่ (0 = ลองได้ทันที) */
  retryAfterSeconds: number;
}

interface WindowState {
  hits: number;
  /** เวลาที่หน้าต่างนี้จะหมดอายุ (epoch ms) */
  expiresAt: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** นับคำขอหนึ่งครั้งและบอกว่าผ่านหรือไม่ */
  hit(key: string, now = Date.now()): RateLimitDecision {
    this.evictExpired(now);

    const current = this.windows.get(key);
    if (current === undefined || current.expiresAt <= now) {
      this.windows.set(key, { hits: 1, expiresAt: now + this.windowMs });
      return { allowed: true, hits: 1, retryAfterSeconds: 0 };
    }

    current.hits++;
    if (current.hits > this.limit) {
      return {
        allowed: false,
        hits: current.hits,
        retryAfterSeconds: Math.max(1, Math.ceil((current.expiresAt - now) / 1000)),
      };
    }
    return { allowed: true, hits: current.hits, retryAfterSeconds: 0 };
  }

  /** ล้างตัวนับของคีย์นั้น — เรียกเมื่อ login สำเร็จ เพื่อไม่ให้ผู้ใช้ที่ทำถูกถูกกันในภายหลัง */
  reset(key: string): void {
    this.windows.delete(key);
  }

  /** จำนวนคีย์ที่กำลังติดตาม (ใช้ในเทสต์ตรวจว่าไม่รั่ว) */
  size(): number {
    return this.windows.size;
  }

  private evictExpired(now: number): void {
    for (const [key, state] of this.windows) {
      if (state.expiresAt <= now) {
        this.windows.delete(key);
      }
    }
  }
}
