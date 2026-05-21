import { Controller, Get, Sse, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../common/types/request-with-user.js';
import { RealtimeService } from './realtime.service.js';

@Controller('events')
@UseGuards(AuthGuard)
@ApiTags('realtime')
@ApiBearerAuth()
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Get()
  @Sse()
  stream(@CurrentUser() user: UserWithScopes) {
    return this.realtime.subscribeUser(user);
  }
}
