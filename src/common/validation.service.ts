import { Injectable, BadRequestException } from '@nestjs/common';
import { AppLogger } from './logger.service';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  sanitizedData?: any;
}

@Injectable()
export class ValidationService {
  private readonly logger: AppLogger;

  constructor() {
    this.logger = new AppLogger({ get: () => process.env } as any);
  }

  // Validación y sanitización de strings
  validateString(value: any, options: {
    required?: boolean;
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
    allowEmpty?: boolean;
    sanitize?: boolean;
  } = {}): ValidationResult {
    const errors: string[] = [];
    let sanitizedValue = value;

    // Validar que sea string
    if (typeof value !== 'string') {
      if (options.required) {
        errors.push('Value must be a string');
      }
      return { isValid: errors.length === 0, errors };
    }

    // Validar required
    if (options.required && !value.trim()) {
      errors.push('Field is required');
    }

    // Validar longitud
    if (options.minLength && value.length < options.minLength) {
      errors.push(`Minimum length is ${options.minLength} characters`);
    }

    if (options.maxLength && value.length > options.maxLength) {
      errors.push(`Maximum length is ${options.maxLength} characters`);
    }

    // Validar pattern
    if (options.pattern && !options.pattern.test(value)) {
      errors.push('Invalid format');
    }

    // Validar empty string
    if (!options.allowEmpty && value.trim() === '') {
      errors.push('Field cannot be empty');
    }

    // Sanitización
    if (options.sanitize) {
      sanitizedValue = this.sanitizeString(value);
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedValue,
    };
  }

  // Validación de emails
  validateEmail(email: any): ValidationResult {
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const result = this.validateString(email, {
      required: true,
      maxLength: 255,
      pattern: emailPattern,
      sanitize: true,
    });

    // Validaciones adicionales para email
    if (result.isValid && result.sanitizedData) {
      const sanitized = result.sanitizedData;
      
      // No permitir emails con dominios sospechosos
      const suspiciousDomains = [
        'tempmail.com',
        '10minutemail.com',
        'guerrillamail.com',
        'mailinator.com',
      ];
      
      const domain = sanitized.split('@')[1]?.toLowerCase();
      if (suspiciousDomains.includes(domain)) {
        result.errors.push('Temporary email addresses are not allowed');
        result.isValid = false;
      }
    }

    return result;
  }

