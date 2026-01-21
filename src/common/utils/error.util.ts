import { HttpException, HttpStatus } from '@nestjs/common';

export function getErrorStatus(error: unknown): number {
  if (!error || typeof error !== 'object') {
    return HttpStatus.INTERNAL_SERVER_ERROR;
  }

  if (error instanceof HttpException) {
    return error.getStatus();
  }

  const errorObj = error as { status?: unknown; statusCode?: unknown };
  const status = errorObj.status ?? errorObj.statusCode;

  if (typeof status === 'number' && Number.isFinite(status)) {
    return status;
  }

  if (typeof status === 'string') {
    const parsed = Number(status);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return HttpStatus.INTERNAL_SERVER_ERROR;
}

export function getErrorMessage(error: unknown): string | string[] {
  if (error instanceof HttpException) {
    const response = error.getResponse();
    if (typeof response === 'object' && response !== null) {
      const res = response as Record<string, unknown>;
      if (Array.isArray(res.message)) {
        return res.message as string[];
      }
      if (typeof res.message === 'string') {
        return res.message;
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return 'Internal server error';
}

export function getErrorMessageString(error: unknown): string {
  const message = getErrorMessage(error);
  return Array.isArray(message) ? message.join(', ') : message;
}

export function getHttpErrorName(status: number): string {
  const errorNames: Record<number, string> = {
    [HttpStatus.BAD_REQUEST]: 'Bad Request',
    [HttpStatus.UNAUTHORIZED]: 'Unauthorized',
    [HttpStatus.FORBIDDEN]: 'Forbidden',
    [HttpStatus.NOT_FOUND]: 'Not Found',
    [HttpStatus.CONFLICT]: 'Conflict',
    [HttpStatus.TOO_MANY_REQUESTS]: 'Too Many Requests',
    [HttpStatus.UNPROCESSABLE_ENTITY]: 'Unprocessable Entity',
  };

  return errorNames[status] || 'Internal Server Error';
}

export function getErrorName(exception: unknown, status: number): string {
  if (exception instanceof HttpException) {
    const response = exception.getResponse();
    if (typeof response === 'object' && response !== null) {
      const res = response as Record<string, unknown>;
      if (typeof res.error === 'string') {
        return res.error;
      }
    }
  }

  return getHttpErrorName(status);
}

export function isUniqueViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { code?: string }).code === '23505';
}

export function isForeignKeyViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  return (error as { code?: string }).code === '23503';
}
