/**
 * "task ปัจจุบัน" ของ certificate — นิยามกลางของระบบ
 *
 * certificate หนึ่งใบมี RenewalTask ได้หลายใบตามรอบการต่ออายุ (รอบที่แล้ว COMPLETED
 * รอบใหม่ NEW) ดังนั้นสถานะงานของ cert = task **ล่าสุด** เท่านั้น
 * ห้ามใช้ `renewalTasks: { some: { status } }` ของ Prisma แทน เพราะนั่นหมายถึง
 * "เคยมี task สถานะนี้" ซึ่งจะทำให้ cert ที่ต่ออายุรอบใหม่แล้วยังถูกนับเป็น "เรียบร้อยแล้ว"
 *
 * ใช้ `DISTINCT ON` ของ PostgreSQL ซึ่งเป็นวิธีที่ index `(certificateId, status)` รองรับได้
 * และให้ผลแถวเดียวต่อ cert เสมอ (Prisma query builder ยังทำ correlated subquery แบบนี้ไม่ได้)
 */
import { Prisma, WorkStatus } from '@prisma/client';

export interface CurrentTaskRow {
  certificateId: string;
  taskId: string;
  status: WorkStatus;
  assigneeId: string | null;
}

/** subquery: 1 แถวต่อ 1 certificate = task ที่สร้างล่าสุด */
export const CURRENT_TASK_SQL = Prisma.sql`
  SELECT DISTINCT ON (t."certificateId")
         t."certificateId" AS "certificateId",
         t."id"            AS "taskId",
         t."status"        AS "status",
         t."assigneeId"    AS "assigneeId"
  FROM "RenewalTask" t
  ORDER BY t."certificateId", t."createdAt" DESC, t."id" DESC
`;

/**
 * id ของ certificate ที่ **task ปัจจุบัน** มีสถานะตามที่ระบุ
 * (เทียบสถานะแบบ cast เป็น text เพื่อไม่ต้องอ้างชื่อ enum type ใน SQL)
 */
export function certificateIdsByCurrentStatusSql(
  status: WorkStatus,
  companyId?: string,
): Prisma.Sql {
  // คอลัมน์ id ของ Prisma เป็น `text` (ไม่ใช่ `uuid`) จึงเทียบกับ parameter ได้ตรงๆ ห้าม cast เป็น uuid
  const companyFilter =
    companyId === undefined ? Prisma.empty : Prisma.sql`AND c."companyId" = ${companyId}`;

  return Prisma.sql`
    SELECT cur."certificateId" AS "certificateId"
    FROM (${CURRENT_TASK_SQL}) cur
    JOIN "Certificate" c ON c."id" = cur."certificateId"
    WHERE cur."status"::text = ${status}
    ${companyFilter}
  `;
}

/** รวมเงื่อนไขเป็น `WHERE a AND b` — คืน Prisma.empty เมื่อไม่มีเงื่อนไขเลย */
export function andWhere(conditions: Prisma.Sql[]): Prisma.Sql {
  if (conditions.length === 0) {
    return Prisma.empty;
  }
  return Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}`;
}
