import { Injectable, LoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export enum LogLevel {
  ERROR = 'error',
  WARN = 'warn',
  INFO = 'info',
  DEBUG = 'debug',
}

export interface LogContext {
  userId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  method?: string;
  url?: string;
  statusCode?: number;
  duration?: number;
  error?: string;
  [key: string]: any;
}

@Injectable()
export class AppLogger implements LoggerService {
  private readonly isProduction: boolean;
  private readonly serviceName: string;

  constructor(private configService: ConfigService) {
    this.isProduction = this.configService.get('NODE_ENV') === 'production';
    this.serviceName = 'rizzup-api';
  }

  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') return data;
    
    const sensitiveFields = [
      'password', 'token', 'secret', 'key', 'apiKey', 'authorization',
      'creditCard', 'ssn', 'socialSecurityNumber', 'bankAccount',
      'email', 'phone', 'address', 'userId', 'id'
    ];

    const sanitized = { ...data };
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = this.maskSensitiveData(sanitized[field]);
      }
    }

    return sanitized;
  }

  private maskSensitiveData(value: any): string {
    const str = String(value);
    if (str.length <= 4) return '****';
    return str.substring(0, 2) + '****' + str.substring(str.length - 2);
  }

  private formatMessage(level: LogLevel, message: string, context?: LogContext): string {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      service: this.serviceName,
      message,
      ...this.sanitizeData(context),
    };

    // Handle BigInt serialization
    return JSON.stringify(logEntry, (key, value) => {
      if (typeof value === 'bigint') {
        return value.toString();
      }
      return value;
    });
  }

  error(message: string, context?: LogContext): void {
    const formattedMessage = this.formatMessage(LogLevel.ERROR, message, context);
    if (this.isProduction) {
      // En producción, enviar a servicio de logging (CloudWatch, Datadog, etc.)
      console.error(formattedMessage);
    } else {
      console.error(formattedMessage);
    }
  }

  warn(message: string, context?: LogContext): void {
    const formattedMessage = this.formatMessage(LogLevel.WARN, message, context);
    console.warn(formattedMessage);
  }

  log(message: string, context?: LogContext): void {
    const formattedMessage = this.formatMessage(LogLevel.INFO, message, context);
    console.log(formattedMessage);
  }

  debug(message: string, context?: LogContext): void {
    if (!this.isProduction) {
      const formattedMessage = this.formatMessage(LogLevel.DEBUG, message, context);
      console.debug(formattedMessage);
    }
  }

  verbose(message: string, context?: LogContext): void {
    if (!this.isProduction) {
      const formattedMessage = this.formatMessage(LogLevel.DEBUG, message, context);
      console.log(formattedMessage);
    }
  }

  // Métodos de conveniencia para operaciones específicas
  logUserAction(action: string, userId: string, context?: Partial<LogContext>): void {
    this.log(`User action: ${action}`, { userId, ...context });
  }

  logApiRequest(method: string, url: string, userId?: string, statusCode?: number, duration?: number): void {
    this.log(`API Request: ${method} ${url}`, {
      method,
      url,
      userId,
      statusCode,
      duration,
    });
  }

  logSecurityEvent(event: string, context: LogContext): void {
    this.warn(`Security Event: ${event}`, context);
  }

  logBusinessEvent(event: string, userId: string, data?: any): void {
    this.log(`Business Event: ${event}`, { userId, ...data });
  }

  logError(error: Error, context?: LogContext): void {
    this.error(error.message, {
      error: error.stack,
      ...context,
    });
  }
}

// Logger global para uso en todo el aplicación
export let logger: AppLogger;

export function initializeLogger(configService: ConfigService): void {
  logger = new AppLogger(configService);
}
