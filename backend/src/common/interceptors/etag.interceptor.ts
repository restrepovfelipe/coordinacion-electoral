import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { EMPTY, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import type { Request, Response } from 'express';

@Injectable()
export class ETagInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    return next.handle().pipe(
      switchMap((data: unknown) => {
        const body = JSON.stringify(data);
        const etag = `"${createHash('sha1').update(body).digest('hex')}"`;

        res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
        res.setHeader('ETag', etag);

        if (req.headers['if-none-match'] === etag) {
          res.status(304).end();
          return EMPTY;
        }

        return of(data);
      }),
    );
  }
}
