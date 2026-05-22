import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { DashboardService } from './dashboard.service.js';
import { AuthGuard } from '../common/guards/auth.guard.js';
import type { RequestWithUser } from '../common/types/request-with-user.js';

@Controller('dashboard')
@UseGuards(AuthGuard)
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('testigos-counts')
  async getTestigoCounts(
    @Req() req: RequestWithUser,
    @Res() res: Response,
  ): Promise<void> {
    const { data, maxUpdatedAt } = await this.dashboard.getTestigoCounts(
      req.user,
    );

    // ETag derived from the latest mutation timestamp in the user's accessible scope.
    const etag = `"${maxUpdatedAt ? maxUpdatedAt.getTime().toString(36) : '0'}"`;

    res.setHeader('Cache-Control', 'public, max-age=30, must-revalidate');
    res.setHeader('ETag', etag);

    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    res.json(data);
  }
}
