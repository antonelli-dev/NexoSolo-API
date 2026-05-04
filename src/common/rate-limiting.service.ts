import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { AppLogger } from './logger.service';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
  keyGenerator?: (req: any) => string;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

@Injectable()
export class RateLimitingService {
  private readonly logger: AppLogger;
  private readonly store = new Map<string, { hits: number; resetTime: number }>();

  constructor() {
    this.logger = new AppLogger({ get: () => process.env } as any);
  }

  async checkRateLimit(
    req: any,
    config: RateLimitConfig,
  ): Promise<RateLimitResult> {
    const key = config.keyGenerator ? config.keyGenerator(req) : this.generateKey(req);
    const now = Date.now();
    
    // Limpiar entradas expiradas
    this.cleanupExpiredEntries(now);

    // Obtener o crear entrada
    let entry = this.store.get(key);
    if (!entry || now > entry.resetTime) {
      entry = { hits: 0, resetTime: now + config.windowMs };
      this.store.set(key, entry);
    }

    // Incrementar hits
    entry.hits++;

    // Determinar si se permite el request
    const allowed = entry.hits <= config.maxRequests;
    const remaining = Math.max(0, config.maxRequests - entry.hits);

    const result: RateLimitResult = {
      allowed,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.hits,
    };

    // Log de rate limiting
    if (!allowed) {
      this.logger.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        key,
        hits: entry.hits,
        maxRequests: config.maxRequests,
        windowMs: config.windowMs,
        resetTime: entry.resetTime,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        url: req.url,
        method: req.method,
      });
    }

    return result;
  }

  private generateKey(req: any): string {
    // Prioridad: userId > IP > User-Agent
    const userId = req.user?.sub;
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    
    if (userId) {
      return `user:${userId}`;
    }
    
    return `ip:${ip}:${userAgent}`;
  }

  private cleanupExpiredEntries(now: number): void {
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  // Pre-configuraciones para diferentes endpoints
  private readonly configs: Record<string, RateLimitConfig> = {
    // Endpoints críticos - más restrictivos
    auth: {
      windowMs: 15 * 60 * 1000, // 15 minutos
      maxRequests: 5, // 5 intentos de login
      skipSuccessfulRequests: false,
      skipFailedRequests: false,
    },
    
    // Endpoints de creación - moderados
    create: {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 10, // 10 creaciones por minuto
    },
    
    // Endpoints de lectura - más permisivos
    read: {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 100, // 100 lecturas por minuto
    },
    
    // Endpoints de escritura - moderados
    write: {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 50, // 50 escrituras por minuto
    },
    
    // Webhooks - especiales
    webhook: {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 1000, // 1000 webhooks por minuto (para RevenueCat)
    },
    
    // Default - balanceado
    default: {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 60, // 60 requests por minuto
    },
  };

  getConfigForEndpoint(method: string, url: string): RateLimitConfig {
    // Detectar tipo de endpoint basado en método y URL
    const lowerUrl = url.toLowerCase();
    
    // Auth endpoints
    if (lowerUrl.includes('/auth/') || lowerUrl.includes('/login')) {
      return this.configs.auth;
    }
    
    // Webhook endpoints
    if (lowerUrl.includes('/webhook/')) {
      return this.configs.webhook;
    }
    
    // Create endpoints
    if (['POST', 'PUT'].includes(method) && 
        (lowerUrl.includes('/create') || lowerUrl.includes('/add'))) {
      return this.configs.create;
    }
    
    // Read endpoints
    if (method === 'GET') {
      return this.configs.read;
    }
    
    // Write endpoints
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
      return this.configs.write;
    }
    
    return this.configs.default;
  }

  // Rate limiting por usuario (para planes premium)
  async checkUserRateLimit(
    userId: string,
    endpoint: string,
    userTier: 'free' | 'pro' | 'business',
  ): Promise<RateLimitResult> {
    const tierMultipliers = {
      free: 1,
      pro: 2,
      business: 5,
    };
    
    const baseConfig = this.configs.default;
    const multiplier = tierMultipliers[userTier];
    
    const config: RateLimitConfig = {
      ...baseConfig,
      maxRequests: baseConfig.maxRequests * multiplier,
      keyGenerator: () => `user:${userId}:${endpoint}`,
    };
    
    return this.checkRateLimit({ user: { sub: userId } }, config);
  }

  // Rate limiting por IP (para protección contra DDoS)
  async checkIPRateLimit(ip: string): Promise<RateLimitResult> {
    const config: RateLimitConfig = {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 200, // 200 requests por minuto por IP
      keyGenerator: () => `ip:${ip}`,
    };
    
    return this.checkRateLimit({ ip }, config);
  }

  // Rate limiting global (para protección del servidor)
  async checkGlobalRateLimit(): Promise<RateLimitResult> {
    const config: RateLimitConfig = {
      windowMs: 60 * 1000, // 1 minuto
      maxRequests: 10000, // 10,000 requests por minuto globales
      keyGenerator: () => 'global',
    };
    
    return this.checkRateLimit({}, config);
  }

  // Estadísticas de rate limiting
  getStats(): {
    totalEntries: number;
    entriesByType: Record<string, number>;
    oldestEntry: number;
    newestEntry: number;
  } {
    const entries = Array.from(this.store.entries());
    const now = Date.now();
    
    const entriesByType = entries.reduce((acc, [key, entry]) => {
      const type = key.split(':')[0];
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const resetTimes = entries.map(([, entry]) => entry.resetTime);
    
    return {
      totalEntries: entries.length,
      entriesByType,
      oldestEntry: Math.min(...resetTimes),
      newestEntry: Math.max(...resetTimes),
    };
  }

  // Limpiar todas las entradas
  clear(): void {
    this.store.clear();
    this.logger.log('Rate limiting store cleared');
  }

  // Limpiar entradas expiradas
  cleanup(): void {
    this.cleanupExpiredEntries(Date.now());
  }
}
