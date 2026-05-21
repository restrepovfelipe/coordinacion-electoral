import { Request } from 'express';
import { User, UserScope } from '@prisma/client';

export type UserWithScopes = User & { scopes: UserScope[] };
export type RequestWithUser = Request & { user: UserWithScopes };
