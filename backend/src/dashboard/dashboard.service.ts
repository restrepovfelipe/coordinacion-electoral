import { Injectable } from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';
import { CoverageService, EstadoPuesto } from '../common/coverage.service.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type { EstadoPuesto } from '../common/coverage.service.js';

export interface TestigoCount {
  municipioId: number;
  count: number;
}

export interface MunicipioStat {
  municipioId: number;
  municipioNombre: string;
  testigosCount: number;
  mesasCount: number;
  mesasCubiertas: number;
  coberturaPct: number;
  prioridadAltaCount: number;
  prioridadMediaCount: number;
  prioridadBajaCount: number;
  criticosUncovered: number;
}

export interface PuestoPrioridadItem {
  puestoId: number;
  puestoNombre: string;
  municipioId: number;
  municipioNombre: string;
  comunaId: number | null;
  comunaNombre: string | null;
  votosCreemos: number;
  votosSN: number;
  votosTotal: number;
  mesas: number;
  testigosAsignados: number;
  testigosRequeridos: number;
  nivelPrioridad: string;
  estado: EstadoPuesto;
  coberturaPct: number;
}

export interface MapaPuesto {
  puestoId: number;
  nombre: string;
  lat: number;
  lng: number;
  estado: EstadoPuesto;
  votosTotal: number;
  mesas: number;
  testigosAsignados: number;
  testigosRequeridos: number;
  municipioId: number;
}

export interface PrioridadConfigDto {
  id: number;
  umbralAlto: number;
  umbralMedio: number;
  ratioMesasAlta: number;
  ratioMesasMedia: number;
  ratioMesasBaja: number;
  updatedAt: Date;
  updatedById: number | null;
}

