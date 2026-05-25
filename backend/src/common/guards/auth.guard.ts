import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { FirebaseAdminService } from '../firebase/firebase-admin.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { RequestWithUser } from '../types/request-with-user.js';

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name);

  constructor(
    private readonly firebaseAdmin: FirebaseAdminService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();

    const authHeader = req.headers['authorization'];

    let token: string;
    if (authHeader && /^bearer /i.test(authHeader)) {
      token = authHeader.slice(7);
    } else {
      const queryToken = req.query?.['token'];
      if (typeof queryToken === 'string' && queryToken.length > 0) {
        token = queryToken;
      } else {
        throw new UnauthorizedException();
      }
    }

    let decoded: Awaited<ReturnType<typeof this.firebaseAdmin.auth.verifyIdToken>>;
    try {
      decoded = await this.firebaseAdmin.auth.verifyIdToken(token);
    } catch (err) {
      this.logger.error('verifyIdToken failed', err instanceof Error ? err.message : String(err));
      throw new UnauthorizedException();
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
