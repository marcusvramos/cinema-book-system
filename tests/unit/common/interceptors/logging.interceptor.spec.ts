import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { LoggingInterceptor } from '@common/interceptors/logging.interceptor';
import { Request, Response } from 'express';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let mockExecutionContext: ExecutionContext;
  let mockCallHandler: CallHandler;
  let mockRequest: { method: string; url: string; body: unknown; ip: string; get: jest.Mock };
  let mockResponse: { statusCode: number };
  let handleMock: jest.Mock;

  beforeEach(() => {
    interceptor = new LoggingInterceptor();

    mockRequest = {
      method: 'GET',
      url: '/test',
      body: {},
      ip: '127.0.0.1',
      get: jest.fn().mockReturnValue('test-user-agent'),
    };

    mockResponse = {
      statusCode: 200,
    };

    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => mockRequest as unknown as Request,
        getResponse: () => mockResponse as unknown as Response,
      }),
    } as ExecutionContext;

    handleMock = jest.fn().mockReturnValue(of({ data: 'test' }));
    mockCallHandler = {
      handle: handleMock,
    };
  });

  describe('intercept', () => {
    it('should return observable', () => {
      const result = interceptor.intercept(mockExecutionContext, mockCallHandler);

      expect(result).toBeDefined();
      expect(typeof result.subscribe).toBe('function');
    });

    it('should call next handler', (done) => {
      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          expect(handleMock).toHaveBeenCalled();
          done();
        },
      });
    });

    it('should pass through response data', (done) => {
      handleMock.mockReturnValue(of({ result: 'success' }));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: (data) => {
          expect(data).toEqual({ result: 'success' });
          done();
        },
      });
    });

    it('should handle request with body', (done) => {
      mockRequest.body = { username: 'test' };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          done();
        },
      });
    });

    it('should handle request without user-agent', (done) => {
      mockRequest.get = jest.fn().mockReturnValue(undefined);

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          done();
        },
      });
    });

    it('should handle POST request', (done) => {
      mockRequest.method = 'POST';
      mockRequest.body = { data: 'test' };

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          done();
        },
      });
    });

    it('should handle errors', (done) => {
      const error = new Error('Test error');
      handleMock.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: (err: Error) => {
          expect(err).toBe(error);
          done();
        },
      });
    });

    it('should handle error with status code', (done) => {
      const error = { status: 400, message: 'Bad request' };
      handleMock.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle error with statusCode property', (done) => {
      const error = { statusCode: 404, message: 'Not found' };
      handleMock.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle error with string status code', (done) => {
      const error = { statusCode: '500', message: 'Server error' };
      handleMock.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle error with invalid string status code', (done) => {
      const error = { statusCode: 'invalid', message: 'Error' };
      handleMock.mockReturnValue(throwError(() => error));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle null error', (done) => {
      handleMock.mockReturnValue(throwError(() => null));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle non-object error', (done) => {
      handleMock.mockReturnValue(throwError(() => 'string error'));

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        error: () => {
          done();
        },
      });
    });

    it('should handle empty body', (done) => {
      mockRequest.body = null;

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          done();
        },
      });
    });

    it('should handle array body', (done) => {
      mockRequest.body = [1, 2, 3];

      interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
        next: () => {
          done();
        },
      });
    });
  });
});
