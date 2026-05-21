import { Injectable } from '@nestjs/common';
import { Role, Subregion, Municipio, Comuna, Zona, Puesto } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { UserWithScopes } from '../../common/types/request-with-user.js';

@Injectable()
export class ReferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly permissions: PermissionsService,
  ) {}

  async getSubregiones(user: UserWithScopes): Promise<Subregion[]> {
    if (user.role === Role.SUPER_ADMIN) {
      return this.prisma.subregion.findMany();
    }
    const accessibleIds = await this.permissions.accessiblePuestoIds(user);
    return this.prisma.subregion.findMany({
      where: {
        municipios: {
          some: {
            puestos: { some: { id: { in: [...accessibleIds] } } },
          },
        },
      },
    });
  }

  async getMunicipios(
    user: UserWithScopes,
    subregionId?: string,
  ): Promise<Municipio[]> {
    const accessibleIds =
      user.role !== Role.SUPER_ADMIN
        ? await this.permissions.accessiblePuestoIds(user)
        : undefined;

    return this.prisma.municipio.findMany({
      where: {
        ...(subregionId ? { subregionId: Number(subregionId) } : {}),
        ...(accessibleIds !== undefined
          ? { puestos: { some: { id: { in: [...accessibleIds] } } } }
          : {}),
      },
    });
  }

  async getComunas(
    user: UserWithScopes,
    municipioId?: string,
  ): Promise<Comuna[]> {
    let accessibleMunicipioIds: number[] | undefined;

    if (user.role !== Role.SUPER_ADMIN) {
      const accessibleIds = await this.permissions.accessiblePuestoIds(user);
      const puestos = await this.prisma.puesto.findMany({
        where: { id: { in: [...accessibleIds] } },
        select: { municipioId: true },
      });
      accessibleMunicipioIds = puestos.map((p) => p.municipioId);
    }

    return this.prisma.comuna.findMany({
      where: {
        ...(municipioId ? { municipioId: Number(municipioId) } : {}),
        ...(accessibleMunicipioIds !== undefined
          ? { municipioId: { in: accessibleMunicipioIds } }
          : {}),
      },
    });
  }

  async getZonas(): Promise<Zona[]> {
    return this.prisma.zona.findMany();
  }

  async getPuestos(
    user: UserWithScopes,
    municipioId?: string,
    comunaId?: string,
  ): Promise<Puesto[]> {
    const accessibleIds =
      user.role !== Role.SUPER_ADMIN
        ? await this.permissions.accessiblePuestoIds(user)
        : undefined;

    return this.prisma.puesto.findMany({
      where: {
        ...(municipioId ? { municipioId: Number(municipioId) } : {}),
        ...(comunaId ? { comunaId: Number(comunaId) } : {}),
        ...(accessibleIds !== undefined
          ? { id: { in: [...accessibleIds] } }
          : {}),
      },
    });
  }
}
