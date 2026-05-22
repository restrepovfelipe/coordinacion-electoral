import {
  Controller,
  Get,
  Patch,
  Req,
  Res,
  UseGuards,
  Query,
  Body,
  ForbiddenException,
  Optional,
} from '@nestjs/common';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { DashboardService } from './dashboard.service.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import type { RequestWithUser } from '../common/types/request-with-user.js';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(
    private readonly dashboard: DashboardService,
    @Optional() private readonly realtime: RealtimeService,
  ) {}

  // ── Legacy: /api/dashboard/testigos-counts (Phase 13 — keep for 6 months) ──

  @Get('testigos-counts')
  async getTestigoCounts(
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    const { data, maxUpdatedAt } = await this.dashboard.getTestigoCounts(req.user);
    const etag = `"${maxUpdatedAt ? maxUpdatedAt.getTime().toString(36) : '0'}"`;
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json(data);
  }

  // ── T85A: /api/dashboard/stats ───────────────────────────────────────────────

  @Get('stats')
  async getStats(
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    const [data, maxTs] = await Promise.all([
      this.dashboard.getStats(req.user),
      this.dashboard.getStatsMaxTimestamp(req.user),
    ]);
    const etag = `"${maxTs ? maxTs.getTime().toString(36) : '0'}"`;
    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json(data);
  }

  // ── T85B: /api/dashboard/prioridad/puestos ──────────────────────────────────

  @Get('prioridad/puestos')
  async getPrioridadPuestos(
    @Req() req: RequestWithUser,
    @Query('nivel') nivel?: string,
    @Query('cubierto') cubiertoStr?: string,
    @Query('orderBy') orderBy?: string,
    @Query('dir') dir?: string,
    @Query('page') pageStr?: string,
    @Query('perPage') perPageStr?: string,
  ) {
    const cubierto =
      cubiertoStr === 'true' ? true : cubiertoStr === 'false' ? false : undefined;
    const orderByVal =
      orderBy === 'nombre' ? ('nombre' as const) : ('votos' as const);
    const dirVal = dir === 'asc' ? ('asc' as const) : ('desc' as const);

    return this.dashboard.getPrioridadPuestos(req.user, {
      nivel,
      cubierto,
      orderBy: orderByVal,
      dir: dirVal,
      page: pageStr ? parseInt(pageStr, 10) : 1,
      perPage: perPageStr ? parseInt(perPageStr, 10) : 50,
    });
  }

  // ── T85C: /api/dashboard/prioridad/mapa ──────────────────────────────────────

  @Get('prioridad/mapa')
  async getPrioridadMapa(@Req() req: RequestWithUser) {
    return this.dashboard.getPrioridadMapa(req.user);
  }
}

// ── T85D: Admin config — separate controller ──────────────────────────────────

@Controller('admin/prioridad')
@UseGuards(AuthGuard)
export class AdminPrioridadController {
  constructor(
    private readonly dashboard: DashboardService,
    @Optional() private readonly realtime: RealtimeService,
  ) {}

  @Get('config')
  async getConfig(@Req() req: RequestWithUser) {
    if (req.user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN only');
    }
    return this.dashboard.getPrioridadConfig();
  }

  @Patch('config')
  async updateConfig(
    @Req() req: RequestWithUser,
    @Body() body: {
      umbralAlto?: number;
      umbralMedio?: number;
      ratioMesasAlta?: number;
      ratioMesasMedia?: number;
      ratioMesasBaja?: number;
    },
  ) {
    if (req.user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('SUPER_ADMIN only');
    }
    const updated = await this.dashboard.updatePrioridadConfig(body, req.user.id);

    // Emit SSE event so open dashboards refetch
    if (this.realtime) {
      await this.realtime.notify({
        type: 'prioridad:config_changed',
        payload: { updatedAt: updated.updatedAt },
      });
    }

    return updated;
  }
}
