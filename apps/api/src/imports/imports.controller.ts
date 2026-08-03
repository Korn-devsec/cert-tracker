import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  PayloadTooLargeException,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UserRole } from '@prisma/client';
import { looksLikeXlsx } from './excel/xlsx-signature';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateImportDto } from './dto/create-import.dto';
import { ImportsService } from './imports.service';
import type { ImportResult, InspectResult } from './imports.types';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10) * 1024 * 1024;
const XLSX_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'application/octet-stream', // บาง client ส่งมาแบบนี้ — จึงเช็คนามสกุลไฟล์ด้วย
];

@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  /** สำรวจไฟล์ก่อน import: มี sheet อะไร header อยู่แถวไหน sheet ไหนใช้ได้ */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post('inspect')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  inspect(@UploadedFile() file?: Express.Multer.File): Promise<InspectResult> {
    const checked = assertXlsx(file);
    return this.importsService.inspect(checked.buffer, checked.originalname);
  }

  /**
   * นำเข้าไฟล์ Excel — ต้องระบุ companyId เสมอ (กฎเหล็กข้อ 4)
   * ส่ง `dryRun=true` เพื่อดู preview ก่อนบันทึกจริง
   */
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  create(
    @Body() dto: CreateImportDto,
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<ImportResult> {
    const checked = assertXlsx(file);
    return this.importsService.import(checked.buffer, checked.originalname, dto, actor);
  }

  /** ประวัติการ import (viewer อ่านได้) */
  @Get()
  findAll(@Query('companyId') companyId?: string): Promise<unknown[]> {
    return this.importsService.findBatches(companyId);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<unknown> {
    return this.importsService.findBatch(id);
  }
}

/**
 * ตรวจว่าเป็นไฟล์ .xlsx จริง — นามสกุล + mime type + **ลายเซ็นไบต์แรกของไฟล์** (Phase 8)
 * ชื่อไฟล์และ mime type ที่ client ส่งมาปลอมได้ ไบต์แรกของไฟล์ปลอมไม่ได้
 */
function assertXlsx(file?: Express.Multer.File): Express.Multer.File {
  if (file === undefined) {
    throw new BadRequestException('ต้องแนบไฟล์ .xlsx ในฟิลด์ชื่อ "file"');
  }
  const hasXlsxExtension = file.originalname.toLowerCase().endsWith('.xlsx');
  if (!hasXlsxExtension) {
    throw new BadRequestException(
      `รองรับเฉพาะไฟล์ .xlsx — ได้รับ "${file.originalname}" (.xls รุ่นเก่าต้องบันทึกเป็น .xlsx ก่อน)`,
    );
  }
  if (!XLSX_MIME_TYPES.includes(file.mimetype)) {
    throw new BadRequestException(`ชนิดไฟล์ไม่ถูกต้อง: ${file.mimetype}`);
  }
  if (file.size === 0 || file.buffer.length === 0) {
    throw new BadRequestException('ไฟล์ว่าง');
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new PayloadTooLargeException(
      `ไฟล์ใหญ่เกิน ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`,
    );
  }
  if (!looksLikeXlsx(file.buffer)) {
    throw new BadRequestException(
      `เนื้อไฟล์ "${file.originalname}" ไม่ใช่ .xlsx จริง (ไฟล์ .xlsx ต้องเป็นรูปแบบ ZIP/OOXML) — ` +
        'ถ้าเป็น .csv หรือ .xls ให้บันทึกเป็น .xlsx ก่อน',
    );
  }
  return file;
}
