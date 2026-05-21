import {
  Body,
  Controller,
  Get,
  Post,
  HttpCode,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
@UseGuards(AuthGuard)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  getMe(@CurrentUser() user: UserWithScopes): ReturnType<AuthService['getMe']> {
    return this.authService.getMe(user);
  }

  @Post('password-changed')
  async passwordChanged(
    @Body() dto: ChangePasswordDto,
    @CurrentUser() user: UserWithScopes,
    @Req() req: Request,
  ): Promise<void> {
    const ip = (req.headers['x-forwarded-for'] as string | undefined)
      ?? req.socket.remoteAddress;
    await this.authService.passwordChanged(user, dto.newPassword, ip);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@CurrentUser() user: UserWithScopes): Promise<void> {
    await this.authService.logout(user);
  }
}
