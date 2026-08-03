/**
 * แปลงตัวกรองที่ผู้ใช้ส่งมา (เดือน / ระดับความเสี่ยง / หมดอายุแล้ว) ให้เป็นเงื่อนไขช่วงวันของ
 * `Certificate.expiresAt` — เพื่อให้กรองและแบ่งหน้าในฐานข้อมูลได้ ไม่ต้องดึงทุกแถวมากรองใน JS
 *
 * ช่วงทั้งหมดเป็นแบบครึ่งเปิด `[gte, lt)` และคำนวณจาก `packages/shared` ที่เดียว
 * (ห้ามเขียนเกณฑ์ 30/60/90 ซ้ำที่นี่ ไม่งั้นวันหนึ่งจะเพี้ยนไม่ตรงกับ calculateRisk)
 */
import type { ExpiryWindow } from '@cert-tracker/shared';

/** รูปแบบเดือนที่รับ: `YYYY-MM` (ค.ศ.) — การแสดงเป็น พ.ศ. เป็นหน้าที่ของ frontend */
export const MONTH_PATTERN = /^\d{4}-(?:0[1-9]|1[0-2])$/;

/** ช่วงวันหมดอายุของเดือนนั้น (ฐาน UTC เหมือนที่เก็บใน DB) */
export function monthExpiryWindow(month: string): ExpiryWindow {
  const [year, monthNumber] = month.split('-').map(Number);
  return {
    gte: new Date(Date.UTC(year, monthNumber - 1, 1)),
    lt: new Date(Date.UTC(year, monthNumber, 1)),
  };
}

export interface DateRangeFilter {
  gte?: Date;
  lt?: Date;
}

/**
 * ตัดกันหลายช่วงเป็นช่วงเดียว (เอาขอบซ้ายที่มากสุด ขอบขวาที่น้อยสุด)
 *
 * ถ้าเงื่อนไขขัดกันเอง เช่น เดือน ก.ค. + ความเสี่ยง SAFE ในเดือนที่ไม่มีวันไหนเป็น SAFE
 * ผลลัพธ์จะเป็นช่วงว่าง → query คืน 0 แถว ซึ่งเป็นคำตอบที่ถูกต้องแล้ว (ไม่ใช่ error)
 */
export function intersectExpiryWindows(windows: ExpiryWindow[]): DateRangeFilter | undefined {
  let gte: Date | null = null;
  let lt: Date | null = null;

  for (const window of windows) {
    if (window.gte !== null && (gte === null || window.gte.getTime() > gte.getTime())) {
      gte = window.gte;
    }
    if (window.lt !== null && (lt === null || window.lt.getTime() < lt.getTime())) {
      lt = window.lt;
    }
  }

  if (gte === null && lt === null) {
    return undefined;
  }
  return {
    ...(gte === null ? {} : { gte }),
    ...(lt === null ? {} : { lt }),
  };
}
