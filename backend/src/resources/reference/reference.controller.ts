import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { Subregion, Municipio, Comuna, Zona, Puesto } from '@prisma/client';
import { AuthGuard } from '../../common/guards/auth.guard.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { UserWithScopes } from '../../common/types/request-with-user.js';
import { ReferenceService } from './reference.service.js';

@UseGuards(AuthGuard)
@Controller('api')
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
