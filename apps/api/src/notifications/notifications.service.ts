/**
 * Notification Service — สแกน certificate แล้วแจ้งเตือนแบบขั้นบันได (กฎเหล็กข้อ 7)
 *
 * สิ่งที่ต้องไม่พลาด:
 *  - **idempotent**: รันซ้ำวันเดียวกันต้องไม่ส่งซ้ำ · ขั้น 90/60/30 ส่งครั้งเดียวต่อใบ
 *    ขั้น ≤7 วันส่งได้วันละครั้ง (ตัวกันซ้ำจริงคือ unique key ของ NotificationLog)
 *  - cert ที่งานต่ออายุเสร็จแล้ว (task ล่าสุด = COMPLETED) ไม่ต้องแจ้งต่อ
 *  - ส่งไม่สำเร็จต้องบันทึกไว้ (`isSuccess = false`) แต่**ห้ามกันการส่งรอบถัดไป**
 *    ไม่งั้น SMTP ล่มวันเดียวจะทำให้ใบนั้นเงียบไปตลอด
 */
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  HistoryAction,
  NotificationChannel,
  NotificationTier,
  Prisma,
  WorkStatus,
} from '@prisma/client';
import {
  calculateDaysUntilExpiry,
  calculateRisk,
  expiryWindowForDayRange,
  startOfUtcDay,
} from '@cert-tracker/shared';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  isSimulateMode,
  NOTIFICATION_CHANNELS,
  type NotificationChannelAdapter,
} from './channels/notification-channel';
import { buildNotificationMessage } from './message';
import {
  emptyChannelCounts,
  emptyTierCounts,
  type CertificateNotification,
  type ChannelOutcome,
  type NotificationRunResult,
} from './notifications.types';
import { NOTIFICATION_HORIZON_DAYS, tierChannels, tierForDays, tierIsDaily } from './tier-policy';

export interface RunOptions {
  trigger: 'cron' | 'manual';
  /** ดูผลล่วงหน้า: ไม่ส่งและไม่บันทึกอะไรเลย */
  preview?: boolean;
  companyId?: string;
  /** ผู้สั่งรัน — ใช้เป็น actor ใน HistoryLog (cron ใช้ `system`) */
  actor?: string;
  actorId?: string;
  /** ใช้ในเทสต์เพื่อกำหนดเวลาอ้างอิงให้ผลลัพธ์นิ่ง */
  now?: Date;
}

const SYSTEM_ACTOR = 'system';

