/**
 * Excel Import Service — หัวใจของระบบ
 *
 * ลำดับการทำงาน: อ่านไฟล์ → เลือก sheet → หาแถว header → map header → parse แถว
 * → ตัดซ้ำ → validate → upsert + ImportBatch + HistoryLog + RenewalTask (transaction เดียว)
 *
 * กฎที่ต้องไม่พลาด:
 *  - อ่านจากชื่อ header เท่านั้น (ห้ามอ้างตำแหน่งคอลัมน์)
 *  - header ที่จำเป็นหาย → reject ทั้งไฟล์ ห้าม import บางส่วนแบบเงียบๆ
 *  - ทุก cert ผูก companyId ที่ผู้ใช้เลือก ไม่อ่านชื่อบริษัทจากไฟล์
 */
import { BadRequestException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Certificate, HistoryAction, ImportStatus, Prisma, WorkStatus } from '@prisma/client';
import { calculateDaysUntilExpiry, calculateRisk, RiskLevel } from '@cert-tracker/shared';
import type { Workbook, Worksheet } from 'exceljs';
import { AuthenticatedUser } from '../auth/auth.types';
import { HistoryService } from '../history/history.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateImportDto } from './dto/create-import.dto';
import { acceptedHeadersFor, mapHeaders } from './excel/header-mapping';
import { loadWorkbookFromBuffer } from './excel/load-workbook';
import {
  dedupeRows,
  parseSheet,
  type ParsedCertificateRow,
  type RowIssue,
} from './excel/row-parser';
import { findHeaderRow, inspectWorkbook, readRowValues } from './excel/sheet-inspector';
import type { ImportPreviewRow, ImportResult, InspectResult } from './imports.types';
// นิยาม "งานที่ยังค้าง" อยู่ที่เดียวกับกฎ workflow (Phase 4) เพื่อไม่ให้สองที่หลุดจากกัน
import { OPEN_TASK_STATUSES } from '../tasks/transitions';

const MAX_PREVIEW_ROWS = 100;

