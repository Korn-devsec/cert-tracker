import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { Site, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CreateSiteDto, UpdateSiteDto } from './dto/site.dto';
import { SitesService } from './sites.service';

/**
 * Site CRUD อยู่ใต้ company เสมอ (`/companies/:companyId/sites`)
 * ADMIN และ OPERATOR แก้ได้ เพราะเป็นข้อมูลระดับปฏิบัติงาน ส่วน VIEWER อ่านได้เท่านั้น
 */
@Controller('companies/:companyId/sites')
export class SitesController {
  constructor(private readonly sitesService: SitesService) {}

  @Get()
  findAll(@Param('companyId', ParseUUIDPipe) companyId: string): Promise<Site[]> {
    return this.sitesService.findAll(companyId);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Post()
  create(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateSiteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Site> {
    return this.sitesService.create(companyId, dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Patch(':siteId')
  update(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @Body() dto: UpdateSiteDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Site> {
    return this.sitesService.update(companyId, siteId, dto, actor);
  }

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Delete(':siteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('siteId', ParseUUIDPipe) siteId: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<void> {
    return this.sitesService.remove(companyId, siteId, actor);
  }
}
