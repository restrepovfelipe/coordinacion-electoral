import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';

export interface TestigoCount {
  municipioId: number;
  count: number;
}

interface RawCountRow {
  municipioId: bigint;
  count: bigint;
  maxUpdatedAt: Date | null;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getTestigoCounts(
    user: UserWithScopes,
  ): Promise<{ data: TestigoCount[]; maxUpdatedAt: Date | null }> {
    let rows: RawCountRow[];

    if (
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR
    ) {
      rows = await this.prisma.$queryRaw<RawCountRow[]>(Prisma.sql`
        SELECT
          m.id            AS "municipioId",
          COUNT(t.id)     AS count,
          MAX(t."updatedAt") AS "maxUpdatedAt"
        FROM "Municipio" m
        LEFT JOIN "Puesto"  p ON p."municipioId" = m.id
        LEFT JOIN "Testigo" t ON t."puestoId"    = p.id
        GROUP BY m.id
      `);
    } else {
      // Scope-filtered: only municipios reachable via this user's accessible puestos.
      rows = await this.prisma.$queryRaw<RawCountRow[]>(Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId"
          FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id
          FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId"
          FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId"
          FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id
          FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId"
          FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        user_puestos AS (
          SELECT p.id, p."municipioId"
          FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id, p."municipioId"
          FROM "Puesto" p
          INNER JOIN "UserScope" us ON us."scopeId" = p.id
          WHERE us."userId" = ${user.id} AND us."scopeType" = 'PUESTO'
        )
        SELECT
          up."municipioId",
          COUNT(t.id)        AS count,
          MAX(t."updatedAt") AS "maxUpdatedAt"
        FROM user_puestos up
        LEFT JOIN "Testigo" t ON t."puestoId" = up.id
        GROUP BY up."municipioId"
      `);
    }

    const maxUpdatedAt = rows.reduce<Date | null>((max, r) => {
      if (!r.maxUpdatedAt) return max;
      if (!max || r.maxUpdatedAt > max) return r.maxUpdatedAt;
      return max;
    }, null);

    return {
      data: rows.map((r) => ({
        municipioId: Number(r.municipioId),
        count: Number(r.count),
      })),
      maxUpdatedAt,
    };
  }
}
