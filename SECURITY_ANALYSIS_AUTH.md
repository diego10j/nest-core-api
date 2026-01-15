# 🔐 Análisis de Seguridad - Módulo de Autenticación

**Fecha:** 15 de enero de 2026  
**Tecnologías:** NestJS, JWT, Redis, PostgreSQL, bcrypt  
**Estado:** Producción - Recomendaciones de mejora

---

## 📊 Estado Actual de Seguridad

### ✅ Implementaciones Correctas

| Característica | Estado | Detalles |
|----------------|--------|----------|
| **Hashing de contraseñas** | ✅ Implementado | bcrypt con 10 salt rounds |
| **JWT con secreto** | ✅ Implementado | JWT_SECRET desde variables de entorno |
| **Tokens con expiración** | ✅ Implementado | Configurable vía JWT_SECRET_EXPIRES_TIME |
| **Validación de email** | ✅ Implementado | Validación con decorador @IsEmail() |
| **Usuario bloqueado** | ✅ Implementado | Verifica bloqueado_usua en jwt.strategy |
| **Auditoría de sesiones** | ✅ Implementado | Registra login/logout con IP |
| **Guards de autenticación** | ✅ Implementado | @Auth() decorator con roles |
| **HTTPS en producción** | ⚠️ Verificar | Debe configurarse en proxy/nginx |

---

## ⚠️ Vulnerabilidades Identificadas

### 🔴 CRÍTICAS (Implementar inmediatamente)

#### 1. **Falta de Rate Limiting en Login**
**Riesgo:** Ataques de fuerza bruta  
**Impacto:** Un atacante puede intentar miles de combinaciones de contraseñas

**Solución:**
```bash
npm install @nestjs/throttler
```

```typescript
// app.module.ts
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

@Module({
  imports: [
    ThrottlerModule.forRoot([{
      ttl: 60000, // 1 minuto
      limit: 5,   // 5 intentos
    }]),
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})

// auth.controller.ts
@Throttle({ default: { limit: 3, ttl: 60000 } }) // 3 intentos por minuto
@Post('login')
login(@Body() dtoIn: LoginUserDto, @Ip() ip: string) {
  return this.authService.login(dtoIn, ip);
}
```

#### 2. **No hay Bloqueo de Cuenta por Intentos Fallidos**
**Riesgo:** Permite intentos ilimitados de login  
**Impacto:** Facilita ataques de fuerza bruta

**Solución:**
```typescript
// Agregar en User Entity
export class User {
  private failedLoginAttempts: number = 0;
  private lockedUntil?: Date;

  recordFailedLogin(): void {
    this.failedLoginAttempts++;
    if (this.failedLoginAttempts >= 5) {
      // Bloquear por 15 minutos
      this.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
    }
  }

  isAccountLocked(): boolean {
    if (!this.lockedUntil) return false;
    return new Date() < this.lockedUntil;
  }

  resetFailedAttempts(): void {
    this.failedLoginAttempts = 0;
    this.lockedUntil = undefined;
  }
}
```

```sql
-- Agregar columnas a la tabla sis_usuario
ALTER TABLE sis_usuario 
ADD COLUMN intentos_fallidos_usua INTEGER DEFAULT 0,
ADD COLUMN bloqueado_hasta_usua TIMESTAMP;
```

#### 3. **Tokens JWT no se Invalidan en Redis**
**Riesgo:** Un token robado puede usarse hasta su expiración  
**Impacto:** Si un usuario hace logout, su token sigue siendo válido

**Solución:**
```typescript
// application/services/token-blacklist.service.ts
import { Injectable } from '@nestjs/common';
import { RedisService } from '../../../redis/redis.service';

@Injectable()
export class TokenBlacklistService {
  constructor(private readonly redis: RedisService) {}

  /**
   * Invalida un token agregándolo a la blacklist
   */
  async blacklistToken(token: string, expiresIn: number): Promise<void> {
    const key = `blacklist:${token}`;
    // Guardar en Redis con TTL igual a la expiración del token
    await this.redis.set(key, '1', 'EX', expiresIn);
  }

  /**
   * Verifica si un token está en la blacklist
   */
  async isTokenBlacklisted(token: string): Promise<boolean> {
    const key = `blacklist:${token}`;
    const result = await this.redis.get(key);
    return result !== null;
  }
}
```

