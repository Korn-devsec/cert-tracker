import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { AuthService } from './auth.service';
import { AuthenticatedUser, LoginResult } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto): Promise<LoginResult> {
    return this.authService.login(dto);
  }

  /** สร้างผู้ใช้ใหม่ได้เฉพาะ admin (ตาม PLAN.md Phase 2) */
  @Roles(UserRole.ADMIN)
  @Post('register')
  register(
    @Body() dto: RegisterDto,
    @CurrentUser() actor: AuthenticatedUser,
  ): Promise<AuthenticatedUser> {
    return this.authService.register(dto, actor);
  }

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): AuthenticatedUser {
    return user;
  }
}
