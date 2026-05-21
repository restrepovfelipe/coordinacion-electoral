import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserWithScopes } from '../types/request-with-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): UserWithScopes => {
    return (ctx.switchToHttp().getRequest() as { user: UserWithScopes }).user;
  },
);