/** cert ที่ดึงมาพิจารณา + ข้อมูลที่ต้องใช้ประกอบข้อความ */
const SCAN_INCLUDE = {
  company: { select: { id: true, name: true, code: true, contactEmail: true } },
  renewalTasks: { orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, status: true } },
} satisfies Prisma.CertificateInclude;

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  /** กันการรันทับกันระหว่าง cron กับ test-run (ตัวกันซ้ำจริงยังเป็น unique key ใน DB) */
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannelAdapter[],
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  async run(options: RunOptions): Promise<NotificationRunResult> {
    const now = options.now ?? new Date();
    const preview = options.preview ?? false;
    const startedAt = new Date();

    if (options.companyId !== undefined) {
      const company = await this.prisma.company.findUnique({
        where: { id: options.companyId },
        select: { id: true },
      });
      if (company === null) {
        throw new NotFoundException(`ไม่พบบริษัท id ${options.companyId}`);
      }
    }

    this.running = true;
    try {
      return await this.scanAndSend(options, now, startedAt, preview);
    } finally {
      this.running = false;
    }
  }

  private async scanAndSend(
    options: RunOptions,
    now: Date,
    startedAt: Date,
    preview: boolean,
  ): Promise<NotificationRunResult> {
    const result: NotificationRunResult = {
      startedAt: startedAt.toISOString(),
      finishedAt: startedAt.toISOString(),
      trigger: options.trigger,
      preview,
      simulate: isSimulateMode(),
      companyId: options.companyId ?? null,
      scanned: 0,
      notified: 0,
      sent: 0,
      failed: 0,
      skippedCompleted: 0,
      skippedAlreadySent: 0,
      skippedNoRecipient: 0,
      byTier: emptyTierCounts(),
      byChannel: emptyChannelCounts(),
      certificates: [],
    };

    const candidates = await this.findCandidates(options, now);
    result.scanned = candidates.length;
    if (candidates.length === 0) {
      result.finishedAt = new Date().toISOString();
      return result;
    }

    const sentBefore = await this.loadSuccessfulLogs(candidates.map((cert) => cert.id));
    const today = startOfUtcDay(now);

    for (const certificate of candidates) {
      const daysUntilExpiry = calculateDaysUntilExpiry(certificate.expiresAt, now);
      const tier = tierForDays(daysUntilExpiry);
      if (tier === null) {
        continue; // เกินขอบเขต (ปกติถูกกรองใน query แล้ว — กันกรณีข้อมูลเปลี่ยนระหว่างรัน)
      }

      const currentTask = certificate.renewalTasks[0] ?? null;
      if (currentTask?.status === WorkStatus.COMPLETED) {
        // ต่ออายุเสร็จแล้ว ใบเก่ายังไม่หมดอายุก็ไม่ต้องทวงอีก
        result.skippedCompleted++;
        continue;
      }

      const message = buildNotificationMessage({
        commonName: certificate.commonName,
        endpoint: certificate.endpoint,
        owner: certificate.owner,
        issuer: certificate.issuer,
        companyName: certificate.company.name,
        companyCode: certificate.company.code,
        expiresAt: certificate.expiresAt,
        daysUntilExpiry,
        riskLevel: calculateRisk(daysUntilExpiry),
        tier,
        workStatus: currentTask?.status ?? null,
      });

      const outcomes: ChannelOutcome[] = [];
      for (const channel of tierChannels(tier)) {
        const adapter = this.channels.find((item) => item.channel === channel);
        if (adapter === undefined) {
          outcomes.push({
            channel,
            status: 'skipped',
            reason: `ยังไม่มี adapter ของช่องทาง ${channel}`,
          });
          continue;
        }

        const outcome = await this.sendOnChannel({
          adapter,
          certificate,
          tier,
          message,
          sentBefore: sentBefore.get(logKey(certificate.id, tier, channel)) ?? [],
          today,
          preview,
          result,
        });
        outcomes.push(outcome);
      }

      const attempted = outcomes.filter((outcome) => outcome.status !== 'skipped');
      if (attempted.length === 0) {
        continue; // ทุกช่องทางถูกข้าม → ไม่นับเป็นการแจ้งเตือน
      }

      result.notified++;
      result.byTier[tier]++;

      const certificateResult: CertificateNotification = {
        certificateId: certificate.id,
        commonName: certificate.commonName,
        endpoint: certificate.endpoint,
        companyCode: certificate.company.code,
        daysUntilExpiry,
        tier,
        channels: outcomes,
      };
      result.certificates.push(certificateResult);

      const delivered = outcomes.filter((outcome) => outcome.status === 'sent');
      if (!preview && delivered.length > 0) {
        await this.writeHistory(certificate, tier, delivered, daysUntilExpiry, options);
      }
    }

    result.finishedAt = new Date().toISOString();
    this.logger.log(
      `แจ้งเตือน (${options.trigger}${preview ? ', preview' : ''}): สแกน ${result.scanned} ` +
        `ส่ง ${result.sent} ล้มเหลว ${result.failed} ` +
        `ข้าม(เสร็จแล้ว) ${result.skippedCompleted} ข้าม(ส่งแล้ว) ${result.skippedAlreadySent}`,
    );
    return result;
  }

  /** cert ที่ยังใช้งาน ของบริษัทที่ยังใช้งาน และเหลือไม่เกิน 90 วัน (รวมที่หมดอายุแล้ว) */
  private async findCandidates(
    options: RunOptions,
    now: Date,
  ): Promise<Array<Prisma.CertificateGetPayload<{ include: typeof SCAN_INCLUDE }>>> {
    const horizon = expiryWindowForDayRange(null, NOTIFICATION_HORIZON_DAYS, now).lt;
    const where: Prisma.CertificateWhereInput = {
      isActive: true,
      // บริษัทที่ถูกปิดใช้งาน (soft delete) ไม่ต้องแจ้งเตือนอีก
      company: { isActive: true },
      ...(horizon === null ? {} : { expiresAt: { lt: horizon } }),
      ...(options.companyId === undefined ? {} : { companyId: options.companyId }),
    };

    return this.prisma.certificate.findMany({
      where,
      include: SCAN_INCLUDE,
      orderBy: { expiresAt: 'asc' },
    });
  }

  /**
   * โหลดประวัติการส่งที่ **สำเร็จ** ของ cert ชุดนี้มาไว้ในหน่วยความจำครั้งเดียว
   * (แถวที่ล้มเหลวไม่นับ เพื่อให้รอบถัดไปยังพยายามส่งอีก)
   */
  private async loadSuccessfulLogs(certificateIds: string[]): Promise<Map<string, Date[]>> {
    const logs = await this.prisma.notificationLog.findMany({
      where: { certificateId: { in: certificateIds }, isSuccess: true },
      select: { certificateId: true, tier: true, channel: true, sentOn: true },
    });

    const map = new Map<string, Date[]>();
    for (const log of logs) {
      const key = logKey(log.certificateId, log.tier, log.channel);
      const dates = map.get(key);
      if (dates === undefined) {
        map.set(key, [log.sentOn]);
      } else {
        dates.push(log.sentOn);
      }
    }
    return map;
  }

  private async sendOnChannel(input: {
    adapter: NotificationChannelAdapter;
    certificate: Prisma.CertificateGetPayload<{ include: typeof SCAN_INCLUDE }>;
    tier: NotificationTier;
    message: ReturnType<typeof buildNotificationMessage>;
    sentBefore: Date[];
    today: Date;
    preview: boolean;
    result: NotificationRunResult;
  }): Promise<ChannelOutcome> {
    const { adapter, certificate, tier, message, sentBefore, today, preview, result } = input;
    const channel = adapter.channel;

    if (tierIsDaily(tier)) {
      // ขั้นวิกฤต: แจ้งได้วันละครั้ง
      if (sentBefore.some((date) => date.getTime() === today.getTime())) {
        result.skippedAlreadySent++;
        return { channel, status: 'skipped', reason: 'แจ้งไปแล้ววันนี้' };
      }
    } else if (sentBefore.length > 0) {
      // ขั้น 90/60/30: แจ้งครั้งเดียวต่อใบรับรอง
      result.skippedAlreadySent++;
      return { channel, status: 'skipped', reason: 'แจ้งขั้นนี้ไปแล้ว' };
    }

    const recipient = adapter.resolveRecipient({
      companyCode: certificate.company.code,
      companyName: certificate.company.name,
      companyContactEmail: certificate.company.contactEmail,
    });
    if (recipient === null) {
      // ไม่บันทึกลง NotificationLog เพื่อให้รอบถัดไปส่งได้ทันทีที่กรอกปลายทางแล้ว
      result.skippedNoRecipient++;
      return { channel, status: 'skipped', reason: 'ไม่มีปลายทางของช่องทางนี้' };
    }

    if (preview) {
      // นับเป็น "จะส่ง" เพื่อให้ตัวเลขในรายงานอ่านได้ — ตัว preview:true บอกอยู่แล้วว่าไม่ได้ส่งจริง
      result.sent++;
      result.byChannel[channel]++;
      return {
        channel,
        status: 'sent',
        mode: 'console',
        recipient,
        reason: 'preview — ไม่ได้ส่งจริง',
      };
    }

    // ลำดับ: ส่งก่อน แล้วจึงบันทึก log — ถ้าพังกลางทางรอบถัดไปจะส่งซ้ำ
    // ซึ่งดีกว่าการบันทึกก่อนส่งแล้วเงียบหายไปทั้งใบเมื่อการส่งล้มเหลว
    try {
      const sendResult = await adapter.send(message, recipient);
      await this.recordLog(certificate.id, tier, channel, today, recipient, null);
      result.sent++;
      result.byChannel[channel]++;
      return { channel, status: 'sent', mode: sendResult.mode, recipient: sendResult.recipient };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`ส่ง ${channel} ของ ${certificate.commonName} ไม่สำเร็จ: ${reason}`);
      await this.recordLog(certificate.id, tier, channel, today, recipient, reason);
      result.failed++;
      return { channel, status: 'failed', recipient, reason };
    }
  }

  /**
   * บันทึกผลการส่ง — ใช้ upsert บน unique key `(certificateId, tier, channel, sentOn)`
   * เพราะการลองส่งซ้ำในวันเดียวกัน (เช่นครั้งก่อนล้มเหลว) ต้องอัปเดตแถวเดิม ไม่ใช่ชนคีย์
   */
  private async recordLog(
    certificateId: string,
    tier: NotificationTier,
    channel: NotificationChannel,
    sentOn: Date,
    recipient: string,
    error: string | null,
  ): Promise<void> {
    const data = {
      recipient,
      isSuccess: error === null,
      error,
      sentAt: new Date(),
    };
    await this.prisma.notificationLog.upsert({
      where: {
        certificateId_tier_channel_sentOn: { certificateId, tier, channel, sentOn },
      },
      create: { certificateId, tier, channel, sentOn, ...data },
      update: data,
    });
  }

  /** ประวัติระดับ certificate — 1 บรรทัดต่อการแจ้งเตือนหนึ่งครั้ง ไม่ใช่ต่อช่องทาง */
  private async writeHistory(
    certificate: Prisma.CertificateGetPayload<{ include: typeof SCAN_INCLUDE }>,
    tier: NotificationTier,
    delivered: ChannelOutcome[],
    daysUntilExpiry: number,
    options: RunOptions,
  ): Promise<void> {
    const channels = delivered.map((outcome) => outcome.channel);
    await this.history.write({
      action: HistoryAction.NOTIFICATION_SENT,
      actor: options.actor ?? SYSTEM_ACTOR,
      actorId: options.actorId,
      certificateId: certificate.id,
      companyId: certificate.companyId,
      detail:
        `แจ้งเตือน ${tier} ทาง ${channels.join(', ')} — ` +
        `${certificate.commonName} เหลือ ${daysUntilExpiry} วัน`,
      metadata: {
        tier,
        channels,
        daysUntilExpiry,
        trigger: options.trigger,
        simulated: delivered.every((outcome) => outcome.mode === 'console'),
      },
    });
  }
}

function logKey(
  certificateId: string,
  tier: NotificationTier,
  channel: NotificationChannel,
): string {
  return `${certificateId}|${tier}|${channel}`;
}
