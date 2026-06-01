import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ConfirmService } from './confirm.service.js';
import { ConfirmActionDto } from './dto/confirm-action.dto.js';

// NO @UseGuards(AuthGuard) — these routes are intentionally public
@ApiTags('confirm')
@Controller('t')
export class ConfirmController {
  constructor(private readonly confirmService: ConfirmService) {}

  @Get(':token')
  getByToken(@Param('token') token: string) {
    return this.confirmService.getByToken(token);
  }

  @Post(':token')
  confirm(
    @Param('token') token: string,
    @Body() dto: ConfirmActionDto,
  ) {
    return this.confirmService.confirm(token, dto.action);
  }
}
