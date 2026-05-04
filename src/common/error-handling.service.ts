import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AppLogger } from './logger.service';

export interface ErrorContext {
  userId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  url?: string;
  body?: any;
  query?: any;
  params?: any;
  timestamp?: number;
}

export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: any;
    timestamp: string;
    requestId?: string;
    path?: string;
  };
}

@Injectable()
export class ErrorHandlingService {
  private readonly logger: AppLogger;

  constructor() {
    this.logger = new AppLogger({ get: () => process.env } as any);
  }

  // Manejo principal de errores
  handleError(error: Error, context: ErrorContext): ErrorResponse {
    const errorResponse = this.createErrorResponse(error, context);
    
    // Log del error
    this.logError(error, context, errorResponse);
    
    // Reportar a servicios externos (en producción)
    if (process.env.NODE_ENV === 'production') {
      this.reportError(error, context, errorResponse);
    }

    return errorResponse;
  }

  // Crear respuesta de error estandarizada
  private createErrorResponse(error: Error, context: ErrorContext): ErrorResponse {
    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode = 'INTERNAL_SERVER_ERROR';
    let message = 'An unexpected error occurred';
    let details: any = undefined;

    // Manejar diferentes tipos de errores
    if (error instanceof HttpException) {
      statusCode = error.getStatus();
      const response = error.getResponse();
      
      if (typeof response === 'object' && response !== null) {
        message = (response as any).message || message;
        details = (response as any).details;
      } else {
        message = response as string || message;
      }
      
      errorCode = this.getErrorCodeFromStatus(statusCode);
    } else if (error instanceof Error) {
      // Errores específicos de la aplicación
      if (error.name === 'ValidationError') {
        statusCode = HttpStatus.BAD_REQUEST;
        errorCode = 'VALIDATION_ERROR';
        message = 'Validation failed';
        details = error.message;
      } else if (error.name === 'UnauthorizedError') {
        statusCode = HttpStatus.UNAUTHORIZED;
        errorCode = 'UNAUTHORIZED';
        message = 'Unauthorized access';
      } else if (error.name === 'ForbiddenError') {
        statusCode = HttpStatus.FORBIDDEN;
        errorCode = 'FORBIDDEN';
        message = 'Access forbidden';
      } else if (error.name === 'NotFoundError') {
        statusCode = HttpStatus.NOT_FOUND;
        errorCode = 'NOT_FOUND';
        message = 'Resource not found';
      } else if (error.name === 'ConflictError') {
        statusCode = HttpStatus.CONFLICT;
        errorCode = 'CONFLICT';
        message = 'Resource conflict';
      } else if (error.name === 'TooManyRequestsError') {
        statusCode = HttpStatus.TOO_MANY_REQUESTS;
        errorCode = 'TOO_MANY_REQUESTS';
        message = 'Too many requests';
      } else if (error.name === 'TimeoutError') {
        statusCode = HttpStatus.REQUEST_TIMEOUT;
        errorCode = 'TIMEOUT';
        message = 'Request timeout';
      } else if (error.name === 'DatabaseError') {
        statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
        errorCode = 'DATABASE_ERROR';
        message = 'Database operation failed';
      } else if (error.name === 'ExternalServiceError') {
        statusCode = HttpStatus.BAD_GATEWAY;
        errorCode = 'EXTERNAL_SERVICE_ERROR';
        message = 'External service error';
      }
    }

    // Ocultar detalles sensibles en producción
    if (process.env.NODE_ENV === 'production') {
      details = this.sanitizeErrorDetails(details);
    }

    return {
      success: false,
      error: {
        code: errorCode,
        message,
        details,
        timestamp: new Date().toISOString(),
        requestId: context.requestId,
        path: context.url,
      },
    };
  }

  // Obtener código de error basado en status HTTP
  private getErrorCodeFromStatus(status: number): string {
    const statusToCode: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_SERVER_ERROR',
      502: 'BAD_GATEWAY',
      503: 'SERVICE_UNAVAILABLE',
      504: 'GATEWAY_TIMEOUT',
    };

