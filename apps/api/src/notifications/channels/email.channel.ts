/**
 * ช่องทางอีเมล (nodemailer + SMTP จาก .env)
 *
 * ผู้รับ = `Company.contactEmail` เพราะคอลัมน์ `Certificate.owner` ในไฟล์จริงเป็นชื่อทีม
 * (เช่น "IT Sec") ไม่ใช่อีเมล · ตั้ง `MAIL_TO_FALLBACK` ไว้รับกรณีบริษัทยังไม่ได้กรอกอีเมล
 *
 * ถ้าไม่ได้ตั้ง SMTP_HOST หรืออยู่ในโหมดซ้อม (`NOTIFICATION_DRY_RUN=true`)
 * จะเขียนลง log แทนการส่งจริง และรายงาน mode = `console` กลับไป
 */
import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannel } from '@prisma/client';
import { createTransport, type Transporter } from 'nodemailer';
import {
  isSimulateMode,
  type NotificationChannelAdapter,
  type NotificationMessage,
  type RecipientContext,
  type SendResult,
} from './notification-channel';

@Injectable()
export class EmailChannel implements NotificationChannelAdapter {
  readonly channel = NotificationChannel.EMAIL;

  private readonly logger = new Logger(EmailChannel.name);
  private transporter: Transporter | null = null;

  resolveRecipient(context: RecipientContext): string | null {
    const fallback = process.env.MAIL_TO_FALLBACK?.trim();
    const recipient = context.companyContactEmail?.trim();
    if (recipient !== undefined && recipient.length > 0) {
      return recipient;
    }
    return fallback !== undefined && fallback.length > 0 ? fallback : null;
  }

  async send(message: NotificationMessage, recipient: string): Promise<SendResult> {
    const host = process.env.SMTP_HOST?.trim() ?? '';

    if (isSimulateMode() || host.length === 0) {
      this.logger.log(
        `[ซ้อมส่ง EMAIL] ถึง ${recipient} · ${message.subject}\n${indent(message.text)}`,
      );
      return { mode: 'console', recipient };
    }

    await this.getTransporter(host).sendMail({
      from: process.env.MAIL_FROM ?? 'cert-tracker@example.com',
      to: recipient,
      subject: message.subject,
      text: message.text,
    });
    this.logger.log(`ส่งอีเมลถึง ${recipient} แล้ว · ${message.subject}`);
    return { mode: 'live', recipient };
  }

  /** สร้าง transporter ครั้งเดียวเมื่อใช้จริง (ไม่ต่อ SMTP ตอน boot เพราะ dev ไม่มีเซิร์ฟเวอร์) */
  private getTransporter(host: string): Transporter {
    if (this.transporter === null) {
      const port = Number(process.env.SMTP_PORT ?? 587);
      const user = process.env.SMTP_USER?.trim();
      const pass = process.env.SMTP_PASSWORD;
      this.transporter = createTransport({
        host,
        port,
        // 465 = SMTPS (TLS ตั้งแต่เริ่มเชื่อมต่อ) ส่วนพอร์ตอื่นใช้ STARTTLS
        secure: port === 465,
        auth: user !== undefined && user.length > 0 ? { user, pass } : undefined,
      });
    }
    return this.transporter;
  }
}

function indent(text: string): string {
  return text
    .split('\n')
    .map((line) => `    ${line}`)
    .join('\n');
}
