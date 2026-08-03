import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Attachment, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../../auth/auth.types';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { Roles } from '../../auth/decorators/roles.decorator';
import { AttachmentsService } from './attachments.service';

const MAX_UPLOAD_BYTES = Number(process.env.MAX_UPLOAD_SIZE_MB ?? 10) * 1024 * 1024;

/** ไฟล์แนบผูกกับ certificate เสมอ — อ่าน/ดาวน์โหลดได้ทุก role, แนบได้ ADMIN/OPERATOR */
@Controller('certificates/:certificateId/attachments')
export class AttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Get()
  list(@Param('certificateId', ParseUUIDPipe) certificateId: string): Promise<Attachment[]> {
    return this.attachmentsService.list(certificateId);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  upload(
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
    @CurrentUser() actor: AuthenticatedUser,
    @UploadedFile() file?: Express.Multer.File,
  ): Promise<Attachment> {
    if (file === undefined) {
      throw new BadRequestException('ต้องแนบไฟล์ในฟิลด์ชื่อ "file"');
    }
    return this.attachmentsService.upload(certificateId, file, actor);
  }

  @Get(':attachmentId/download')
  async download(
    @Param('certificateId', ParseUUIDPipe) certificateId: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
  ): Promise<StreamableFile> {
    const { file } = await this.attachmentsService.download(certificateId, attachmentId);
    return file;
  }
}
