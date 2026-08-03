/**
 * enum ใน Prisma schema ต้องมีค่าตรงกับ enum ใน packages/shared เสมอ
 * ถ้าใครแก้ฝั่งเดียว test นี้จะพัง — กันข้อมูลใน DB เพี้ยนจาก type ที่ frontend ใช้
 */
import {
  HistoryAction as PrismaHistoryAction,
  ImportStatus as PrismaImportStatus,
  NotificationChannel as PrismaNotificationChannel,
  NotificationTier as PrismaNotificationTier,
  UserRole as PrismaUserRole,
  WorkStatus as PrismaWorkStatus,
} from '@prisma/client';
import {
  HistoryAction,
  ImportStatus,
  NotificationChannel,
  NotificationTier,
  UserRole,
  WorkStatus,
} from '@cert-tracker/shared';

describe('Prisma enums ตรงกับ @cert-tracker/shared', () => {
  it.each([
    ['WorkStatus', WorkStatus, PrismaWorkStatus],
    ['HistoryAction', HistoryAction, PrismaHistoryAction],
    ['NotificationTier', NotificationTier, PrismaNotificationTier],
    ['NotificationChannel', NotificationChannel, PrismaNotificationChannel],
    ['UserRole', UserRole, PrismaUserRole],
    ['ImportStatus', ImportStatus, PrismaImportStatus],
  ])('%s', (_name, sharedEnum, prismaEnum) => {
    expect(Object.values(prismaEnum).sort()).toEqual(Object.values(sharedEnum).sort());
  });
});