```typescript
// Modificar jwt.strategy.ts
async validate(payload: JwtPayload, request: any): Promise<AuthUser> {
  const token = request.headers.authorization?.split(' ')[1];
  
  // Verificar si el token está en blacklist
  const isBlacklisted = await this.tokenBlacklistService.isTokenBlacklisted(token);
  if (isBlacklisted) {
    throw new UnauthorizedException('Token inválido');
  }

  // ... resto de validación
}
```

```typescript
// Modificar logout en auth.service.ts
async logout(ideUsua: number, ip: string, token: string) {
  // Obtener tiempo de expiración del token
  const decoded = this.tokenService.decodeToken(token);
  const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
  
  // Agregar a blacklist
  await this.tokenBlacklistService.blacklistToken(token, expiresIn);
  
  await this.sessionService.recordLogout(ideUsua, ip);
  
  return { message: 'Sesión cerrada exitosamente' };
}
```

---

### 🟡 ALTAS (Implementar en 1-2 semanas)

#### 4. **Falta de Refresh Tokens**
**Riesgo:** Tokens de larga duración son más vulnerables  
**Impacto:** Si un token se compromete, puede usarse por mucho tiempo

**Solución:**
```typescript
// interfaces/tokens.interface.ts
export interface TokenPair {
  accessToken: string;   // Corto (15 minutos)
  refreshToken: string;  // Largo (7 días)
}

// application/services/token.service.ts
generateTokenPair(userId: string): TokenPair {
  const accessPayload: JwtPayload = { id: userId, type: 'access' };
  const refreshPayload: JwtPayload = { id: userId, type: 'refresh' };

  return {
    accessToken: this.jwtService.sign(accessPayload, { expiresIn: '15m' }),
    refreshToken: this.jwtService.sign(refreshPayload, { expiresIn: '7d' }),
  };
}

verifyRefreshToken(refreshToken: string): JwtPayload {
  const payload = this.jwtService.verify<JwtPayload>(refreshToken);
  if (payload.type !== 'refresh') {
    throw new UnauthorizedException('Token inválido');
  }
  return payload;
}
```

```typescript
// Guardar refresh tokens en Redis con whitelist
// infrastructure/repositories/refresh-token.repository.ts
@Injectable()
export class RefreshTokenRepository {
  constructor(private readonly redis: RedisService) {}

  async saveRefreshToken(userId: string, token: string, expiresIn: number) {
    const key = `refresh:${userId}`;
    await this.redis.set(key, token, 'EX', expiresIn);
  }

  async getRefreshToken(userId: string): Promise<string | null> {
    return this.redis.get(`refresh:${userId}`);
  }

  async deleteRefreshToken(userId: string): Promise<void> {
    await this.redis.del(`refresh:${userId}`);
  }
}
```

```typescript
// Endpoint para renovar token
@Post('refresh')
async refreshToken(@Body() { refreshToken }: RefreshTokenDto) {
  return this.authService.refreshToken(refreshToken);
}
```

#### 5. **Validación Débil de Contraseñas**
**Riesgo:** Contraseñas débiles fáciles de adivinar  
**Impacto:** Cuentas comprometidas por contraseñas simples

**Solución:**
```typescript
// dto/login-user.dto.ts
@IsString()
@IsNotEmpty({ message: 'La contraseña es obligatoria' })
@MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
@MaxLength(50)
@Matches(
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/,
  {
    message: 'La contraseña debe contener al menos: 1 mayúscula, 1 minúscula, 1 número y 1 carácter especial (@$!%*?&)',
  }
)
password: string;
```

```typescript
// domain/value-objects/password.vo.ts - Mejorar validación
export class Password {
  private static readonly MIN_LENGTH = 8;
  private static readonly REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])/;
  
  static create(password: string): Password {
    if (password.length < this.MIN_LENGTH) {
      throw new Error('La contraseña debe tener al menos 8 caracteres');
    }
    
    if (!this.REGEX.test(password)) {
      throw new Error('La contraseña debe contener mayúsculas, minúsculas, números y símbolos');
    }
    
    // Verificar contraseñas comunes
    if (this.isCommonPassword(password)) {
      throw new Error('Esta contraseña es muy común. Usa una más segura');
    }
    
    return new Password(password);
  }

  private static isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password', '12345678', 'qwerty123', 'admin123', 
      'password1', 'welcome1', 'letmein1'
    ];
    return commonPasswords.includes(password.toLowerCase());
  }
}
```

#### 6. **No hay Protección CSRF**
**Riesgo:** Cross-Site Request Forgery  
**Impacto:** Acciones no autorizadas en nombre del usuario

