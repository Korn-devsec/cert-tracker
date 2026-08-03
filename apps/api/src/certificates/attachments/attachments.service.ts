/**
 * ไฟล์แนบของ certificate (ใบรับรอง, CSR, เอกสารอนุมัติ)
 *
 * ไฟล์เก็บบนดิสก์ที่ `UPLOAD_DIR` ไม่เก็บลง DB — ในตารางเก็บแค่ path แบบ relative
 * ชื่อไฟล์บนดิสก์เป็น uuid ที่ระบบสร้าง ส่วนชื่อเดิมของผู้ใช้เก็บไว้ในคอลัมน์ `filename`
 * เพื่อส่งคืนตอนดาวน์โหลด (ชื่อจาก client ไม่มีผลต่อ path ที่เขียนจริง)
 */
import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, stat, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  PayloadTooLargeException,
  StreamableFile,
} from '@nestjs/common';
import { Attachment, HistoryAction } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';
import { HistoryService } from '../../history/history.service';
import { PrismaService } from '../../prisma/prisma.service';
import {
  attachmentExtension,
  buildStoredPath,
  checkAttachment,
  contentDisposition,
  decodeUploadFilename,
  resolveStoredPath,
  safeOriginalName,
} from './attachment-file';

@Injectable()
export class AttachmentsService {
  private readonly logger = new Logger(AttachmentsService.name);
  private readonly uploadDir: string;
  private readonly maxBytes: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {
    this.uploadDir = resolve(process.env.UPLOAD_DIR ?? './uploads');
    this.maxBytes = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10) * 1024 * 1024;
  }

  async list(certificateId: string): Promise<Attachment[]> {
    await this.assertCertificate(certificateId);
    return this.prisma.attachment.findMany({
      where: { certificateId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async upload(
    certificateId: string,
    file: Express.Multer.File,
    actor: AuthenticatedUser,
  ): Promise<Attachment> {
    // แก้ชื่อไฟล์ที่ multer ถอดรหัสเป็น latin1 ก่อนใช้งานทุกที่ (ชื่อไฟล์ภาษาไทยจะเพี้ยน)
    const originalName = decodeUploadFilename(file.originalname);

    const check = checkAttachment(originalName);
    if (!check.ok) {
      throw new BadRequestException(check.reason);
    }
    if (file.buffer.length === 0) {
      throw new BadRequestException('ไฟล์ว่าง');
    }
    if (file.buffer.length > this.maxBytes) {
      throw new PayloadTooLargeException(
        `ไฟล์ใหญ่เกิน ${Math.round(this.maxBytes / 1024 / 1024)} MB`,
      );
    }

    const certificate = await this.assertCertificate(certificateId);
    const filename = safeOriginalName(originalName);
    const storedPath = buildStoredPath(
      certificateId,
      randomUUID(),
      attachmentExtension(originalName),
    );
    const absolutePath = resolveStoredPath(this.uploadDir, storedPath);

    await mkdir(dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, file.buffer);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const attachment = await tx.attachment.create({
          data: {
            certificateId,
            filename,
            path: storedPath,
            mimeType: file.mimetype,
            sizeBytes: file.buffer.length,
            uploadedBy: actor.email,
          },
        });

        await this.history.writeWithin(tx, {
          action: HistoryAction.ATTACHMENT_UPLOADED,
          actor: actor.email,
          actorId: actor.id,
          certificateId,
          companyId: certificate.companyId,
          detail: `แนบไฟล์ ${filename} (${file.buffer.length} ไบต์)`,
          metadata: { attachmentId: attachment.id, mimeType: file.mimetype },
        });

        return attachment;
      });
    } catch (error) {
      // เขียนไฟล์สำเร็จแต่บันทึก DB ไม่สำเร็จ → ลบไฟล์ทิ้ง ไม่ปล่อยให้เป็นไฟล์กำพร้า
      await unlink(absolutePath).catch((cleanupError: unknown) => {
        this.logger.warn(`ลบไฟล์กำพร้าไม่สำเร็จ ${absolutePath}: ${String(cleanupError)}`);
      });
      throw error;
    }
  }

  async download(
    certificateId: string,
    attachmentId: string,
  ): Promise<{ file: StreamableFile; attachment: Attachment }> {
    const attachment = await this.prisma.attachment.findFirst({
      where: { id: attachmentId, certificateId },
    });
    if (attachment === null) {
      throw new NotFoundException(`ไม่พบไฟล์แนบ id ${attachmentId} ของ certificate นี้`);
    }

    const absolutePath = resolveStoredPath(this.uploadDir, attachment.path);
    const stats = await stat(absolutePath).catch(() => null);
    if (stats === null) {
      throw new NotFoundException(
        `ไฟล์ ${attachment.filename} หายไปจากที่เก็บ (${attachment.path}) — ตรวจค่า UPLOAD_DIR`,
      );
    }

    return {
      attachment,
      file: new StreamableFile(createReadStream(absolutePath), {
        type: attachment.mimeType ?? 'application/octet-stream',
        disposition: contentDisposition(attachment.filename),
        length: stats.size,
      }),
    };
  }

  private async assertCertificate(certificateId: string): Promise<{ companyId: string }> {
    const certificate = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: { companyId: true },
    });
    if (certificate === null) {
      throw new NotFoundException(`ไม่พบ certificate id ${certificateId}`);
    }
    return certificate;
  }
}
