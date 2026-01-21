import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Request, Response } from 'express';
import { getErrorStatus, getErrorMessageString } from '@common/utils/error.util';

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const { method, url } = request;
    const body = request.body as unknown;
    const userAgent = request.get('user-agent') || '';
    const ip = request.ip;

    const now = Date.now();

    this.logger.log(`[REQUEST] ${method} ${url} - IP: ${ip} - User-Agent: ${userAgent}`);

    const bodyPayload =
      body && typeof body === 'object' ? (body as Record<string, unknown> | unknown[]) : null;
    if (bodyPayload && Object.keys(bodyPayload).length > 0) {
      this.logger.debug(`[REQUEST BODY] ${JSON.stringify(bodyPayload)}`);
    }

    return next.handle().pipe(
      tap({
        next: (data) => {
          const response = context.switchToHttp().getResponse<Response>();
          const statusCode = response.statusCode;
          const duration = Date.now() - now;

          this.logger.log(`[RESPONSE] ${method} ${url} - ${statusCode} - ${duration}ms`);

          if (process.env.NODE_ENV === 'development' && data) {
            this.logger.debug(`[RESPONSE BODY] ${JSON.stringify(data)}`);
          }
        },
        error: (error: unknown) => {
          const duration = Date.now() - now;
          const statusCode = getErrorStatus(error);
          const message = getErrorMessageString(error);
          this.logger.error(
            `[ERROR] ${method} ${url} - ${statusCode} - ${duration}ms - ${message}`,
          );
        },
      }),
    );
  }
}
