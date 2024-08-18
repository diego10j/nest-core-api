import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { CoreModule } from '../core.module';
import { AuditService } from '../audit/audit.service';
import { ErrorsModule } from '../../errors/errors.module';
import { DataSourceService } from '../connection/datasource.service';


@Module({
  controllers: [AuthController],
  imports: [
    ConfigModule,
    CoreModule,
    ErrorsModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        return {
          secret: configService.get('JWT_SECRET'),
          signOptions: {
            expiresIn: configService.get('JWT_SECRET_EXPIRES_TIME'),
          }
        }
      }
    })
  ],
  providers: [DataSourceService, AuthService, JwtStrategy, AuditService],
  exports: [PassportModule]
})
export class AuthModule { }