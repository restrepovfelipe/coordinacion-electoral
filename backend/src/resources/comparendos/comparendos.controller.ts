import {
  Body,
  Controller,
  Delete,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { ComparendosService } from './comparendos.service.js';
import { CreateComparendoDto } from './dto/create-comparendo.dto.js';
import { UpdateComparendoDto } from './dto/update-comparendo.dto.js';

@UseGuards(AuthGuard)
@Controller('api/comparendos')
export class ComparendosController {
  constructor(private readonly comparendosService: ComparendosService) {}

  @Post()
  create(
    @Body() dto: CreateComparendoDto,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.comparendosService.create(dto, user);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateComparendoDto,
    @Headers('if-match') ifMatch: string | undefined,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.comparendosService.update(id, dto, user, ifMatch);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.comparendosService.remove(id, user);
  }
}