**Solución:**
```bash
npm install csurf
npm install @types/csurf --save-dev
```

```typescript
// main.ts
import * as csurf from 'csurf';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Protección CSRF
  app.use(csurf({ cookie: true }));
  
  await app.listen(3000);
}
```

#### 7. **Headers de Seguridad Faltantes**
**Riesgo:** XSS, Clickjacking, MIME sniffing  
**Impacto:** Vulnerabilidades del lado del cliente

**Solución:**
```bash
npm install helmet
```

```typescript
// main.ts
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  
  // Security headers
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  }));
  
  await app.listen(3000);
}
```

---

### 🟢 MEDIAS (Implementar en 1 mes)

#### 8. **Logging Insuficiente de Eventos de Seguridad**
**Riesgo:** Difícil detectar ataques o comportamientos anómalos  
**Impacto:** No se pueden investigar incidentes de seguridad

**Solución:**
```typescript
// application/services/security-logger.service.ts
@Injectable()
export class SecurityLoggerService {
  private readonly logger = new Logger('SecurityLogger');

  logSuccessfulLogin(userId: number, ip: string, userAgent: string) {
    this.logger.log({
      event: 'LOGIN_SUCCESS',
      userId,
      ip,
      userAgent,
      timestamp: new Date().toISOString(),
    });
  }

  logFailedLogin(email: string, ip: string, reason: string) {
    this.logger.warn({
      event: 'LOGIN_FAILED',
      email,
      ip,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  logSuspiciousActivity(userId: number, activity: string, details: any) {
    this.logger.error({
      event: 'SUSPICIOUS_ACTIVITY',
      userId,
      activity,
      details,
      timestamp: new Date().toISOString(),
    });
  }

  logPasswordChange(userId: number, ip: string) {
    this.logger.log({
      event: 'PASSWORD_CHANGED',
      userId,
      ip,
      timestamp: new Date().toISOString(),
    });
  }

  logLogout(userId: number, ip: string) {
    this.logger.log({
      event: 'LOGOUT',
      userId,
      ip,
      timestamp: new Date().toISOString(),
    });
  }
}
```

#### 9. **Falta de Autenticación de Dos Factores (2FA)**
**Riesgo:** Cuentas comprometidas solo con contraseña  
**Impacto:** Una capa adicional de seguridad faltante

**Solución:**
```bash
npm install speakeasy qrcode
npm install @types/qrcode --save-dev
```

```typescript
// application/services/two-factor.service.ts
import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';

@Injectable()
export class TwoFactorService {
  /**
   * Genera un secreto para 2FA
   */
  generateSecret(userEmail: string) {
    const secret = speakeasy.generateSecret({
      name: `ProERP (${userEmail})`,
      length: 32,
    });

    return {
      secret: secret.base32,
      otpauthUrl: secret.otpauth_url,
    };
  }

  /**
   * Genera QR code para configurar 2FA
   */
  async generateQRCode(otpauthUrl: string): Promise<string> {
    return QRCode.toDataURL(otpauthUrl);
  }

  /**
   * Verifica el código 2FA
   */
  verifyToken(secret: string, token: string): boolean {
    return speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Permite 2 tokens antes y después (60 segundos)
    });
  }
}
```

```sql
-- Agregar columnas para 2FA
ALTER TABLE sis_usuario 
ADD COLUMN two_factor_secret VARCHAR(100),
ADD COLUMN two_factor_enabled BOOLEAN DEFAULT FALSE;
```

```typescript
// Modificar login para incluir 2FA
async login(loginUserDto: LoginUserDto, ip: string, twoFactorToken?: string) {
  const validatedUser = await this.validateCredentialsUseCase.execute(
    loginUserDto.email,
    loginUserDto.password
  );

  // Si el usuario tiene 2FA habilitado
  if (validatedUser.twoFactorEnabled) {
    if (!twoFactorToken) {
      throw new UnauthorizedException('Se requiere código 2FA');
    }

    const isValid = this.twoFactorService.verifyToken(
      validatedUser.twoFactorSecret,
      twoFactorToken
    );

    if (!isValid) {
      throw new UnauthorizedException('Código 2FA inválido');
    }
  }

  // ... resto del login
}
```

#### 10. **Rotación de JWT_SECRET**
**Riesgo:** Si el secreto se compromete, todos los tokens son vulnerables  
**Impacto:** No hay manera de invalidar todos los tokens existentes

