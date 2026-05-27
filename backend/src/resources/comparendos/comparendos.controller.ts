import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { ComparendosService } from './comparendos.service.js';
import { CreateComparendoDto } from './dto/create-comparendo.dto.js';
import { UpdateComparendoDto } from './dto/update-comparendo.dto.js';

@ApiTags('comparendos')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@Controller('comparendos')
export class ComparendosController {
  constructor(private readonly comparendosService: ComparendosService) {}

  @Get('by-muni/:municipioId')
  findByMuni(
    @Param('municipioId', ParseIntPipe) municipioId: number,
  ) {
    return this.comparendosService.findByMuni(municipioId);
  }

  @Get()
  findByComuna(
    @Query('comunaId', ParseIntPipe) comunaId: number,
    @CurrentUser() user: UserWithScopes,
  ) {
    return this.comparendosService.findByComuna(comunaId, user);
  }

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
