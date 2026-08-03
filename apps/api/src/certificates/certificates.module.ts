import { Module } from '@nestjs/common';
import { AttachmentsController } from './attachments/attachments.controller';
import { AttachmentsService } from './attachments/attachments.service';
import { CertificatesController } from './certificates.controller';
import { CertificatesService } from './certificates.service';

@Module({
  // ลำดับสำคัญ: route ของไฟล์แนบเป็น path ย่อยของ certificates
  controllers: [CertificatesController, AttachmentsController],
  providers: [CertificatesService, AttachmentsService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
