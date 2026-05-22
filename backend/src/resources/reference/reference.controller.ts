import { Controller, Get, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Subregion, Municipio, Comuna, Zona, Puesto } from '@prisma/client';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { ETagInterceptor } from '../../common/interceptors/etag.interceptor.js';
import { ReferenceService } from './reference.service.js';

@ApiTags('reference')
@ApiBearerAuth()
@UseGuards(AuthGuard)
@UseInterceptors(ETagInterceptor)
@Controller('')
export class ReferenceController {
  constructor(private readonly referenceService: ReferenceService) {}

  @Get('subregiones')
  getSubregiones(@CurrentUser() user: UserWithScopes): Promise<Subregion[]> {
    return this.referenceService.getSubregiones(user);
  }

  @Get('municipios')
  getMunicipios(
    @CurrentUser() user: UserWithScopes,
    @Query('subregionId') subregionId?: string,
  ): Promise<Municipio[]> {
    return this.referenceService.getMunicipios(user, subregionId);
  }

  @Get('comunas')
  getComunas(
    @CurrentUser() user: UserWithScopes,
    @Query('municipioId') municipioId?: string,
  ): Promise<Comuna[]> {
    return this.referenceService.getComunas(user, municipioId);
  }

  @Get('zonas')
  getZonas(): Promise<Zona[]> {
    return this.referenceService.getZonas();
  }

  @Get('puestos')
  getPuestos(
    @CurrentUser() user: UserWithScopes,
    @Query('municipioId') municipioId?: string,
    @Query('comunaId') comunaId?: string,
  ): Promise<Puesto[]> {
    return this.referenceService.getPuestos(user, municipioId, comunaId);
  }
}
