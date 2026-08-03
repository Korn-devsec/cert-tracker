import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Company, UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CompaniesService } from './companies.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { ListCompaniesDto } from './dto/list-companies.dto';
import { UpdateCompanyDto } from './dto/update-company.dto';

/**
 * อ่านได้ทุก role ที่ login แล้ว (รวม viewer)
 * แก้ไขได้เฉพาะ ADMIN — จึงเป็นเหตุผลที่ viewer สร้างบริษัทแล้วได้ 403
 */
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  @Get()
  findAll(@Query() query: ListCompaniesDto): Promise<Company[]> {
    return this.companiesService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Company> {
    return this.companiesService.findOne(id);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateCompanyDto, @CurrentUser() actor: AuthenticatedUser): Promise<Company> {
    return this.companiesService.create(dto, actor);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Company> {
    return this.companiesService.update(id, dto, actor);
  }

  /** soft delete — ตั้ง isActive = false ไม่ลบข้อมูลจริง */
  @Roles(UserRole.ADMIN)
  @Delete(':id')
  deactivate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<Company> {
    return this.companiesService.deactivate(id, actor);
  }
}
