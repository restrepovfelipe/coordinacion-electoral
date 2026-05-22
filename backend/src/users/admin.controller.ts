import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Role, ScopeType } from '@prisma/client';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ROLE_SCOPE: Record<Role, ScopeType | null> = {
  [Role.SUPER_ADMIN]: null,
  [Role.REGIONAL_COORDINATOR]: null,
  [Role.MUNICIPAL_COORDINATOR]: ScopeType.MUNICIPIO,
  [Role.ZONE_COORDINATOR]: ScopeType.ZONA,
  [Role.COMUNA_COORDINATOR]: ScopeType.COMUNA,
  [Role.PUESTO_COORDINATOR]: ScopeType.PUESTO,
};

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(AuthGuard, RolesGuard)
@Controller('admin')
export class AdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('cascade-options')
  @ApiQuery({ name: 'role', enum: Role })
  @ApiQuery({ name: 'municipioId', required: false, type: Number })
  @ApiQuery({ name: 'scopeId', required: false, type: Number })
  @Roles(Role.SUPER_ADMIN, Role.REGIONAL_COORDINATOR)
  async cascadeOptions(
    @Query('role') role: Role,
    @Query('municipioId') municipioId?: string,
    @Query('scopeId') scopeId?: string,
  ): Promise<{
    scopeType: ScopeType | null;
    needsMunicipio: boolean;
    items: Array<{ id: number; name: string }>;
    preselect: { municipioId?: number; childId?: number } | null;
  }> {
    const scopeType = ROLE_SCOPE[role] ?? null;

    if (!scopeType) {
      return { scopeType: null, needsMunicipio: false, items: [], preselect: null };
    }

    const mId = municipioId ? Number(municipioId) : null;
    const sid = scopeId ? Number(scopeId) : null;

    let preselect: { municipioId?: number; childId?: number } | null = null;

    if (scopeType === ScopeType.MUNICIPIO) {
      const items = await this.prisma.municipio.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      if (sid) preselect = { childId: sid };
      return { scopeType, needsMunicipio: false, items, preselect };
    }

    if (scopeType === ScopeType.ZONA) {
      const items = await this.prisma.zona.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      if (sid) preselect = { childId: sid };
      return { scopeType, needsMunicipio: false, items, preselect };
    }

    if (scopeType === ScopeType.COMUNA) {
      if (!mId) {
        // Look up parent municipio for preselect
        if (sid) {
          const comuna = await this.prisma.comuna.findUnique({
            where: { id: sid },
            select: { municipioId: true },
          });
          if (comuna) preselect = { municipioId: comuna.municipioId, childId: sid };
        }
        const municipios = await this.prisma.municipio.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return { scopeType, needsMunicipio: true, items: municipios, preselect };
      }
      const items = await this.prisma.comuna.findMany({
        where: { municipioId: mId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return { scopeType, needsMunicipio: true, items, preselect };
    }

    if (scopeType === ScopeType.PUESTO) {
      if (!mId) {
        // Look up parent municipio for preselect
        if (sid) {
          const puesto = await this.prisma.puesto.findUnique({
            where: { id: sid },
            select: { municipioId: true },
          });
          if (puesto) preselect = { municipioId: puesto.municipioId, childId: sid };
        }
        const municipios = await this.prisma.municipio.findMany({
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return { scopeType, needsMunicipio: true, items: municipios, preselect };
      }
      const items = await this.prisma.puesto.findMany({
        where: { municipioId: mId },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      });
      return { scopeType, needsMunicipio: true, items, preselect };
    }

    return { scopeType: null, needsMunicipio: false, items: [], preselect: null };
  }
}
