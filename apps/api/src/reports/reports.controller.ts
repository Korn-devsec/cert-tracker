import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common';
import type { Response } from 'express';
import { ExportCertificatesDto, MonthlyReportDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';
import type { MonthlyReport } from './reports.types';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** รายงานอ่านได้ทุก role ที่ login แล้ว (ไม่มีการแก้ข้อมูล) */
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  /** สรุปรายเดือนเทียบเดือนก่อนหน้า — ใช้บนหน้า Reports */
  @Get('monthly')
  monthly(@Query() query: MonthlyReportDto): Promise<MonthlyReport> {
    return this.reportsService.monthly(query);
  }

  /**
   * ดาวน์โหลดรายงาน Excel ตามตัวกรองปัจจุบัน
   * ส่งจำนวนแถวและสถานะการตัดข้อมูลไปใน header ด้วย เพื่อให้ฝั่งเรียกตรวจได้ว่าครบหรือไม่
   */
  @Get('certificates.xlsx')
  @Header('Cache-Control', 'no-store')
  async exportCertificates(
    @Query() query: ExportCertificatesDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    const result = await this.reportsService.exportCertificates(query);

    response.setHeader('X-Report-Row-Count', String(result.rowCount));
    response.setHeader('X-Report-Truncated', String(result.truncated));
    // ให้ browser อ่านสองหัวข้อนี้ได้แม้เรียกข้าม origin (dev: 5173 → 3000)
    response.setHeader('Access-Control-Expose-Headers', 'X-Report-Row-Count, X-Report-Truncated');

    return new StreamableFile(result.buffer, {
      type: XLSX_MIME,
      disposition: `attachment; filename="${result.filename}"`,
      length: result.buffer.length,
    });
  }
}