**Solución:**
```typescript
// config/jwt-config.service.ts
@Injectable()
export class JwtConfigService {
  private readonly secrets: string[] = [
    process.env.JWT_SECRET_PRIMARY,
    process.env.JWT_SECRET_SECONDARY, // Para rotación
  ];

  getCurrentSecret(): string {
    return this.secrets[0];
  }

  getAllSecrets(): string[] {
    return this.secrets;
  }
}

// Modificar jwt.strategy.ts para aceptar múltiples secretos
super({
  secretOrKey: jwtConfigService.getCurrentSecret(),
  // Intentar verificar con secretos antiguos si falla
});
```

#### 11. **IP Whitelisting para Endpoints Sensibles**
**Riesgo:** Acceso desde ubicaciones no autorizadas  
**Impacto:** Uso de credenciales robadas desde ubicaciones sospechosas

**Solución:**
```typescript
// guards/ip-whitelist.guard.ts
@Injectable()
export class IpWhitelistGuard implements CanActivate {
  private readonly allowedIps = process.env.ALLOWED_IPS?.split(',') || [];

  canActivate(context: ExecutionContext): boolean {
    if (this.allowedIps.length === 0) return true; // Sin restricciones

    const request = context.switchToHttp().getRequest();
    const clientIp = request.ip || request.connection.remoteAddress;

    return this.allowedIps.includes(clientIp);
  }
}

// Usar en endpoints administrativos
@UseGuards(IpWhitelistGuard)
@Post('admin/sensitive-operation')
sensitiveOperation() {
  // ...
}
```

---

## 🔐 Mejoras con Redis

### 1. **Session Store en Redis**
Almacenar sesiones activas en Redis para:
- Invalidar todas las sesiones de un usuario
- Limitar sesiones concurrentes
- Detectar sesiones sospechosas

```typescript
// infrastructure/repositories/session-store.repository.ts
@Injectable()
export class SessionStoreRepository {
  constructor(private readonly redis: RedisService) {}

  /**
   * Guarda una sesión activa
   */
  async saveSession(userId: string, sessionId: string, data: any, ttl: number) {
    const key = `session:${userId}:${sessionId}`;
    await this.redis.set(key, JSON.stringify(data), 'EX', ttl);
    
    // Agregar a la lista de sesiones del usuario
    await this.redis.sadd(`user:sessions:${userId}`, sessionId);
  }

  /**
   * Obtiene todas las sesiones activas de un usuario
   */
  async getUserSessions(userId: string): Promise<string[]> {
    return this.redis.smembers(`user:sessions:${userId}`);
  }

  /**
   * Invalida todas las sesiones de un usuario
   */
  async invalidateAllUserSessions(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    
    for (const sessionId of sessions) {
      await this.redis.del(`session:${userId}:${sessionId}`);
    }
    
    await this.redis.del(`user:sessions:${userId}`);
  }

  /**
   * Limita sesiones concurrentes
   */
  async enforceMaxSessions(userId: string, maxSessions: number = 3): Promise<void> {
    const sessions = await this.getUserSessions(userId);
    
    if (sessions.length >= maxSessions) {
      // Eliminar la sesión más antigua
      const oldestSession = sessions[0];
      await this.redis.del(`session:${userId}:${oldestSession}`);
      await this.redis.srem(`user:sessions:${userId}`, oldestSession);
    }
  }
}
```

### 2. **Rate Limiting con Redis**
```typescript
// guards/redis-rate-limit.guard.ts
@Injectable()
export class RedisRateLimitGuard implements CanActivate {
  constructor(private readonly redis: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const ip = request.ip;
    const key = `rate-limit:${ip}`;

    const current = await this.redis.incr(key);
    
    if (current === 1) {
      await this.redis.expire(key, 60); // 60 segundos
    }

    if (current > 5) { // 5 intentos por minuto
      throw new ThrottlerException('Demasiados intentos. Intenta nuevamente en 1 minuto');
    }

    return true;
  }
}
```

### 3. **Cache de Permisos en Redis**
```typescript
// infrastructure/repositories/permission-cache.repository.ts
@Injectable()
export class PermissionCacheRepository {
  constructor(private readonly redis: RedisService) {}

  async cacheUserPermissions(userId: string, permissions: any[], ttl: number = 3600) {
    const key = `permissions:${userId}`;
    await this.redis.set(key, JSON.stringify(permissions), 'EX', ttl);
  }

  async getUserPermissions(userId: string): Promise<any[] | null> {
    const key = `permissions:${userId}`;
    const data = await this.redis.get(key);
    return data ? JSON.parse(data) : null;
  }

  async invalidateUserPermissions(userId: string): Promise<void> {
    await this.redis.del(`permissions:${userId}`);
  }
}
```