  // Validación de nombres
  validateName(name: any): ValidationResult {
    const namePattern = /^[a-zA-Z\s\-'\.]+$/;
    return this.validateString(name, {
      required: true,
      minLength: 2,
      maxLength: 100,
      pattern: namePattern,
      sanitize: true,
    });
  }

  // Validación de montos de dinero
  validateAmount(amount: any, options: {
    min?: number;
    max?: number;
    allowZero?: boolean;
    currency?: string;
  } = {}): ValidationResult {
    const errors: string[] = [];
    let sanitizedAmount = amount;

    // Validar que sea número
    if (typeof amount !== 'number' && typeof amount !== 'string') {
      errors.push('Amount must be a number');
      return { isValid: false, errors };
    }

    // Convertir a número si es string
    if (typeof amount === 'string') {
      const parsed = parseFloat(amount);
      if (isNaN(parsed)) {
        errors.push('Invalid amount format');
        return { isValid: false, errors };
      }
      sanitizedAmount = parsed;
    }

    // Validar rango
    if (options.min !== undefined && sanitizedAmount < options.min) {
      errors.push(`Minimum amount is ${options.min}`);
    }

    if (options.max !== undefined && sanitizedAmount > options.max) {
      errors.push(`Maximum amount is ${options.max}`);
    }

    // Validar cero
    if (!options.allowZero && sanitizedAmount === 0) {
      errors.push('Amount cannot be zero');
    }

    // Validar decimales (máximo 2 para dinero)
    if (sanitizedAmount % 1 !== 0) {
      const decimalPlaces = sanitizedAmount.toString().split('.')[1]?.length || 0;
      if (decimalPlaces > 2) {
        errors.push('Amount cannot have more than 2 decimal places');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedAmount,
    };
  }

  // Validación de URLs
  validateUrl(url: any, options: {
    required?: boolean;
    allowedProtocols?: string[];
    allowedDomains?: string[];
  } = {}): ValidationResult {
    const errors: string[] = [];
    let sanitizedUrl = url;

    if (typeof url !== 'string') {
      if (options.required) {
        errors.push('URL must be a string');
      }
      return { isValid: errors.length === 0, errors };
    }

    try {
      const parsedUrl = new URL(url);
      
      // Validar protocolo
      const allowedProtocols = options.allowedProtocols || ['http', 'https'];
      if (!allowedProtocols.includes(parsedUrl.protocol.replace(':', ''))) {
        errors.push(`Protocol must be one of: ${allowedProtocols.join(', ')}`);
      }

      // Validar dominio
      if (options.allowedDomains && !options.allowedDomains.includes(parsedUrl.hostname)) {
        errors.push(`Domain must be one of: ${options.allowedDomains.join(', ')}`);
      }

      // Sanitizar URL
      sanitizedUrl = parsedUrl.toString();

    } catch (error) {
      errors.push('Invalid URL format');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedUrl,
    };
  }

  // Validación de fechas
  validateDate(date: any, options: {
    required?: boolean;
    minDate?: Date;
    maxDate?: Date;
    futureOnly?: boolean;
    pastOnly?: boolean;
  } = {}): ValidationResult {
    const errors: string[] = [];
    let sanitizedDate = date;

    if (typeof date !== 'string' && !(date instanceof Date)) {
      if (options.required) {
        errors.push('Date must be a string or Date object');
      }
      return { isValid: false, errors };
    }

    // Convertir a Date si es string
    if (typeof date === 'string') {
      const parsed = new Date(date);
      if (isNaN(parsed.getTime())) {
        errors.push('Invalid date format');
        return { isValid: false, errors };
      }
      sanitizedDate = parsed;
    }

    const now = new Date();

    // Validar rangos
    if (options.minDate && sanitizedDate < options.minDate) {
      errors.push(`Date must be after ${options.minDate.toISOString()}`);
    }

    if (options.maxDate && sanitizedDate > options.maxDate) {
      errors.push(`Date must be before ${options.maxDate.toISOString()}`);
    }

    // Validar futuro/pasado
    if (options.futureOnly && sanitizedDate <= now) {
      errors.push('Date must be in the future');
    }

    if (options.pastOnly && sanitizedDate > now) {
      errors.push('Date must be in the past');
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedDate,
    };
  }

  // Validación de objetos completos
  validateObject(obj: any, schema: ValidationSchema): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: any = {};

    // Validar cada campo según el schema
    for (const [field, rules] of Object.entries(schema)) {
      const value = obj?.[field];
      let fieldResult: ValidationResult;

      // Determinar tipo de validación
      switch (rules.type) {
        case 'string':
          fieldResult = this.validateString(value, rules);
          break;
        case 'email':
          fieldResult = this.validateEmail(value);
          break;
        case 'name':
          fieldResult = this.validateName(value);
          break;
        case 'amount':
          fieldResult = this.validateAmount(value, rules);
          break;
        case 'url':
          fieldResult = this.validateUrl(value, rules);
          break;
        case 'date':
          fieldResult = this.validateDate(value, rules);
          break;
        default:
          fieldResult = { isValid: true, errors: [] };
      }

      // Agregar errores del campo
      if (!fieldResult.isValid) {
        errors.push(...fieldResult.errors.map(err => `${field}: ${err}`));
      }

      // Usar datos sanitizados
      if (fieldResult.sanitizedData !== undefined) {
        sanitizedData[field] = fieldResult.sanitizedData;
      } else if (value !== undefined) {
        sanitizedData[field] = value;
      }
    }

    // Validar campos extra no permitidos
    const allowedFields = Object.keys(schema);
    const extraFields = Object.keys(obj || {}).filter(field => !allowedFields.includes(field));
    if (extraFields.length > 0) {
      this.logger.warn('Extra fields detected', { extraFields, allowedFields });
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData,
    };
  }

  // Sanitización de strings
  private sanitizeString(str: string): string {
    return str
      .trim()
      // Eliminar caracteres de control
      .replace(/[\x00-\x1F\x7F]/g, '')
      // Sanitizar potencial XSS
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      // Normalizar espacios múltiples
      .replace(/\s+/g, ' ');
  }

  // Validación de IDs (UUIDs o números)
  validateId(id: any): ValidationResult {
    const errors: string[] = [];
    let sanitizedId = id;

    if (typeof id !== 'string' && typeof id !== 'number') {
      errors.push('ID must be a string or number');
      return { isValid: false, errors };
    }

    // Si es string, validar UUID format o numeric
    if (typeof id === 'string') {
      const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      const numericPattern = /^\d+$/;
      
      if (!uuidPattern.test(id) && !numericPattern.test(id)) {
        errors.push('ID must be a valid UUID or number');
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData: sanitizedId,
    };
  }

  // Validación de paginación
  validatePagination(query: any): ValidationResult {
    const errors: string[] = [];
    const sanitizedData: any = {};

    // Validar page
    if (query.page !== undefined) {
      const pageResult = this.validateString(query.page, {
        required: false,
        pattern: /^\d+$/,
      });
      
      if (!pageResult.isValid) {
        errors.push('Page must be a positive number');
      } else {
        sanitizedData.page = parseInt(pageResult.sanitizedData) || 1;
      }
    } else {
      sanitizedData.page = 1;
    }

    // Validar limit
    if (query.limit !== undefined) {
      const limitResult = this.validateString(query.limit, {
        required: false,
        pattern: /^\d+$/,
      });
      
      if (!limitResult.isValid) {
        errors.push('Limit must be a positive number');
      } else {
        const limit = parseInt(limitResult.sanitizedData);
        sanitizedData.limit = Math.min(Math.max(limit, 1), 100); // Entre 1 y 100
      }
    } else {
      sanitizedData.limit = 20;
    }

    return {
      isValid: errors.length === 0,
      errors,
      sanitizedData,
    };
  }
}

// Tipos para el schema de validación
export interface ValidationFieldRules {
  type: 'string' | 'email' | 'name' | 'amount' | 'url' | 'date';
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: RegExp;
  allowEmpty?: boolean;
  sanitize?: boolean;
  min?: number;
  max?: number;
  allowZero?: boolean;
  currency?: string;
  allowedProtocols?: string[];
  allowedDomains?: string[];
  minDate?: Date;
  maxDate?: Date;
  futureOnly?: boolean;
  pastOnly?: boolean;
}

export interface ValidationSchema {
  [field: string]: ValidationFieldRules;
}
