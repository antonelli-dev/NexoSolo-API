import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AppLogger } from '../common/logger.service';

/// Enhanced PrismaService with connection pooling, timeouts, and retry logic
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger: AppLogger;
  private readonly maxRetries: number;
  private readonly retryDelay: number;
  private readonly queryTimeout: number;

  constructor(configService: ConfigService) {
    const databaseUrl = configService.get<string>('DATABASE_URL');
    const isProduction = configService.get('NODE_ENV') === 'production';
    
    super({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
      log: isProduction ? ['error', 'warn'] : ['query', 'info', 'warn', 'error'],
      // Global error handling
      errorFormat: 'pretty',
    });

    this.logger = new AppLogger(configService);
    this.maxRetries = 3;
    this.retryDelay = 1000; // 1 second
    this.queryTimeout = 30000; // 30 seconds
  }

  async onModuleInit(): Promise<void> {
    try {
      // Test database connection
      await this.$connect();
      this.logger.log('Database connected successfully');
      
      // Run health check
      await this.healthCheck();
      
    } catch (error) {
      this.logger.logError(error as Error, { action: 'database_connection_failed' });
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
      this.logger.log('Database disconnected successfully');
    } catch (error) {
      this.logger.logError(error as Error, { action: 'database_disconnection_failed' });
    }
  }

  // Enhanced query execution with retry logic
  async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    context?: any,
  ): Promise<T> {
    let lastError: Error = new Error('Unknown error');
    
    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        // Add timeout to the operation
        const result = await this.withTimeout(operation(), this.queryTimeout);
        
        if (attempt > 1) {
          this.logger.log(`Operation ${operationName} succeeded on attempt ${attempt}`, context);
        }
        
        return result;
      } catch (error) {
        lastError = error as Error;
        
        // Log retry attempt
        this.logger.warn(`Operation ${operationName} failed on attempt ${attempt}/${this.maxRetries}`, {
          error: lastError.message,
          operationName,
          attempt,
          ...context,
        });
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(lastError)) {
          throw lastError;
        }
        
        // Wait before retry
        if (attempt < this.maxRetries) {
          await this.delay(this.retryDelay * attempt);
        }
      }
    }
    
    // All retries failed
    this.logger.logError(lastError, {
      action: 'operation_failed_after_retries',
      operationName,
      maxRetries: this.maxRetries,
      ...context,
    });
    
    throw lastError;
  }

  // Timeout wrapper for operations
  private async withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    return Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Operation timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  }

  // Determine if error should not be retried
  private shouldNotRetry(error: Error): boolean {
    const noRetryErrors = [
      'PrismaClientKnownRequestError',
      'PrismaClientValidationError',
      'PrismaClientRustPanicError',
    ];
    
    return noRetryErrors.includes(error.name) || 
           error.message.includes('Unique constraint') ||
           error.message.includes('Foreign key constraint') ||
           error.message.includes('Invalid');
  }

  // Delay helper
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Database health check
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    connectionPool: any;
  }> {
    const startTime = Date.now();
    
    try {
      // Simple query to test connection
      await this.$queryRaw`SELECT 1`;
      
      const latency = Date.now() - startTime;
      
      // Get connection pool info (if available)
      const connectionPool = await this.getConnectionPoolInfo();
      
      this.logger.log('Database health check passed', {
        latency,
        connectionPool,
      });
      
      return {
        status: 'healthy',
        latency,
        connectionPool,
      };
    } catch (error) {
      const latency = Date.now() - startTime;
      
      this.logger.logError(error as Error, {
        action: 'database_health_check_failed',
        latency,
      });
      
      return {
        status: 'unhealthy',
        latency,
        connectionPool: null,
      };
    }
  }

  // Get connection pool information
  private async getConnectionPoolInfo(): Promise<any> {
    try {
      // This would vary depending on the database
      // For PostgreSQL, we can query pg_stat_activity
      const result = await this.$queryRaw`
        SELECT 
          count(*) as total_connections,
          count(*) FILTER (WHERE state = 'active') as active_connections,
          count(*) FILTER (WHERE state = 'idle') as idle_connections
        FROM pg_stat_activity 
        WHERE datname = current_database()
      `;
      
      return result;
    } catch (error) {
      this.logger.warn('Failed to get connection pool info', { error: (error as Error).message });
      return null;
    }
  }

  // Enhanced find methods with retry logic - to be used with specific models
  async findManyWithRetry<T>(model: any, args: any, operationName: string): Promise<T[]> {
    return this.executeWithRetry(
      () => model.findMany(args),
      operationName,
      { args },
    );
  }

  async findFirstWithRetry<T>(model: any, args: any, operationName: string): Promise<T | null> {
    return this.executeWithRetry(
      () => model.findFirst(args),
      operationName,
      { args },
    );
  }

  async findUniqueWithRetry<T>(model: any, args: any, operationName: string): Promise<T | null> {
    return this.executeWithRetry(
      () => model.findUnique(args),
      operationName,
      { args },
    );
  }

  async createWithRetry<T>(model: any, args: any, operationName: string): Promise<T> {
    return this.executeWithRetry(
      () => model.create(args),
      operationName,
      { args },
    );
  }

  async updateWithRetry<T>(model: any, args: any, operationName: string): Promise<T> {
    return this.executeWithRetry(
      () => model.update(args),
      operationName,
      { args },
    );
  }

  async deleteWithRetry<T>(model: any, args: any, operationName: string): Promise<T> {
    return this.executeWithRetry(
      () => model.delete(args),
      operationName,
      { args },
    );
  }

  // Transaction with retry logic
  async transactionWithRetry<T>(
    fn: (tx: PrismaClient) => Promise<T>,
    operationName: string,
  ): Promise<T> {
    return this.executeWithRetry(
      async () => {
        const result = await this.$transaction(async (prisma) => {
          return await fn(prisma as PrismaClient);
        });
        return result as T;
      },
      operationName,
    );
  }

  // Batch operations with retry logic
  async batchWithRetry(operations: any[], operationName: string): Promise<any> {
    return this.executeWithRetry(
      () => this.$transaction(operations),
      operationName,
      { operationsCount: operations.length },
    );
  }

  // Raw query with retry logic
  async queryRawWithRetry<T>(query: any, operationName: string): Promise<T> {
    return this.executeWithRetry(
      () => this.$queryRaw(query),
      operationName,
      { query },
    );
  }

  // Get database statistics
  async getDatabaseStats(): Promise<{
    totalConnections: number;
    activeConnections: number;
    idleConnections: number;
    databaseSize: string;
    tableCount: number;
  }> {
    try {
      const [connectionStats, sizeStats, tableStats] = await Promise.all([
        this.getConnectionPoolInfo(),
        this.$queryRaw`SELECT pg_size_pretty(pg_database_size(current_database())) as size`,
        this.$queryRaw`SELECT count(*) as count FROM information_schema.tables WHERE table_schema = 'public'`,
      ]);

      return {
        totalConnections: (connectionStats as any)?.[0]?.total_connections || 0,
        activeConnections: (connectionStats as any)?.[0]?.active_connections || 0,
        idleConnections: (connectionStats as any)?.[0]?.idle_connections || 0,
        databaseSize: (sizeStats as any)?.[0]?.size || 'Unknown',
        tableCount: parseInt((tableStats as any)?.[0]?.count || '0'),
      };
    } catch (error) {
      this.logger.logError(error as Error, { action: 'get_database_stats_failed' });
      throw error;
    }
  }

  // Clean up old connections (if needed)
  async cleanupConnections(): Promise<void> {
    try {
      // This would be database-specific
      // For PostgreSQL, we can terminate idle connections
      await this.$queryRaw`
        SELECT pg_terminate_backend(pid)
        FROM pg_stat_activity
        WHERE state = 'idle'
        AND query_start < NOW() - INTERVAL '1 hour'
        AND pid != pg_backend_pid()
      `;
      
      this.logger.log('Cleaned up old database connections');
    } catch (error) {
      this.logger.logError(error as Error, { action: 'cleanup_connections_failed' });
    }
  }
}
