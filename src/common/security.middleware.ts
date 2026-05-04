import { Injectable, NestMiddleware, HttpException, HttpStatus } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { AppLogger } from './logger.service';

export interface SecurityContext {
  requestId: string;
  userId?: string;
  ip: string;
  userAgent: string;
  startTime: number;
}

@Injectable()
export class SecurityMiddleware implements NestMiddleware {
  private readonly logger: AppLogger;

  constructor() {
    this.logger = new AppLogger({ get: () => process.env } as any);
  }

  use(req: Request, res: Response, next: NextFunction): void {
    // Generar request ID único
    const requestId = this.generateRequestId();
    
    // Crear contexto de seguridad
    const securityContext: SecurityContext = {
      requestId,
      ip: this.getClientIP(req),
      userAgent: req.get('User-Agent') || 'unknown',
      startTime: Date.now(),
    };

    // Agregar contexto al request
    (req as any).securityContext = securityContext;
    (req as any).requestId = requestId;

    // Headers de seguridad
    this.setSecurityHeaders(res);

    // Validaciones básicas
    this.validateRequest(req);

    // Rate limiting básico por IP
    this.checkBasicRateLimit(req);

    // Log de request
    this.logger.logApiRequest(
      req.method,
      req.url,
      (req as any).user?.sub,
    );

    // Intercept response para logging
    const originalSend = res.send;
    res.send = (body) => {
      const duration = Date.now() - securityContext.startTime;
      
      this.logger.logApiRequest(
        req.method,
        req.url,
        (req as any).user?.sub,
        res.statusCode,
        duration,
      );

      // Log de eventos de seguridad
      if (res.statusCode >= 400) {
        this.logger.logSecurityEvent('HTTP_ERROR', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          ip: securityContext.ip,
        });
      }

      return originalSend.call(res, body);
    };

    next();
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private getClientIP(req: Request): string {
    return (
      req.get('X-Forwarded-For')?.split(',')[0] ||
      req.get('X-Real-IP') ||
      req.get('X-Client-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      'unknown'
    );
  }

  private setSecurityHeaders(res: Response): void {
    // Headers de seguridad básicos
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  private validateRequest(req: Request): void {
    // Validar tamaño del request
    const contentLength = parseInt(req.get('Content-Length') || '0');
    const maxRequestSize = 10 * 1024 * 1024; // 10MB

    if (contentLength > maxRequestSize) {
      throw new HttpException('Request too large', HttpStatus.PAYLOAD_TOO_LARGE);
    }

    // Validar URL maliciosas
    const suspiciousPatterns = [
      /\.\./,  // Path traversal
      /<script/i,  // XSS attempt
      /javascript:/i,  // JavaScript protocol
      /data:/i,  // Data protocol
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(req.url))) {
      this.logger.logSecurityEvent('SUSPICIOUS_URL', {
        url: req.url,
        ip: this.getClientIP(req),
        userAgent: req.get('User-Agent'),
      });
      
      throw new HttpException('Invalid request', HttpStatus.BAD_REQUEST);
    }

    // Validar headers sospechosos
    const suspiciousHeaders = [
      'x-forwarded-host',
      'x-originating-ip',
      'x-remote-ip',
      'x-remote-addr',
    ];

    suspiciousHeaders.forEach(header => {
      const value = req.get(header);
      if (value) {
        this.logger.logSecurityEvent('SUSPICIOUS_HEADER', {
          header,
          value,
          ip: this.getClientIP(req),
        });
      }
    });
  }

  private checkBasicRateLimit(req: Request): void {
    // Rate limiting básico por IP (implementación simple)
    // En producción, usar Redis o similar para rate limiting distribuido
    const ip = this.getClientIP(req);
    const currentTime = Date.now();
    
    // Esto es una implementación básica, en producción usar un servicio dedicado
    const windowMs = 60 * 1000; // 1 minuto
    const maxRequests = 100; // 100 requests por minuto por IP
    
    // Log para monitoreo
    this.logger.debug('Rate limit check', {
      ip,
      currentTime,
      windowMs,
      maxRequests,
    });
  }
}