@Injectable()
export class ImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly history: HistoryService,
  ) {}

  /** สำรวจไฟล์: มี sheet อะไร header อยู่แถวไหน sheet ไหน import ได้ */
  async inspect(buffer: Buffer, filename: string): Promise<InspectResult> {
    const workbook = await this.readWorkbook(buffer);
    const inspection = inspectWorkbook(workbook);
    return { filename, ...inspection };
  }

  async import(
    buffer: Buffer,
    filename: string,
    dto: CreateImportDto,
    actor: AuthenticatedUser,
  ): Promise<ImportResult> {
    const strict = dto.strict ?? true;
    const dryRun = dto.dryRun ?? false;

    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (company === null) {
      throw new NotFoundException(`ไม่พบบริษัท id ${dto.companyId}`);
    }
    if (!company.isActive) {
      throw new BadRequestException(
        `บริษัท ${company.code} ถูกปิดใช้งานอยู่ — เปิดใช้งานก่อนจึงจะ import ได้`,
      );
    }

    const workbook = await this.readWorkbook(buffer);
    const worksheet = this.resolveWorksheet(workbook, dto.sheetName);

    const headerRow = findHeaderRow(worksheet);
    if (headerRow === null) {
      throw new BadRequestException(
        `sheet "${worksheet.name}" ไม่มีแถว header ที่ระบบรู้จัก — ` +
          'ตรวจว่าเลือก sheet ถูกต้อง (sheet หน้าปกไม่มีข้อมูล certificate)',
      );
    }

    const mapping = mapHeaders(readRowValues(worksheet, headerRow));

    // header ที่จำเป็นหาย → reject ทั้งไฟล์ พร้อมบอกชื่อคอลัมน์ที่ระบบยอมรับ
    if (mapping.missingRequired.length > 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'ไฟล์ขาดคอลัมน์ที่จำเป็น จึง import ไม่ได้ทั้งไฟล์',
        sheetName: worksheet.name,
        headerRow,
        missingColumns: mapping.missingRequired,
        acceptedHeaders: {
          commonName: acceptedHeadersFor('commonName'),
          expiresAt: acceptedHeadersFor('expiresAt'),
          daysUntilExpiry: acceptedHeadersFor('daysUntilExpiry'),
        },
        headersFound: readRowValues(worksheet, headerRow).filter((value) => value !== null),
      });
    }

    const now = new Date();
    const parsed = parseSheet(worksheet, {
      headerRow,
      columns: mapping.columns,
      referenceDate: now,
    });
    const deduped = dedupeRows(parsed.rows);

    const warnings: RowIssue[] = [
      ...this.headerWarnings(mapping),
      ...parsed.warnings,
      ...deduped.warnings,
    ];
    const errors = parsed.errors;

    if (strict && errors.length > 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message:
          `พบข้อมูลผิดพลาด ${errors.length} แถว — โหมด strict จึงไม่บันทึกทั้งไฟล์ ` +
          '(ส่ง strict=false เพื่อบันทึกเฉพาะแถวที่ใช้ได้)',
        sheetName: worksheet.name,
        headerRow,
        errors,
        warnings,
      });
    }

    if (deduped.rows.length === 0) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: `sheet "${worksheet.name}" ไม่มีแถวข้อมูลที่ใช้ได้`,
        sheetName: worksheet.name,
        headerRow,
        errors,
        warnings,
      });
    }

    const existing = await this.findExistingCertificates(dto.companyId, deduped.rows);
    const preview = this.buildPreview(deduped.rows, existing, now);

    if (dryRun) {
      const createdCount = preview.filter((row) => row.action === 'create').length;
      return {
        batchId: null,
        dryRun: true,
        status: errors.length > 0 ? ImportStatus.PARTIAL : ImportStatus.SUCCESS,
        companyId: dto.companyId,
        filename,
        sheetName: worksheet.name,
        headerRow,
        scannedRows: parsed.scannedRows,
        rowCount: deduped.rows.length,
        createdCount,
        updatedCount: preview.length - createdCount,
        skippedCount: errors.length,
        tasksCreated: 0,
        errors,
        warnings,
        preview,
      };
    }

    return this.persist({
      rows: deduped.rows,
      existingKeys: new Set(existing.keys()),
      companyId: dto.companyId,
      companyCode: company.code,
      filename,
      sheetName: worksheet.name,
      headerRow,
      scannedRows: parsed.scannedRows,
      errors,
      warnings,
      preview,
      actor,
      now,
    });
  }

  async findBatches(companyId?: string): Promise<unknown[]> {
    return this.prisma.importBatch.findMany({
      where: companyId === undefined ? {} : { companyId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { company: { select: { code: true, name: true } } },
    });
  }

  async findBatch(id: string): Promise<unknown> {
    const batch = await this.prisma.importBatch.findUnique({
      where: { id },
      include: { company: { select: { code: true, name: true } } },
    });
    if (batch === null) {
      throw new NotFoundException(`ไม่พบ import batch id ${id}`);
    }
    return batch;
  }

  // ===== ภายใน =====

  private async readWorkbook(buffer: Buffer): Promise<Workbook> {
    let workbook: Workbook;
    try {
      workbook = await loadWorkbookFromBuffer(buffer);
    } catch (error) {
      throw new BadRequestException(
        `อ่านไฟล์ Excel ไม่ได้: ${error instanceof Error ? error.message : String(error)} ` +
          '(ต้องเป็นไฟล์ .xlsx ที่ไม่เสียหายและไม่ใส่รหัสผ่าน)',
      );
    }
    if (workbook.worksheets.length === 0) {
      throw new BadRequestException('ไฟล์นี้ไม่มี sheet ใดเลย');
    }
    return workbook;
  }

  private resolveWorksheet(workbook: Workbook, sheetName?: string): Worksheet {
    if (sheetName !== undefined && sheetName.trim().length > 0) {
      const wanted = sheetName.trim();
      const found =
        workbook.getWorksheet(wanted) ??
        workbook.worksheets.find((sheet) => sheet.name.trim() === wanted);
      if (found === undefined) {
        throw new BadRequestException({
          statusCode: HttpStatus.BAD_REQUEST,
          message: `ไม่พบ sheet ชื่อ "${wanted}" ในไฟล์`,
          availableSheets: workbook.worksheets.map((sheet) => sheet.name),
        });
      }
      return found;
    }

    const { suggestedSheet, sheets } = inspectWorkbook(workbook);
    if (suggestedSheet === null) {
      throw new BadRequestException({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'ไม่พบ sheet ที่มีคอลัมน์ครบสำหรับ import — โปรดระบุ sheetName เอง',
        sheets,
      });
    }
    const worksheet = workbook.getWorksheet(suggestedSheet);
    if (worksheet === undefined) {
      throw new BadRequestException(`ไม่พบ sheet "${suggestedSheet}"`);
    }
    return worksheet;
  }

  private headerWarnings(mapping: ReturnType<typeof mapHeaders>): RowIssue[] {
    const warnings: RowIssue[] = [];
    for (const unknown of mapping.unknownHeaders) {
      warnings.push({
        excelRow: 0,
        column: unknown.name,
        message: `ไม่รู้จักคอลัมน์ "${unknown.name}" — ข้ามคอลัมน์นี้`,
      });
    }
    for (const duplicate of mapping.duplicateFields) {
      warnings.push({
        excelRow: 0,
        column: duplicate.name,
        message: `คอลัมน์ "${duplicate.name}" ซ้ำกับคอลัมน์ก่อนหน้าที่เป็น ${duplicate.field} — ใช้คอลัมน์แรก`,
      });
    }
    return warnings;
  }

  /** ดึง cert เดิมของบริษัทนี้ที่ตรงกับคีย์ commonName+endpoint ในไฟล์ */
  private async findExistingCertificates(
    companyId: string,
    rows: ParsedCertificateRow[],
  ): Promise<Map<string, Certificate>> {
    const found = await this.prisma.certificate.findMany({
      where: {
        companyId,
        OR: rows.map((row) => ({ commonName: row.commonName, endpoint: row.endpoint })),
      },
    });
    return new Map(found.map((cert) => [certificateKey(cert.commonName, cert.endpoint), cert]));
  }

  private buildPreview(
    rows: ParsedCertificateRow[],
    existing: Map<string, Certificate>,
    now: Date,
  ): ImportPreviewRow[] {
    return rows.slice(0, MAX_PREVIEW_ROWS).map((row) => {
      const daysUntilExpiry = calculateDaysUntilExpiry(row.expiresAt, now);
      return {
        excelRow: row.excelRow,
        commonName: row.commonName,
        endpoint: row.endpoint,
        expiresAt: row.expiresAt.toISOString(),
        daysUntilExpiry,
        riskLevel: calculateRisk(daysUntilExpiry),
        owner: row.owner,
        issuer: row.issuer,
        workStatus: row.workStatus,
        action: existing.has(certificateKey(row.commonName, row.endpoint)) ? 'update' : 'create',
      };
    });
  }

  private async persist(input: {
    rows: ParsedCertificateRow[];
    existingKeys: Set<string>;
    companyId: string;
    companyCode: string;
    filename: string;
    sheetName: string;
    headerRow: number;
    scannedRows: number;
    errors: RowIssue[];
    warnings: RowIssue[];
    preview: ImportPreviewRow[];
    actor: AuthenticatedUser;
    now: Date;
  }): Promise<ImportResult> {
    const status = input.errors.length === 0 ? ImportStatus.SUCCESS : ImportStatus.PARTIAL;

    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.importBatch.create({
        data: {
          companyId: input.companyId,
          filename: input.filename,
          sheetName: input.sheetName,
          importedBy: input.actor.email,
          rowCount: input.rows.length,
          status: ImportStatus.PENDING,
          errors: input.errors.length > 0 ? toJson(input.errors) : undefined,
          warnings: input.warnings.length > 0 ? toJson(input.warnings) : undefined,
        },
      });

      let createdCount = 0;
      let updatedCount = 0;
      let tasksCreated = 0;

      for (const row of input.rows) {
        const isNew = !input.existingKeys.has(certificateKey(row.commonName, row.endpoint));

        const certificate = await tx.certificate.upsert({
          where: {
            companyId_commonName_endpoint: {
              companyId: input.companyId,
              commonName: row.commonName,
              endpoint: row.endpoint,
            },
          },
          create: {
            companyId: input.companyId,
            commonName: row.commonName,
            endpoint: row.endpoint,
            expiresAt: row.expiresAt,
            issuer: row.issuer,
            signatureAlgorithm: row.signatureAlgorithm,
            owner: row.owner,
            remark: row.remark,
            serialNumber: row.serialNumber,
            keySize: row.keySize,
            sha256Fingerprint: row.sha256Fingerprint,
            san: row.san,
          },
          // อัปเดตเฉพาะฟิลด์ที่ไฟล์ให้มา — ค่าที่ไฟล์ไม่มี (null) ต้องไม่ไปล้างข้อมูลเดิมที่คนกรอกไว้
          update: {
            expiresAt: row.expiresAt,
            ...definedOnly({
              issuer: row.issuer,
              signatureAlgorithm: row.signatureAlgorithm,
              owner: row.owner,
              remark: row.remark,
              serialNumber: row.serialNumber,
              keySize: row.keySize,
              sha256Fingerprint: row.sha256Fingerprint,
            }),
            ...(row.san.length > 0 ? { san: row.san } : {}),
          },
        });

        if (isNew) {
          createdCount++;
        } else {
          updatedCount++;
        }

        await this.history.writeWithin(tx, {
          action: HistoryAction.IMPORT,
          actor: input.actor.email,
          actorId: input.actor.id,
          certificateId: certificate.id,
          companyId: input.companyId,
          detail:
            `${isNew ? 'นำเข้าใหม่' : 'อัปเดตจากการนำเข้า'} จากไฟล์ ${input.filename} ` +
            `sheet "${input.sheetName}" แถว ${row.excelRow}`,
          metadata: {
            batchId: batch.id,
            excelRow: row.excelRow,
            expiresAt: row.expiresAt.toISOString(),
            daysUntilExpiryInFile: row.daysUntilExpiryInFile,
            statusInFile: row.workStatus,
          },
        });

        if (await this.ensureRenewalTask(tx, certificate, row, input.actor, input.now)) {
          tasksCreated++;
        }
      }

      const finalBatch = await tx.importBatch.update({
        where: { id: batch.id },
        data: { status, createdCount, updatedCount, skippedCount: input.errors.length },
      });

      await this.history.writeWithin(tx, {
        action: HistoryAction.IMPORT,
        actor: input.actor.email,
        actorId: input.actor.id,
        companyId: input.companyId,
        detail:
          `นำเข้าไฟล์ ${input.filename} (sheet "${input.sheetName}") บริษัท ${input.companyCode} — ` +
          `สร้าง ${createdCount} อัปเดต ${updatedCount} ข้าม ${input.errors.length} สร้างงานต่ออายุ ${tasksCreated}`,
        metadata: { batchId: batch.id, status },
      });

      return {
        batchId: finalBatch.id,
        dryRun: false,
        status,
        companyId: input.companyId,
        filename: input.filename,
        sheetName: input.sheetName,
        headerRow: input.headerRow,
        scannedRows: input.scannedRows,
        rowCount: input.rows.length,
        createdCount,
        updatedCount,
        skippedCount: input.errors.length,
        tasksCreated,
        errors: input.errors,
        warnings: input.warnings,
        preview: input.preview,
      };
    });
  }

  /**
   * สร้าง RenewalTask ให้ cert ที่ควรมีงานต่ออายุ
   *
   * - ไฟล์บอกว่าเสร็จแล้ว (COMPLETED) → สร้าง task COMPLETED เพื่อเก็บสถานะจากรายงานไว้
   *   (ทำให้เกิดกรณี cert เหลือ 20 วัน = Risk High แต่ Status = Completed ได้ ตามที่ spec ต้องการ)
   * - นอกนั้น → สร้าง task NEW เฉพาะเมื่อ risk ≠ SAFE
   *
   * **ไม่แก้สถานะ task ที่มีอยู่แล้ว** — เมื่อระบบเป็นเจ้าของงานแล้ว การเปลี่ยนสถานะเป็นเรื่องของคน
   * ผ่าน workflow (Phase 4) ไฟล์รายงานรายเดือนไม่ควรกระโดดข้ามขั้นให้เงียบๆ
   */
  private async ensureRenewalTask(
    tx: Prisma.TransactionClient,
    certificate: Certificate,
    row: ParsedCertificateRow,
    actor: AuthenticatedUser,
    now: Date,
  ): Promise<boolean> {
    const openTask = await tx.renewalTask.findFirst({
      where: { certificateId: certificate.id, status: { in: OPEN_TASK_STATUSES } },
    });
    if (openTask !== null) {
      return false;
    }

    const fromFileCompleted = row.workStatus === WorkStatus.COMPLETED;
    if (!fromFileCompleted) {
      const risk = calculateRisk(calculateDaysUntilExpiry(certificate.expiresAt, now));
      if (risk === RiskLevel.SAFE) {
        return false;
      }
      // มี task ที่ปิดไปแล้วสำหรับรอบก่อน แต่ใบยังไม่ถูกต่อ → เปิดงานใหม่ได้
    }

    if (fromFileCompleted) {
      const alreadyCompleted = await tx.renewalTask.findFirst({
        where: { certificateId: certificate.id, status: WorkStatus.COMPLETED },
      });
      if (alreadyCompleted !== null) {
        return false;
      }
    }

    const status = fromFileCompleted ? WorkStatus.COMPLETED : WorkStatus.NEW;
    const task = await tx.renewalTask.create({
      data: {
        certificateId: certificate.id,
        status,
        completedAt: fromFileCompleted ? now : null,
        note: `สร้างอัตโนมัติจากการนำเข้าไฟล์ Excel (แถว ${row.excelRow})`,
      },
    });

    await this.history.writeWithin(tx, {
      action: HistoryAction.TASK_CREATED,
      actor: actor.email,
      actorId: actor.id,
      certificateId: certificate.id,
      companyId: certificate.companyId,
      renewalTaskId: task.id,
      detail: `สร้างงานต่ออายุอัตโนมัติ สถานะ ${status} จากการนำเข้าไฟล์`,
      metadata: { source: 'import', excelRow: row.excelRow, statusInFile: row.workStatus },
    });

    return true;
  }
}

function certificateKey(commonName: string, endpoint: string): string {
  return `${commonName} ${endpoint}`;
}

/** ตัดคีย์ที่เป็น null ออก เพื่อไม่ให้ update ไปล้างค่าที่มีอยู่เดิม */
function definedOnly<T extends Record<string, unknown>>(input: T): Partial<T> {
  const output: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value !== null && value !== undefined) {
      output[key] = value;
    }
  }
  return output as Partial<T>;
}

/** แปลงเป็นค่าที่เก็บลงคอลัมน์ Json ได้ */
function toJson(issues: RowIssue[]): Prisma.InputJsonValue {
  return issues.map((issue) => ({ ...issue })) as unknown as Prisma.InputJsonValue;
}
