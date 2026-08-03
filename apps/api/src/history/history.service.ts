/**
 * จุดเดียวของระบบสำหรับเขียน HistoryLog (กฎเหล็กข้อ 6)
 * ทุก action สำคัญต้องผ่านที่นี่ เพื่อให้ actor/timestamp/detail ครบเสมอ
 */
import { Injectable } from '@nestjs/common';
import { HistoryAction, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface WriteHistoryInput {
  action: HistoryAction;
  /** ชื่อ/อีเมลผู้ทำ — เก็บเป็น text เพื่อให้อ่านได้แม้บัญชีถูกปิด */
  actor: string;
  actorId?: string;
  detail?: string;
  metadata?: Prisma.InputJsonValue;
  certificateId?: string;
  companyId?: string;
  renewalTaskId?: string;
}

@Injectable()
export class HistoryService {
  constructor(private readonly prisma: PrismaService) {}

  async write(input: WriteHistoryInput): Promise<void> {
    await this.prisma.historyLog.create({
      data: {
        action: input.action,
        actor: input.actor,
        actorId: input.actorId ?? null,
        detail: input.detail ?? null,
        metadata: input.metadata,
        certificateId: input.certificateId ?? null,
        companyId: input.companyId ?? null,
        renewalTaskId: input.renewalTaskId ?? null,
      },
    });
  }

  /**
   * เขียน history ภายใน transaction เดียวกับ mutation
   * ใช้เมื่อไม่อยากให้เกิดกรณี "แก้ข้อมูลสำเร็จแต่ประวัติหาย"
   */
  async writeWithin(tx: Prisma.TransactionClient, input: WriteHistoryInput): Promise<void> {
    await tx.historyLog.create({
      data: {
        action: input.action,
        actor: input.actor,
        actorId: input.actorId ?? null,
        detail: input.detail ?? null,
        metadata: input.metadata,
        certificateId: input.certificateId ?? null,
        companyId: input.companyId ?? null,
        renewalTaskId: input.renewalTaskId ?? null,
      },
    });
  }
}
