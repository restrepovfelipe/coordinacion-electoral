import { Injectable } from '@nestjs/common';
import { Prisma, Role, ScopeType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';

@Injectable()
export class PermissionsService {
  constructor(private readonly prisma: PrismaService) {}

  async accessiblePuestoIds(user: UserWithScopes): Promise<Set<number>> {
    if (user.role === Role.SUPER_ADMIN) {
      const puestos = await this.prisma.puesto.findMany({ select: { id: true } });
      return new Set(puestos.map((p) => p.id));
    }

    const rows = await this.prisma.$queryRaw<Array<{ id: bigint }>>(
      Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId" FROM "UserScope" WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope" WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope" WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope" WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        user_puestos AS (
          SELECT p.id FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT "scopeId" FROM "UserScope" WHERE "userId" = ${user.id} AND "scopeType" = 'PUESTO'
        )
        SELECT id FROM user_puestos
      `,
    );

    return new Set(rows.map((r) => Number(r.id)));
  }

  async canAccess(
    user: UserWithScopes,
    scopeType: ScopeType,
    scopeId: number,
  ): Promise<boolean> {
    if (user.role === Role.SUPER_ADMIN) {
      return true;
    }

    const accessibleIds = await this.accessiblePuestoIds(user);
    const idArray = [...accessibleIds];

    switch (scopeType) {
      case ScopeType.PUESTO: {
        return accessibleIds.has(scopeId);
      }

      case ScopeType.MUNICIPIO: {
        const count = await this.prisma.puesto.count({
          where: { municipioId: scopeId, id: { in: idArray } },
        });
        return count > 0;
      }

      case ScopeType.SUBREGION: {
        const count = await this.prisma.municipio.count({
          where: {
            subregionId: scopeId,
            puestos: { some: { id: { in: idArray } } },
          },
        });
        return count > 0;
      }

      case ScopeType.ZONA: {
        const count = await this.prisma.comuna.count({
          where: {
            zonaId: scopeId,
            puestos: { some: { id: { in: idArray } } },
          },
        });
        return count > 0;
      }

      case ScopeType.COMUNA: {
        const count = await this.prisma.puesto.count({
          where: { comunaId: scopeId, id: { in: idArray } },
        });
        return count > 0;
      }

      default: {
        return false;
      }
    }
  }
}
