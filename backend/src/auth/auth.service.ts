import { Injectable } from '@nestjs/common';
import { Role } from '@prisma/client';
import { FirebaseAdminService } from '../common/firebase/firebase-admin.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserWithScopes } from '../common/types/request-with-user.js';

type MeResponse = {
  id: number;
  username: string;
  displayName: string;
  phone: string | null;
  role: Role;
  mustChangePassword: boolean;
  scopes: UserWithScopes['scopes'];
};

@Injectable()
export class AuthService {
  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  getMe(user: UserWithScopes): MeResponse {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      phone: user.phone,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
      scopes: user.scopes,
    };
  }

  async passwordChanged(user: UserWithScopes, newPassword: string, auditIp?: string): Promise<void> {
    // Admin SDK bypasses the "requires-recent-login" restriction on the client SDK
    await this.firebaseAdmin.auth.updateUser(user.cipUid, { password: newPassword });
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { mustChangePassword: false },
      }),
      this.prisma.auditLog.create({
        data: {
          actorUserId: user.id,
          action: 'auth.password-changed',
          targetType: 'User',
          targetId: user.id,
          ip: auditIp ?? null,
        },
      }),
    ]);
  }

  async logout(user: UserWithScopes): Promise<void> {
    await this.firebaseAdmin.auth.revokeRefreshTokens(user.cipUid);

    await this.prisma.auditLog.create({
      data: {
        actorUserId: user.id,
        action: 'auth.logout',
        targetType: 'User',
        targetId: user.id,
      },
    });
  }
}