---

## 📋 Plan de Implementación Recomendado

### Fase 1: Críticas (Semana 1)
- [x] ✅ Hashing de contraseñas implementado
- [ ] 🔴 Implementar Rate Limiting (@nestjs/throttler)
- [ ] 🔴 Implementar bloqueo de cuenta por intentos fallidos
- [ ] 🔴 Implementar blacklist de tokens en Redis
- [ ] 🔴 Agregar helmet para security headers

### Fase 2: Altas (Semanas 2-3)
- [ ] 🟡 Implementar Refresh Tokens
- [ ] 🟡 Mejorar validación de contraseñas
- [ ] 🟡 Agregar protección CSRF
- [ ] 🟡 Implementar SecurityLoggerService

### Fase 3: Medias (Semanas 4-5)
- [ ] 🟢 Implementar 2FA (opcional para usuarios)
- [ ] 🟢 Sistema de rotación de JWT_SECRET
- [ ] 🟢 Session store completo en Redis
- [ ] 🟢 IP Whitelisting para admin

### Fase 4: Monitoreo (Semana 6)
- [ ] 📊 Dashboard de seguridad
- [ ] 📊 Alertas de actividad sospechosa
- [ ] 📊 Reportes de intentos de login fallidos
- [ ] 📊 Auditoría de accesos

---

## 🎯 Métricas de Seguridad Recomendadas

| Métrica | Valor Recomendado | Actual |
|---------|-------------------|--------|
| **Intentos de login fallidos antes de bloqueo** | 5 | ∞ (Sin límite) |
| **Tiempo de bloqueo de cuenta** | 15 minutos | 0 (No implementado) |
| **Duración de Access Token** | 15 minutos | 8 horas ⚠️ |
| **Duración de Refresh Token** | 7 días | N/A (No implementado) |
| **Rate limit de login** | 3/minuto | ∞ (Sin límite) |
| **Longitud mínima de contraseña** | 8 caracteres | 4 caracteres ⚠️ |
| **Complejidad de contraseña** | Alta (mayús, minús, nums, símbolos) | Media |
| **Sesiones concurrentes máximas** | 3 | ∞ (Sin límite) |
| **TTL de token en blacklist** | Hasta expiración | N/A |
| **Logging de eventos de seguridad** | Completo | Parcial |

---

## 📚 Referencias y Estándares

- **OWASP Top 10 2021**
- **NIST Password Guidelines**
- **JWT Best Practices (RFC 8725)**
- **CWE-307:** Improper Restriction of Excessive Authentication Attempts
- **CWE-759:** Use of a One-Way Hash without a Salt

---

## ✅ Checklist de Seguridad

### Inmediato
- [ ] Instalar y configurar @nestjs/throttler
- [ ] Implementar bloqueo por intentos fallidos
- [ ] Reducir duración de JWT a 15 minutos
- [ ] Implementar refresh tokens
- [ ] Agregar blacklist de tokens en Redis
- [ ] Instalar y configurar helmet

### Corto Plazo (1-2 semanas)
- [ ] Mejorar validación de contraseñas (8 chars min, complejidad)
- [ ] Implementar SecurityLoggerService
- [ ] Configurar CSRF protection
- [ ] Agregar límite de sesiones concurrentes
- [ ] Documentar procedimientos de respuesta a incidentes

### Mediano Plazo (1 mes)
- [ ] Implementar 2FA opcional
- [ ] Sistema de rotación de secretos JWT
- [ ] Dashboard de monitoreo de seguridad
- [ ] Alertas automáticas de actividad sospechosa
- [ ] Auditoría trimestral de seguridad

---

## 🚨 Alertas Recomendadas

Configurar alertas para:
- **5+ intentos de login fallidos** en 1 minuto
- **Login desde IP nueva** (notificar al usuario)
- **Login desde país diferente**
- **Múltiples sesiones concurrentes**
- **Cambio de contraseña** (notificar al usuario)
- **Uso de token expirado/inválido**

---

## 📞 Contacto y Soporte

Para consultas de seguridad:
- **Email:** security@proerp.com
- **Escalación:** CTO/CISO
- **Reportar vulnerabilidad:** security-report@proerp.com

---

**Última actualización:** 15 de enero de 2026  
**Próxima revisión:** 15 de abril de 2026
