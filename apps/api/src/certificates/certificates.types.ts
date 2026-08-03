import { Prisma } from '@prisma/client';
import type { RiskFields } from '../common/risk-fields';

/** จำนวนประวัติที่ส่งไปกับหน้า detail — พอสำหรับ timeline ไม่ต้องดึงทั้งหมด */
export const MAX_HISTORY_ENTRIES = 200;

const ASSIGNEE_SELECT = { select: { id: true, name: true, email: true, role: true } } as const;

export const CERTIFICATE_LIST_INCLUDE = {
  company: { select: { id: true, name: true, code: true } },
  site: { select: { id: true, name: true } },
  // ดึงมาแค่ task ล่าสุด = สถานะงานปัจจุบันของ cert ใบนี้
  renewalTasks: {
    orderBy: { createdAt: 'desc' },
    take: 1,
    include: { assignee: ASSIGNEE_SELECT },
  },
} satisfies Prisma.CertificateInclude;

export const CERTIFICATE_DETAIL_INCLUDE = {
  company: { select: { id: true, name: true, code: true, contactEmail: true } },
  site: { select: { id: true, name: true } },
  renewalTasks: {
    orderBy: { createdAt: 'desc' },
    include: { assignee: ASSIGNEE_SELECT },
  },
  attachments: { orderBy: { createdAt: 'desc' } },
  historyLogs: { orderBy: { createdAt: 'desc' }, take: MAX_HISTORY_ENTRIES },
} satisfies Prisma.CertificateInclude;

type ListPayload = Prisma.CertificateGetPayload<{ include: typeof CERTIFICATE_LIST_INCLUDE }>;
type DetailPayload = Prisma.CertificateGetPayload<{ include: typeof CERTIFICATE_DETAIL_INCLUDE }>;

export type CurrentTaskView = ListPayload['renewalTasks'][number];

/** 1 แถวในตารางรายการ cert — มี risk ที่คำนวณสด และสถานะงานปัจจุบัน */
export type CertificateListItem = Omit<ListPayload, 'renewalTasks'> &
  RiskFields & {
    currentTask: CurrentTaskView | null;
  };

/** หน้า Certificate Detail: ข้อมูลเทคนิคครบ + งานต่ออายุทุกรอบ + ประวัติ + ไฟล์แนบ */
export type CertificateDetail = DetailPayload &
  RiskFields & {
    currentTask: DetailPayload['renewalTasks'][number] | null;
  };
