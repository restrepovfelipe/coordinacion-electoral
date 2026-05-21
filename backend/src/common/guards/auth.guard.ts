import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestWithUser } from '../types/request-with-user.js';

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !/^bearer /i.test(authHeader)) {
      throw new UnauthorizedException();
    }

    const token = authHeader.slice(7);

    let decoded: Awaited<ReturnType<typeof this.firebaseAdmin.auth.verifyIdToken>>;
    try {
      decoded = await this.firebaseAdmin.auth.verifyIdToken(token);
    } catch {
      throw new UnauthorizedException();
    }

    const nowSeconds = Date.now() / 1000;
    if (nowSeconds - decoded.auth_time > 3600) {
      throw new UnauthorizedException('SESSION_EXPIRED');
    }

    const user = await this.prisma.user.findUnique({
      where: { cipUid: decoded.uid },
      include: { scopes: true },
    });

    if (!user || !user.active) {
      throw new UnauthorizedException();
    }

    req.user = user;
    return true;
  }
}
