import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { RequestWithUser } from '../types/request-with-user';

@Injectable()
export class MustChangePasswordInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithUser>();
    const url: string = req.url ?? '';

    // Exempt: /api/auth/... AND /api/healthz
    const isExempt = url.startsWith('/api/auth/') || url === '/api/healthz';

    if (req.user?.mustChangePassword && !isExempt) {
      throw new HttpException(
        { code: 'PASSWORD_CHANGE_REQUIRED' },
        HttpStatus.PRECONDITION_FAILED,
      );
    }

    return next.handle();
  }
}
