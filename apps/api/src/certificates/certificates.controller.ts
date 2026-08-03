import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import type { Paginated } from '../common/pagination';
import { CertificatesService } from './certificates.service';
import type { CertificateDetail, CertificateListItem } from './certificates.types';
import { ListCertificatesDto } from './dto/list-certificates.dto';

/**
 * อ่านได้ทุก role ที่ login แล้ว — ข้อมูล certificate แก้ผ่าน Import เท่านั้น
 * จึงไม่มี POST/PATCH/DELETE ที่นี่ (กฎเหล็กข้อ 1: Excel เป็นช่องทาง import ข้อมูลจริงอยู่ใน DB)
 */
@Controller('certificates')
export class CertificatesController {
  constructor(private readonly certificatesService: CertificatesService) {}

  @Get()
  findAll(@Query() query: ListCertificatesDto): Promise<Paginated<CertificateListItem>> {
    return this.certificatesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<CertificateDetail> {
    return this.certificatesService.findOne(id);
  }
}
