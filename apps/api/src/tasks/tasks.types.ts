import { Prisma } from '@prisma/client';
import type { RiskFields } from '../common/risk-fields';

const ASSIGNEE_SELECT = { select: { id: true, name: true, email: true, role: true } } as const;

/** ข้อมูล cert เท่าที่หน้างาน/board ต้องใช้ + `expiresAt` สำหรับคำนวณความเสี่ยงสด */
const CERTIFICATE_SELECT = {
  select: {
    id: true,
    commonName: true,
    endpoint: true,
    expiresAt: true,
    owner: true,
    issuer: true,
    companyId: true,
    isActive: true,
    company: { select: { id: true, name: true, code: true } },
    site: { select: { id: true, name: true } },
  },
} as const;

export const TASK_LIST_INCLUDE = {
  assignee: ASSIGNEE_SELECT,
  certificate: CERTIFICATE_SELECT,
} satisfies Prisma.RenewalTaskInclude;

export const TASK_DETAIL_INCLUDE = {
  assignee: ASSIGNEE_SELECT,
  certificate: CERTIFICATE_SELECT,
  // ประวัติของงานใบนี้: ใครมอบหมาย ใครเปลี่ยนสถานะ เมื่อไร
  historyLogs: { orderBy: { createdAt: 'desc' } },
} satisfies Prisma.RenewalTaskInclude;

type ListPayload = Prisma.RenewalTaskGetPayload<{ include: typeof TASK_LIST_INCLUDE }>;
type DetailPayload = Prisma.RenewalTaskGetPayload<{ include: typeof TASK_DETAIL_INCLUDE }>;

export type TaskListItem = Omit<ListPayload, 'certificate'> & {
  certificate: ListPayload['certificate'] & RiskFields;
};

export type TaskDetail = Omit<DetailPayload, 'certificate'> & {
  certificate: DetailPayload['certificate'] & RiskFields;
};
