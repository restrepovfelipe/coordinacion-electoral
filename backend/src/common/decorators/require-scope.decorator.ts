import { SetMetadata } from '@nestjs/common';
import { ScopeType } from '@prisma/client';

export const RequireScope = (scopeType: ScopeType, paramName: string) =>
  SetMetadata('require-scope', { scopeType, paramName });
