import { Injectable } from '@nestjs/common';
import { ScopeType } from '@prisma/client';
import { UserWithScopes } from '../common/types/request-with-user.js';

/**
 * Skeleton — populated in T18: transitive-scope CTE implementation.
 */
@Injectable()
export class PermissionsService {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async canAccess(
    _user: UserWithScopes,
    _scopeType: ScopeType,
    _scopeId: number,
  ): Promise<boolean> {
    throw new Error('PermissionsService.canAccess not yet implemented (T18)');
  }
}
