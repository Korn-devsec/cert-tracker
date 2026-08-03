/**
 * การแบ่งหน้าแบบเดียวกันทุก endpoint ที่คืนรายการยาว (certificates, tasks)
 * รูปแบบ response: `{ data, meta }` เพื่อให้ frontend รู้จำนวนทั้งหมดไปทำตัวเลขหน้าได้
 *
 * ไฟล์นี้เป็นฟังก์ชันล้วน — คลาส DTO ที่มี decorator อยู่ใน `dto/pagination-query.dto.ts`
 * (decorator ต้องมี reflect-metadata ซึ่งจะลากทั้ง Nest runtime เข้ามาในเทสต์ของตัวช่วยเล็กๆ)
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 200;

/** ส่วนของ query ที่เกี่ยวกับการแบ่งหน้า — `PaginationQueryDto` implements ตัวนี้ */
export interface PaginationInput {
  page?: number;
  pageSize?: number;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  /** เวลาที่ใช้เป็นฐานคำนวณ daysUntilExpiry/riskLevel ของชุดข้อมูลนี้ */
  asOf: string;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

/** แปลง page/pageSize เป็น skip/take ของ Prisma */
export function paginationArgs(query: PaginationInput): {
  page: number;
  pageSize: number;
  skip: number;
  take: number;
} {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE);
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function buildMeta(
  args: { page: number; pageSize: number },
  total: number,
  asOf: Date,
): PageMeta {
  return {
    page: args.page,
    pageSize: args.pageSize,
    total,
    totalPages: total === 0 ? 0 : Math.ceil(total / args.pageSize),
    asOf: asOf.toISOString(),
  };
}
