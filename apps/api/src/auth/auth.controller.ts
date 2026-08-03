import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedUser, LoginResult } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { Roles } from './decorators/roles.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { LoginThrottleGuard, resetLoginThrottle } from './guards/login-throttle.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /** จำกัดจำนวนครั้งที่ลอง login เพื่อชะลอการเดารหัสผ่าน (Phase 8) */
  @Public()
  @UseGuards(LoginThrottleGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() dto: LoginDto, @Req() request: Request): Promise<LoginResult> {
    const result = await this.authService.login(dto);
    // เข้าได้แล้วก็ล้างตัวนับ — คนที่พิมพ์ผิดสองครั้งแล้วเข้าได้ ไม่ควรถูกกันในรอบถัดไป
    resetLoginThrottle(request);
    return result;
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