    return statusToCode[status] || 'INTERNAL_SERVER_ERROR';
  }

  // Sanitizar detalles del error para producción
  private sanitizeErrorDetails(details: any): any {
    if (!details) return undefined;

    // Ocultar información sensible
    const sensitiveKeys = [
      'password', 'token', 'secret', 'key', 'apiKey', 'authorization',
      'stack', 'database', 'query', 'sql', 'connection'
    ];

    if (typeof details === 'object') {
      const sanitized = { ...details };
      
      for (const key of sensitiveKeys) {
        if (sanitized[key]) {
          sanitized[key] = '****';
        }
      }

      return sanitized;
    }

    // Si es string, ocultar información sensible
    if (typeof details === 'string') {
      return details.replace(/password|token|secret|key|apiKey|authorization/gi, '****');
    }

    return details;
  }

  // Log del error con contexto completo
  private logError(error: Error, context: ErrorContext, errorResponse: ErrorResponse): void {
    this.logger.logError(error, {
      requestId: context.requestId,
      userId: context.userId,
      ip: context.ip,
      userAgent: context.userAgent,
      method: context.method,
      url: context.url,
      statusCode: typeof errorResponse.error.code === 'number' ? errorResponse.error.code : 500,
      errorType: error.constructor.name,
      errorMessage: error.message,
      errorStack: error.stack,
      body: context.body,
      query: context.query,
      params: context.params,
    });
  }

  // Reportar error a servicios externos
  private reportError(error: Error, context: ErrorContext, errorResponse: ErrorResponse): void {
    // En producción, enviar a servicios como:
    // - Sentry (error tracking)
    // - DataDog (monitoring)
    // - Slack/Discord (alertas)
    
    const reportData = {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
      },
      context,
      response: errorResponse,
      environment: process.env.NODE_ENV,
      service: 'rizzup-api',
      version: process.env.APP_VERSION || '1.0.0',
    };

    // Implementar integración con servicios externos
    this.sendToSentry(reportData);
    this.sendToSlack(reportData);
  }

  // Enviar a Sentry
  private sendToSentry(reportData: any): void {
    // Implementar integración con Sentry
    // @sentry/node
    try {
      // Sentry.captureException(reportData.error, {
      //   tags: {
      //     service: reportData.service,
      //     version: reportData.version,
      //   },
      //   extra: reportData.context,
      // });
    } catch (e) {
      this.logger.logError(e as Error, { 
        action: 'send_to_sentry_failed',
        originalError: reportData.error.message 
      });
    }
  }

  // Enviar a Slack
  private sendToSlack(reportData: any): void {
    // Implementar integración con Slack webhooks
    if (!process.env.SLACK_WEBHOOK_URL) return;

    try {
      const slackMessage = {
        text: `Error in ${reportData.service}`,
        attachments: [{
          color: 'danger',
          fields: [
            { title: 'Error', value: reportData.error.message, short: false },
            { title: 'Type', value: reportData.error.name, short: true },
            { title: 'Status', value: reportData.response.error.code, short: true },
            { title: 'User ID', value: reportData.context.userId || 'N/A', short: true },
            { title: 'IP', value: reportData.context.ip || 'N/A', short: true },
            { title: 'URL', value: reportData.context.url || 'N/A', short: true },
          ],
          ts: Math.floor(Date.now() / 1000) as number,
        }],
      };

      // Enviar a Slack usando fetch
      // fetch(process.env.SLACK_WEBHOOK_URL, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(slackMessage),
      // });
    } catch (e) {
      this.logger.logError(e as Error, { 
        action: 'send_to_slack_failed',
        originalError: reportData.error.message 
      });
    }
  }

  // Crear errores específicos de la aplicación
  static createValidationError(message: string, details?: any): Error {
    const error = new Error(message) as any;
    error.name = 'ValidationError';
    error.details = details;
    return error;
  }

  static createUnauthorizedError(message: string = 'Unauthorized'): Error {
    const error = new Error(message) as any;
    error.name = 'UnauthorizedError';
    return error;
  }

  static createForbiddenError(message: string = 'Forbidden'): Error {
    const error = new Error(message) as any;
    error.name = 'ForbiddenError';
    return error;
  }

  static createNotFoundError(resource: string): Error {
    const error = new Error(`${resource} not found`) as any;
    error.name = 'NotFoundError';
    return error;
  }

  static createConflictError(message: string): Error {
    const error = new Error(message) as any;
    error.name = 'ConflictError';
    return error;
  }

  static createTooManyRequestsError(message: string = 'Too many requests'): Error {
    const error = new Error(message) as any;
    error.name = 'TooManyRequestsError';
    return error;
  }

  static createTimeoutError(message: string = 'Request timeout'): Error {
    const error = new Error(message) as any;
    error.name = 'TimeoutError';
    return error;
  }

  static createDatabaseError(message: string, originalError?: Error): Error {
    const error = new Error(message) as any;
    error.name = 'DatabaseError';
    error.originalError = originalError;
    return error;
  }

  static createExternalServiceError(service: string, message: string): Error {
    const error = new Error(`${service}: ${message}`) as any;
    error.name = 'ExternalServiceError';
    error.service = service;
    return error;
  }

  // Wrapper para funciones asíncronas con manejo de errores
  static async withErrorHandling<T>(
    fn: () => Promise<T>,
    context: ErrorContext,
    errorHandlingService: ErrorHandlingService,
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const errorResponse = errorHandlingService.handleError(error as Error, context);
      throw new HttpException(
        errorResponse,
        this.getStatusCodeFromErrorCode(errorResponse.error.code),
      );
    }
  }

  private static getStatusCodeFromErrorCode(code: string): number {
    const codeToStatus: Record<string, number> = {
      'BAD_REQUEST': 400,
      'UNAUTHORIZED': 401,
      'FORBIDDEN': 403,
      'NOT_FOUND': 404,
      'CONFLICT': 409,
      'UNPROCESSABLE_ENTITY': 422,
      'TOO_MANY_REQUESTS': 429,
      'INTERNAL_SERVER_ERROR': 500,
      'BAD_GATEWAY': 502,
      'SERVICE_UNAVAILABLE': 503,
      'GATEWAY_TIMEOUT': 504,
    };

    return codeToStatus[code] || 500;
  }
}