interface RawStatRow {
  municipioId: bigint;
  municipioNombre: string;
  testigosCount: bigint;
  mesasCount: bigint;
  mesasCubiertas: bigint;
  altaCount: bigint;
  mediaCount: bigint;
  bajaCount: bigint;
  criticosUncovered: bigint;
  maxUpdatedAt: Date | null;
  maxPrioridadAt: Date | null;
  maxConfigAt: Date | null;
  ratioMesasAlta: number;
  ratioMesasMedia: number;
  ratioMesasBaja: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────


@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly coverage: CoverageService,
  ) {}

  // ── Legacy: GET /api/dashboard/testigos-counts (Phase 13 compat) ────────────

  async getTestigoCounts(
    user: UserWithScopes,
  ): Promise<{ data: TestigoCount[]; maxUpdatedAt: Date | null }> {
    // Delegate to stats, project back to the Phase 13 shape
    const stats = await this.getStats(user);
    const maxUpdatedAt = stats.reduce<Date | null>((max, s) => {
      // We don't expose maxUpdatedAt from stats; reuse the old query path
      return max;
    }, null);

    // Fast path: re-run the original compact query for legacy ETag
    let rows: { municipioId: bigint; count: bigint; maxUpdatedAt: Date | null }[];

    if (
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR
    ) {
      rows = await this.prisma.$queryRaw<
        { municipioId: bigint; count: bigint; maxUpdatedAt: Date | null }[]
      >(Prisma.sql`
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
      rows = await this.prisma.$queryRaw<
        { municipioId: bigint; count: bigint; maxUpdatedAt: Date | null }[]
      >(Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        user_puestos AS (
          SELECT p.id, p."municipioId"
          FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id, p."municipioId" FROM "Puesto" p
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

    const max = rows.reduce<Date | null>((m, r) => {
      if (!r.maxUpdatedAt) return m;
      return !m || r.maxUpdatedAt > m ? r.maxUpdatedAt : m;
    }, null);

    return {
      data: rows.map((r) => ({
        municipioId: Number(r.municipioId),
        count: Number(r.count),
      })),
      maxUpdatedAt: max,
    };
  }

  // ── T85A: GET /api/dashboard/stats ──────────────────────────────────────────

  async getStats(
    user: UserWithScopes,
  ): Promise<MunicipioStat[]> {
    const isBroad =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR;

    let rows: RawStatRow[];

    if (isBroad) {
      rows = await this.prisma.$queryRaw<RawStatRow[]>(Prisma.sql`
        WITH puesto_asig AS (
          SELECT
            "puestoId",
            COUNT(*)                                                       AS cnt,
            SUM(CASE WHEN "mesaInicial" IS NOT NULL
                     THEN "mesaFinal" - "mesaInicial" + 1 ELSE 0 END)     AS "mesasAsignadas"
          FROM "Testigo"
          GROUP BY "puestoId"
        ),
        puesto_cov AS (
          SELECT
            p."municipioId",
            SUM(p.mesas)                             AS "totalMesas",
            SUM(COALESCE(pa."mesasAsignadas", 0))     AS "mesasCubiertas",
            SUM(COALESCE(pa.cnt, 0))                  AS "totalTestigos"
          FROM "Puesto" p
          LEFT JOIN puesto_asig pa ON pa."puestoId" = p.id
          GROUP BY p."municipioId"
        )
        SELECT
          m.id                                     AS "municipioId",
          m.name                                   AS "municipioNombre",
          pc."totalTestigos"                       AS "testigosCount",
          pc."totalMesas"                          AS "mesasCount",
          pc."mesasCubiertas"                      AS "mesasCubiertas",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'ALTA')  AS "altaCount",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'MEDIA') AS "mediaCount",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'BAJA')  AS "bajaCount",
          COUNT(DISTINCT pp.id) FILTER (
            WHERE pp."nivelPrioridad" = 'ALTA'
              AND COALESCE(pa2."mesasAsignadas", 0) < p2.mesas
          )                                        AS "criticosUncovered",
          MAX(t."updatedAt")                       AS "maxUpdatedAt",
          MAX(pp."updatedAt")                      AS "maxPrioridadAt",
          MAX(cfg."updatedAt")                     AS "maxConfigAt",
          MAX(cfg."ratioMesasAlta")                AS "ratioMesasAlta",
          MAX(cfg."ratioMesasMedia")               AS "ratioMesasMedia",
          MAX(cfg."ratioMesasBaja")                AS "ratioMesasBaja"
        FROM "Municipio" m
        JOIN puesto_cov pc              ON pc."municipioId"  = m.id
        LEFT JOIN "Puesto" p            ON p."municipioId"   = m.id
        LEFT JOIN "Testigo" t           ON t."puestoId"      = p.id
        LEFT JOIN "PuestoPrioridad" pp  ON pp."puestoId"     = p.id
        LEFT JOIN "Puesto" p2           ON p2.id             = pp."puestoId"
        LEFT JOIN puesto_asig pa2       ON pa2."puestoId"    = pp."puestoId"
        CROSS JOIN (SELECT * FROM "PrioridadConfig" LIMIT 1) cfg
        GROUP BY m.id, m.name, pc."totalTestigos", pc."totalMesas", pc."mesasCubiertas"
        ORDER BY m.name
      `);
    } else {
      rows = await this.prisma.$queryRaw<RawStatRow[]>(Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        user_puestos AS (
          SELECT p.id, p."municipioId"
          FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id, p."municipioId" FROM "Puesto" p
          INNER JOIN "UserScope" us ON us."scopeId" = p.id
          WHERE us."userId" = ${user.id} AND us."scopeType" = 'PUESTO'
        ),
        puesto_asig AS (
          SELECT
            "puestoId",
            COUNT(*)                                                       AS cnt,
            SUM(CASE WHEN "mesaInicial" IS NOT NULL
                     THEN "mesaFinal" - "mesaInicial" + 1 ELSE 0 END)     AS "mesasAsignadas"
          FROM "Testigo"
          GROUP BY "puestoId"
        ),
        puesto_cov AS (
          SELECT
            up."municipioId",
            SUM(p.mesas)                             AS "totalMesas",
            SUM(COALESCE(pa."mesasAsignadas", 0))     AS "mesasCubiertas",
            SUM(COALESCE(pa.cnt, 0))                  AS "totalTestigos"
          FROM user_puestos up
          JOIN "Puesto" p ON p.id = up.id
          LEFT JOIN puesto_asig pa ON pa."puestoId" = up.id
          GROUP BY up."municipioId"
        )
        SELECT
          m.id                                     AS "municipioId",
          m.name                                   AS "municipioNombre",
          pc."totalTestigos"                       AS "testigosCount",
          pc."totalMesas"                          AS "mesasCount",
          pc."mesasCubiertas"                      AS "mesasCubiertas",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'ALTA')  AS "altaCount",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'MEDIA') AS "mediaCount",
          COUNT(DISTINCT pp.id) FILTER (WHERE pp."nivelPrioridad" = 'BAJA')  AS "bajaCount",
          COUNT(DISTINCT pp.id) FILTER (
            WHERE pp."nivelPrioridad" = 'ALTA'
              AND COALESCE(pa2."mesasAsignadas", 0) < p2.mesas
          )                                        AS "criticosUncovered",
          MAX(t."updatedAt")                       AS "maxUpdatedAt",
          MAX(pp."updatedAt")                      AS "maxPrioridadAt",
          MAX(cfg."updatedAt")                     AS "maxConfigAt",
          MAX(cfg."ratioMesasAlta")                AS "ratioMesasAlta",
          MAX(cfg."ratioMesasMedia")               AS "ratioMesasMedia",
          MAX(cfg."ratioMesasBaja")                AS "ratioMesasBaja"
        FROM puesto_cov pc
        JOIN "Municipio" m              ON m.id            = pc."municipioId"
        LEFT JOIN user_puestos up       ON up."municipioId" = m.id
        LEFT JOIN "Puesto" p            ON p.id            = up.id
        LEFT JOIN "Testigo" t           ON t."puestoId"    = up.id
        LEFT JOIN "PuestoPrioridad" pp  ON pp."puestoId"   = up.id
        LEFT JOIN "Puesto" p2           ON p2.id           = pp."puestoId"
        LEFT JOIN puesto_asig pa2       ON pa2."puestoId"  = pp."puestoId"
        CROSS JOIN (SELECT * FROM "PrioridadConfig" LIMIT 1) cfg
        GROUP BY m.id, m.name, pc."totalTestigos", pc."totalMesas", pc."mesasCubiertas"
        ORDER BY m.name
      `);
    }

    return rows.map((r) => {
      const testigosCount = Number(r.testigosCount);
      const mesasCount = Number(r.mesasCount) || 0;
      const mesasCubiertas = Number(r.mesasCubiertas) || 0;
      const altaCount = Number(r.altaCount);
      const mediaCount = Number(r.mediaCount);
      const bajaCount = Number(r.bajaCount);
      const criticosUncovered = Number(r.criticosUncovered);

      const coberturaPct = this.coverage.computePhysicalCoverage(mesasCubiertas, mesasCount);

      return {
        municipioId: Number(r.municipioId),
        municipioNombre: r.municipioNombre,
        testigosCount,
        mesasCount,
        mesasCubiertas,
        coberturaPct,
        prioridadAltaCount: altaCount,
        prioridadMediaCount: mediaCount,
        prioridadBajaCount: bajaCount,
        criticosUncovered,
      };
    });
  }

  async getStatsMaxTimestamp(user: UserWithScopes): Promise<Date | null> {
    const isBroad =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR;

    if (isBroad) {
      const [row] = await this.prisma.$queryRaw<
        { maxTs: Date | null }[]
      >(Prisma.sql`
        SELECT GREATEST(
          MAX(t."updatedAt"),
          MAX(pp."updatedAt"),
          (SELECT "updatedAt" FROM "PrioridadConfig" LIMIT 1)
        ) AS "maxTs"
        FROM "Testigo" t
        FULL OUTER JOIN "PuestoPrioridad" pp ON true
      `);
      return row?.maxTs ?? null;
    } else {
      const [row] = await this.prisma.$queryRaw<
        { maxTs: Date | null }[]
      >(Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        user_puestos AS (
          SELECT p.id FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id FROM "Puesto" p
          INNER JOIN "UserScope" us ON us."scopeId" = p.id
          WHERE us."userId" = ${user.id} AND us."scopeType" = 'PUESTO'
        )
        SELECT GREATEST(
          MAX(t."updatedAt"),
          MAX(pp."updatedAt"),
          (SELECT "updatedAt" FROM "PrioridadConfig" LIMIT 1)
        ) AS "maxTs"
        FROM user_puestos up
        LEFT JOIN "Testigo" t ON t."puestoId" = up.id
        LEFT JOIN "PuestoPrioridad" pp ON pp."puestoId" = up.id
      `);
      return row?.maxTs ?? null;
    }
  }

  // ── T85B: GET /api/dashboard/prioridad/puestos ──────────────────────────────

  async getPrioridadPuestos(
    user: UserWithScopes,
    opts: {
      nivel?: string;
      cubierto?: boolean;
      orderBy?: 'votos' | 'nombre';
      dir?: 'asc' | 'desc';
      page?: number;
      perPage?: number;
    },
  ): Promise<{ total: number; page: number; items: PuestoPrioridadItem[] }> {
    const page = Math.max(1, opts.page ?? 1);
    const perPage = Math.min(200, Math.max(1, opts.perPage ?? 50));
    const offset = (page - 1) * perPage;
    const orderField =
      opts.orderBy === 'nombre' ? Prisma.sql`"puestoNombre"` : Prisma.sql`"votosTotal"`;
    const orderDir =
      opts.dir === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const isBroad =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR;

    const scopeCte = isBroad
      ? Prisma.sql`
        allowed_puestos AS (
          SELECT p.id AS puesto_id FROM "Puesto" p
        )
      `
      : Prisma.sql`
        user_subregions AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        allowed_puestos AS (
          SELECT p.id AS puesto_id FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id AS puesto_id FROM "Puesto" p
          INNER JOIN "UserScope" us ON us."scopeId" = p.id
          WHERE us."userId" = ${user.id} AND us."scopeType" = 'PUESTO'
        )
      `;

    // Nivel filter
    const nivelFilter =
      opts.nivel === 'ALTA' || opts.nivel === 'MEDIA' || opts.nivel === 'BAJA'
        ? Prisma.sql`AND pp."nivelPrioridad" = ${opts.nivel}`
        : Prisma.empty;

    type RawPuesto = {
      puestoId: bigint;
      puestoNombre: string;
      municipioId: bigint;
      municipioNombre: string;
      comunaId: bigint | null;
      comunaNombre: string | null;
      votosCreemos: bigint;
      votosSN: bigint;
      votosTotal: bigint;
      mesas: bigint;
      testigosAsignados: bigint;
      mesasAsignadas: bigint;
      nivelPrioridad: string;
      ratioMesasAlta: number;
      ratioMesasMedia: number;
      ratioMesasBaja: number;
      total_count: bigint;
    };

    const rows = await this.prisma.$queryRaw<RawPuesto[]>(Prisma.sql`
      WITH ${scopeCte},
      cfg AS (SELECT * FROM "PrioridadConfig" LIMIT 1),
      base AS (
        SELECT
          p.id                AS "puestoId",
          p.name              AS "puestoNombre",
          m.id                AS "municipioId",
          m.name              AS "municipioNombre",
          c.id                AS "comunaId",
          c.name              AS "comunaNombre",
          COALESCE(pp."votosCreemos", 0)  AS "votosCreemos",
          COALESCE(pp."votosSN", 0)       AS "votosSN",
          COALESCE(pp."votosTotal", 0)    AS "votosTotal",
          p.mesas             AS mesas,
          COUNT(t.id)         AS "testigosAsignados",
          COALESCE(SUM(CASE WHEN t."mesaInicial" IS NOT NULL
                            THEN t."mesaFinal" - t."mesaInicial" + 1 ELSE 0 END), 0) AS "mesasAsignadas",
          COALESCE(pp."nivelPrioridad", 'BAJA') AS "nivelPrioridad",
          cfg."ratioMesasAlta"   AS "ratioMesasAlta",
          cfg."ratioMesasMedia"  AS "ratioMesasMedia",
          cfg."ratioMesasBaja"   AS "ratioMesasBaja"
        FROM allowed_puestos ap
        JOIN "Puesto" p             ON p.id           = ap.puesto_id
        JOIN "Municipio" m          ON m.id           = p."municipioId"
        LEFT JOIN "Comuna" c        ON c.id           = p."comunaId"
        LEFT JOIN "PuestoPrioridad" pp ON pp."puestoId" = p.id
        LEFT JOIN "Testigo" t       ON t."puestoId"   = p.id
        CROSS JOIN cfg
        GROUP BY p.id, p.name, m.id, m.name, c.id, c.name,
                 pp."votosCreemos", pp."votosSN", pp."votosTotal",
                 pp."nivelPrioridad",
                 cfg."ratioMesasAlta", cfg."ratioMesasMedia", cfg."ratioMesasBaja"
        HAVING TRUE ${nivelFilter}
      ),
      counted AS (
        SELECT *, COUNT(*) OVER() AS total_count FROM base
      )
      SELECT * FROM counted
      ORDER BY ${orderField} ${orderDir}
      LIMIT ${perPage} OFFSET ${offset}
    `);

    const total = rows.length > 0 ? Number(rows[0].total_count) : 0;

    const items: PuestoPrioridadItem[] = rows.map((r) => {
      const nivel = r.nivelPrioridad;
      const mesas = Number(r.mesas);
      const testigosAsignados = Number(r.testigosAsignados);
      const mesasAsignadas = Number(r.mesasAsignadas);
      const ratioAlta = Number(r.ratioMesasAlta);
      const ratioMedia = Number(r.ratioMesasMedia);
      const ratioBaja = Number(r.ratioMesasBaja);
      const votosTotal = Number(r.votosTotal);

      // testigosRequeridos kept for display (ratio-based); not used for estado (A16).
      const testigosRequeridos = Math.ceil(
        mesas * (nivel === 'ALTA' ? ratioAlta : nivel === 'MEDIA' ? ratioMedia : ratioBaja),
      );
      const pct = this.coverage.computePhysicalCoverage(mesasAsignadas, mesas);
      const estado = this.coverage.computeEstado(nivel, votosTotal, mesasAsignadas, mesas);

      const cubierto = mesasAsignadas >= mesas;
      if (opts.cubierto !== undefined && opts.cubierto !== cubierto) {
        return null as unknown as PuestoPrioridadItem;
      }

      return {
        puestoId: Number(r.puestoId),
        puestoNombre: r.puestoNombre,
        municipioId: Number(r.municipioId),
        municipioNombre: r.municipioNombre,
        comunaId: r.comunaId ? Number(r.comunaId) : null,
        comunaNombre: r.comunaNombre ?? null,
        votosCreemos: Number(r.votosCreemos),
        votosSN: Number(r.votosSN),
        votosTotal,
        mesas,
        testigosAsignados,
        testigosRequeridos,
        nivelPrioridad: nivel,
        estado,
        coberturaPct: pct,
      };
    }).filter(Boolean);

    return { total, page, items };
  }

  // ── T85C: GET /api/dashboard/prioridad/mapa ──────────────────────────────────

  async getPrioridadMapa(user: UserWithScopes): Promise<MapaPuesto[]> {
    const isBroad =
      user.role === Role.SUPER_ADMIN ||
      user.role === Role.REGIONAL_COORDINATOR;

    type RawMapa = {
      puestoId: bigint;
      nombre: string;
      lat: number;
      lng: number;
      nivelPrioridad: string;
      votosTotal: bigint;
      mesas: bigint;
      testigosAsignados: bigint;
      mesasAsignadas: bigint;
      municipioId: bigint;
      ratioMesasAlta: number;
      ratioMesasMedia: number;
      ratioMesasBaja: number;
    };

    let rows: RawMapa[];

    if (isBroad) {
      rows = await this.prisma.$queryRaw<RawMapa[]>(Prisma.sql`
        SELECT
          p.id                AS "puestoId",
          p.name              AS nombre,
          p.lat, p.lng,
          COALESCE(pp."nivelPrioridad", 'BAJA') AS "nivelPrioridad",
          COALESCE(pp."votosTotal", 0)           AS "votosTotal",
          p.mesas,
          COUNT(t.id)        AS "testigosAsignados",
          COALESCE(SUM(CASE WHEN t."mesaInicial" IS NOT NULL
                            THEN t."mesaFinal" - t."mesaInicial" + 1 ELSE 0 END), 0) AS "mesasAsignadas",
          p."municipioId",
          cfg."ratioMesasAlta",
          cfg."ratioMesasMedia",
          cfg."ratioMesasBaja"
        FROM "Puesto" p
        LEFT JOIN "PuestoPrioridad" pp ON pp."puestoId" = p.id
        LEFT JOIN "Testigo" t          ON t."puestoId"  = p.id
        CROSS JOIN (SELECT * FROM "PrioridadConfig" LIMIT 1) cfg
        GROUP BY p.id, p.name, p.lat, p.lng, pp."nivelPrioridad", pp."votosTotal",
                 p.mesas, p."municipioId",
                 cfg."ratioMesasAlta", cfg."ratioMesasMedia", cfg."ratioMesasBaja"
      `);
    } else {
      rows = await this.prisma.$queryRaw<RawMapa[]>(Prisma.sql`
        WITH user_subregions AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'SUBREGION'
        ),
        user_municipios AS (
          SELECT m.id FROM "Municipio" m
          WHERE m."subregionId" IN (SELECT "scopeId" FROM user_subregions)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'MUNICIPIO'
        ),
        user_zonas AS (
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'ZONA'
        ),
        user_comunas AS (
          SELECT c.id FROM "Comuna" c
          WHERE c."municipioId" IN (SELECT id FROM user_municipios)
             OR c."zonaId"      IN (SELECT "scopeId" FROM user_zonas)
          UNION
          SELECT "scopeId" FROM "UserScope"
          WHERE "userId" = ${user.id} AND "scopeType" = 'COMUNA'
        ),
        allowed_puestos AS (
          SELECT p.id FROM "Puesto" p
          WHERE p."municipioId" IN (SELECT id FROM user_municipios)
             OR p."comunaId"    IN (SELECT id FROM user_comunas)
          UNION
          SELECT p.id FROM "Puesto" p
          INNER JOIN "UserScope" us ON us."scopeId" = p.id
          WHERE us."userId" = ${user.id} AND us."scopeType" = 'PUESTO'
        )
        SELECT
          p.id                AS "puestoId",
          p.name              AS nombre,
          p.lat, p.lng,
          COALESCE(pp."nivelPrioridad", 'BAJA') AS "nivelPrioridad",
          COALESCE(pp."votosTotal", 0)           AS "votosTotal",
          p.mesas,
          COUNT(t.id)        AS "testigosAsignados",
          COALESCE(SUM(CASE WHEN t."mesaInicial" IS NOT NULL
                            THEN t."mesaFinal" - t."mesaInicial" + 1 ELSE 0 END), 0) AS "mesasAsignadas",
          p."municipioId",
          cfg."ratioMesasAlta",
          cfg."ratioMesasMedia",
          cfg."ratioMesasBaja"
        FROM allowed_puestos ap
        JOIN "Puesto" p              ON p.id           = ap.id
        LEFT JOIN "PuestoPrioridad" pp ON pp."puestoId" = p.id
        LEFT JOIN "Testigo" t          ON t."puestoId"  = p.id
        CROSS JOIN (SELECT * FROM "PrioridadConfig" LIMIT 1) cfg
        GROUP BY p.id, p.name, p.lat, p.lng, pp."nivelPrioridad", pp."votosTotal",
                 p.mesas, p."municipioId",
                 cfg."ratioMesasAlta", cfg."ratioMesasMedia", cfg."ratioMesasBaja"
      `);
    }

    return rows.map((r) => {
      const nivel = r.nivelPrioridad;
      const mesas = Number(r.mesas);
      const testigosAsignados = Number(r.testigosAsignados);
      const mesasAsignadas = Number(r.mesasAsignadas);
      const votosTotal = Number(r.votosTotal);
      const testigosRequeridos = Math.ceil(
        mesas * (nivel === 'ALTA' ? Number(r.ratioMesasAlta) : nivel === 'MEDIA' ? Number(r.ratioMesasMedia) : Number(r.ratioMesasBaja)),
      );
      const estado = this.coverage.computeEstado(nivel, votosTotal, mesasAsignadas, mesas);

      return {
        puestoId: Number(r.puestoId),
        nombre: r.nombre,
        lat: r.lat,
        lng: r.lng,
        estado,
        votosTotal,
        mesas,
        testigosAsignados,
        testigosRequeridos,
        municipioId: Number(r.municipioId),
      };
    });
  }

  // ── T85D: Admin config ───────────────────────────────────────────────────────

  async getPrioridadConfig(): Promise<PrioridadConfigDto> {
    const rows = await this.prisma.$queryRaw<PrioridadConfigDto[]>(
      Prisma.sql`SELECT * FROM "PrioridadConfig" ORDER BY id LIMIT 1`,
    );
    if (!rows.length) throw new Error('PrioridadConfig not found');
    return rows[0];
  }

  async updatePrioridadConfig(
    dto: Partial<Pick<PrioridadConfigDto, 'umbralAlto' | 'umbralMedio' | 'ratioMesasAlta' | 'ratioMesasMedia' | 'ratioMesasBaja'>>,
    actorId: number,
  ): Promise<PrioridadConfigDto> {
    const existing = await this.getPrioridadConfig();

    const umbralAlto     = dto.umbralAlto     ?? existing.umbralAlto;
    const umbralMedio    = dto.umbralMedio    ?? existing.umbralMedio;
    const ratioMesasAlta = dto.ratioMesasAlta ?? existing.ratioMesasAlta;
    const ratioMesasMedia = dto.ratioMesasMedia ?? existing.ratioMesasMedia;
    const ratioMesasBaja = dto.ratioMesasBaja ?? existing.ratioMesasBaja;

    const [updated] = await this.prisma.$queryRaw<PrioridadConfigDto[]>(Prisma.sql`
      UPDATE "PrioridadConfig"
      SET
        "umbralAlto"      = ${umbralAlto},
        "umbralMedio"     = ${umbralMedio},
        "ratioMesasAlta"  = ${ratioMesasAlta},
        "ratioMesasMedia" = ${ratioMesasMedia},
        "ratioMesasBaja"  = ${ratioMesasBaja},
        "updatedAt"       = NOW(),
        "updatedById"     = ${actorId}
      WHERE id = ${existing.id}
      RETURNING *
    `);

    // Background: recompute nivelPrioridad for all puestos
    void this.recomputeAllNiveles(updated);

    return updated;
  }

  private async recomputeAllNiveles(config: {
    umbralAlto: number;
    umbralMedio: number;
  }): Promise<void> {
    // Single UPDATE statement — efficient for ~1,200 rows
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE "PuestoPrioridad"
      SET "nivelPrioridad" = CASE
        WHEN "votosTotal" > ${config.umbralAlto}  THEN 'ALTA'
        WHEN "votosTotal" > ${config.umbralMedio} THEN 'MEDIA'
        ELSE 'BAJA'
      END,
      "updatedAt" = NOW()
    `);
  }
}
