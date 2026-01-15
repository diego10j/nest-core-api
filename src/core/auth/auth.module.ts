import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { CoreModule } from '../core.module';
import { RedisModule } from '../../redis/redis.module';
import { AuditService } from '../modules/audit/audit.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordService } from './password.service';

// Use Cases
import {
  ValidateUserCredentialsUseCase,
  BuildAuthUserUseCase,
  ChangePasswordUseCase,
  ResetPasswordUseCase,
} from './application/use-cases';

// Services
import { TokenService, SessionService, TokenBlacklistService, LoginAttemptsService } from './application/services';

// Repositories
import {
  UserRepository,
  ProfileRepository,
  BranchRepository,
  SessionRepository,
} from './infrastructure/repositories';

// Repository Interfaces (Dependency Injection Tokens)
import {
  USER_REPOSITORY,
  PROFILE_REPOSITORY,
  BRANCH_REPOSITORY,
  SESSION_REPOSITORY,
} from './domain/repositories';

/**
 * AuthModule - Refactorizado con Clean Architecture, DDD y SOLID
 * 
 * ✅ Principios SOLID aplicados
 * ✅ Clean Architecture con 4 capas
 * ✅ Domain-Driven Design
 * ✅ Dependency Inversion Principle (DIP)
 * ✅ Single Responsibility Principle (SRP)
 */
@Module({
  controllers: [AuthController],
  imports: [
    ConfigModule,
    CoreModule,
    RedisModule, // Importar RedisModule para usar REDIS_CLIENT
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: {
            expiresIn: configService.get('JWT_SECRET_EXPIRES_TIME'),
          },
        };
      },
    }),
  ],
  providers: [
    // ========== Servicio Principal Refactorizado ==========
    AuthService,
    PasswordService,
    JwtStrategy,
    AuditService,

    // ========== Use Cases (Application Layer) ==========
    ValidateUserCredentialsUseCase,
    BuildAuthUserUseCase,
    ChangePasswordUseCase,
    ResetPasswordUseCase,

    // ========== Application Services ==========
    TokenService,
    SessionService,
    TokenBlacklistService,
    LoginAttemptsService,

    // ========== Repository Implementations (Infrastructure Layer) ==========
    // Dependency Inversion: Las implementaciones se inyectan usando tokens
    {
      provide: USER_REPOSITORY,
      useClass: UserRepository,
    },
    {
      provide: PROFILE_REPOSITORY,
      useClass: ProfileRepository,
    },
    {
      provide: BRANCH_REPOSITORY,
      useClass: BranchRepository,
    },
    {
      provide: SESSION_REPOSITORY,
      useClass: SessionRepository,
    },
  ],
  exports: [
    PassportModule,
    JwtStrategy,
    JwtModule,
    AuthService,
    TokenService,
    SessionService,
    TokenBlacklistService,
    LoginAttemptsService,
  ],
})
export class AuthModule { }
