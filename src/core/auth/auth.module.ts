import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { CoreModule } from '../core.module';
import { AuditService } from '../modules/audit/audit.service';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { PasswordService } from './password.service';

@Module({
  controllers: [AuthController],
  imports: [
    ConfigModule,
    CoreModule,
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
  providers: [AuthService, JwtStrategy, AuditService, PasswordService],
  exports: [PassportModule, JwtStrategy, JwtModule],
})
export class AuthModule { }
