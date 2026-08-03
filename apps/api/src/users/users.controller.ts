import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthenticatedUser } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ListUsersDto } from './dto/list-users.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService, type UserView } from './users.service';

/**
 * ดูรายชื่อได้ ADMIN + OPERATOR (operator ต้องเลือกผู้รับผิดชอบงานได้) — viewer ไม่ต้องเห็นรายชื่อพนักงาน
 * แก้ไขได้เฉพาะ ADMIN · การสร้างผู้ใช้ใหม่อยู่ที่ `POST /auth/register`
 */
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  @Get()
  findAll(@Query() query: ListUsersDto): Promise<UserView[]> {
    return this.usersService.findAll(query);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<UserView> {
    return this.usersService.update(id, dto, actor);
  }
}
