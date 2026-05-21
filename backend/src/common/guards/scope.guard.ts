import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ScopeType } from '@prisma/client';
import { PermissionsService } from '../../permissions/permissions.service.js';
import { RequestWithUser } from '../types/request-with-user.js';

interface RequireScopeMeta {
  scopeType: ScopeType;
  paramName: string;
}

@Injectable()
export class ScopeGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const meta = this.reflector.getAllAndOverride<RequireScopeMeta | undefined>(
      'require-scope',
      [context.getHandler(), context.getClass()],
    );

    if (!meta) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const rawId =
      (req.params[meta.paramName] as string | undefined) ??
      (req.body as Record<string, unknown>)[meta.paramName];

    const scopeId = Number(rawId);

    return this.permissions.canAccess(req.user, meta.scopeType, scopeId);
  }
}
