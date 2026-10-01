import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'crypto';

import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import Redis from 'ioredis';
import { envs } from 'src/config/envs';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { BUILTIN_TEMPLATES } from 'src/core/email/config';
import { MailService } from 'src/core/email/services/mail.service';
import { TemplateService } from 'src/core/email/services/template.service';

import { IUserRepository, USER_REPOSITORY } from '../../domain/repositories';
import { PasswordService } from '../../password.service';

import { LoginAttemptsService } from './login-attempts.service';
import { RefreshTokenService } from './refresh-token.service';
import { TokenBlacklistService } from './token-blacklist.service';

const APP_NAME = 'Pro-ERP';
const CODE_TTL_SECONDS = 10 * 60;
const RESET_TOKEN_TTL_SECONDS = 10 * 60;
const RESEND_COOLDOWN_SECONDS = 60;
const MAX_VERIFY_ATTEMPTS = 5;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const FORGOT_PASSWORD_MESSAGE =
  'Si los datos corresponden a una cuenta con correo registrado, enviamos un código de 6 dígitos. Revise su bandeja de entrada.';
const INVALID_CODE_MESSAGE = 'Código inválido o vencido';

interface StoredCode {
  hash: string;
  attempts: number;
}

/**
 * Recuperación de contraseña ("olvidé mi contraseña") con código de 6 dígitos por correo.
 *
 *  1. requestCode:  genera el código, lo guarda HASHEADO en Redis (10 min) y lo envía al correo
 *                   registrado. La respuesta es siempre la misma (no revela si la cuenta existe).
 *  2. verifyCode:   valida el código (máx. 5 intentos, un solo uso) y entrega un resetToken de un
 *                   solo uso (10 min).
 *  3. resetPassword: con el resetToken guarda la contraseña nueva, quita el cambio obligatorio y
 *                   cierra todas las sesiones activas del usuario.
 */
@Injectable()
export class PasswordRecoveryService {
  private readonly logger = new Logger(PasswordRecoveryService.name);
  private readonly redis: Redis;

  constructor(
    @Inject('REDIS_CLIENT') redisClient: Redis,
    private readonly dataSource: DataSourceService,
    private readonly mailService: MailService,
    private readonly templateService: TemplateService,
    private readonly passwordService: PasswordService,
    @Inject(USER_REPOSITORY) private readonly userRepository: IUserRepository,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly refreshTokenService: RefreshTokenService,
    private readonly loginAttemptsService: LoginAttemptsService,
  ) {
    // Base de datos propia (1 blacklist, 2 intentos de login, 3 refresh tokens)
    this.redis = redisClient.duplicate();
    this.redis.select(4);
  }

  // ----------------------------- 1. Solicitar código ----------------------------- //

  async requestCode(identifier: string): Promise<{ message: string }> {
    const generic = { message: FORGOT_PASSWORD_MESSAGE };
    try {
      const user = await this.findUser(identifier);
      if (!user) return generic;

      const email = String(user.mail_usua || '').trim();
      if (!EMAIL_REGEX.test(email)) {
        this.logger.warn(`Recuperación de contraseña: usuario ${user.ide_usua} sin correo válido`);
        return generic;
      }

      // Una solicitud por minuto y usuario (evita inundar el correo de la víctima)
      const cooldown = await this.redis.set(this.key('cool', user.ide_usua), '1', 'EX', RESEND_COOLDOWN_SECONDS, 'NX');
      if (cooldown !== 'OK') return generic;

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const stored: StoredCode = { hash: this.hashCode(user.ide_usua, code), attempts: 0 };
      await this.redis.set(this.key('code', user.ide_usua), JSON.stringify(stored), 'EX', CODE_TTL_SECONDS);

      try {
        const asunto = `Tu código de recuperación de ${APP_NAME}`;
        const html = await this.templateService.compileBuiltInTemplate(BUILTIN_TEMPLATES.CODIGO_RECUPERACION, {
          title: asunto,
          appName: APP_NAME,
          nombre: user.nom_usua,
          codigo: code,
          minutos: CODE_TTL_SECONDS / 60,
        });
        await this.mailService.sendMail({ destinatario: email, asunto, contenido: html }, user.ide_empr, 'sistema');
      } catch (error) {
        // Si no se pudo enviar, el código no sirve a nadie: se descarta. No se informa al cliente.
        await this.redis.del(this.key('code', user.ide_usua));
        this.logger.error(`No se pudo enviar el código de recuperación al usuario ${user.ide_usua}: ${error?.message}`);
      }
    } catch (error) {
      this.logger.error(`Error en requestCode: ${error?.message}`);
    }
    return generic;
  }

  // ----------------------------- 2. Verificar código ----------------------------- //

  async verifyCode(identifier: string, code: string): Promise<{ resetToken: string; expiresInSeconds: number }> {
    const user = await this.findUser(identifier);
    if (!user) throw new BadRequestException(INVALID_CODE_MESSAGE);

    const codeKey = this.key('code', user.ide_usua);
    const raw = await this.redis.get(codeKey);
    if (!raw) throw new BadRequestException(INVALID_CODE_MESSAGE);

    const stored: StoredCode = JSON.parse(raw);
    if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
      await this.redis.del(codeKey);
      throw new BadRequestException('Demasiados intentos. Solicite un código nuevo.');
    }

    const expected = Buffer.from(stored.hash, 'hex');
    const received = Buffer.from(this.hashCode(user.ide_usua, code), 'hex');
    const valid = expected.length === received.length && timingSafeEqual(expected, received);

    if (!valid) {
      stored.attempts += 1;
      const ttl = await this.redis.ttl(codeKey);
      if (stored.attempts >= MAX_VERIFY_ATTEMPTS) {
        await this.redis.del(codeKey);
        throw new BadRequestException('Demasiados intentos. Solicite un código nuevo.');
      }
      if (ttl > 0) await this.redis.set(codeKey, JSON.stringify(stored), 'EX', ttl);
      throw new BadRequestException(INVALID_CODE_MESSAGE);
    }

    // Código correcto: se consume y se entrega un token de un solo uso
    await this.redis.del(codeKey);
    const resetToken = randomBytes(32).toString('hex');
    await this.redis.set(this.tokenKey(resetToken), String(user.ide_usua), 'EX', RESET_TOKEN_TTL_SECONDS);
    return { resetToken, expiresInSeconds: RESET_TOKEN_TTL_SECONDS };
  }

  // ----------------------------- 3. Nueva contraseña ----------------------------- //

  async resetPassword(resetToken: string, newPassword: string, confirmNewPassword: string): Promise<{ message: string }> {
    if (newPassword !== confirmNewPassword) {
      throw new BadRequestException('La nueva contraseña y la confirmación no coinciden');
    }

    // Un solo uso: se lee y se borra en el mismo paso
    const tokenKey = this.tokenKey(resetToken);
    const [[, ideRaw]] = (await this.redis.multi().get(tokenKey).del(tokenKey).exec()) as [Error | null, string | null][];
    if (!ideRaw) throw new BadRequestException('La sesión de recuperación venció. Solicite un código nuevo.');
    const ideUsua = Number(ideRaw);

    const user = await this.findById(ideUsua);
    if (!user) throw new BadRequestException('La sesión de recuperación venció. Solicite un código nuevo.');

    const hashed = await this.passwordService.hashPassword(newPassword);
    await this.userRepository.updatePassword(ideUsua, hashed);
    await this.userRepository.clearPasswordChangeFlag(ideUsua);

    // Cierra todas las sesiones abiertas y limpia bloqueos de login por intentos fallidos
    await Promise.all([
      this.tokenBlacklistService.blacklistAllUserTokens(user.uuid),
      this.refreshTokenService.revokeAllForUser(user.uuid),
      ...[user.mail_usua, user.nick_usua]
        .filter(Boolean)
        .flatMap((id: string) => [id, id.toLowerCase()])
        .map((id: string) => this.loginAttemptsService.resetFailedAttempts(id)),
    ]);
    await this.redis.del(this.key('code', ideUsua), this.key('cool', ideUsua));

    this.logger.log(`Contraseña restablecida por recuperación: usuario ${ideUsua}`);
    return { message: 'Contraseña actualizada. Ya puede iniciar sesión con la nueva contraseña.' };
  }

  // ----------------------------- soporte ----------------------------- //

  /** Busca por correo o login; si hay más de una cuenta activa con ese dato no actúa (ambiguo) */
  private async findUser(identifier: string) {
    const query = new SelectQuery(`
      SELECT ide_usua, uuid, nom_usua, nick_usua, mail_usua, ide_empr
      FROM sis_usuario
      WHERE activo_usua = true
        AND COALESCE(bloqueado_usua, false) = false
        AND (LOWER(mail_usua) = LOWER($1) OR LOWER(nick_usua) = LOWER($1))
    `);
    query.addStringParam(1, identifier.trim());
    query.setLazy(false);
    const rows = await this.dataSource.createSelectQuery(query);
    if (rows.length !== 1) {
      if (rows.length > 1) this.logger.warn('Recuperación de contraseña: el dato coincide con varias cuentas; se ignora');
      return null;
    }
    return rows[0];
  }

  private async findById(ideUsua: number) {
    const query = new SelectQuery(`
      SELECT ide_usua, uuid, nom_usua, nick_usua, mail_usua, ide_empr
      FROM sis_usuario
      WHERE ide_usua = $1 AND activo_usua = true AND COALESCE(bloqueado_usua, false) = false
    `);
    query.addNumberParam(1, ideUsua);
    return this.dataSource.createSingleQuery(query);
  }

  private key(kind: 'code' | 'cool', ideUsua: number): string {
    return `pwdrec:${kind}:${ideUsua}`;
  }

  private tokenKey(resetToken: string): string {
    return `pwdrec:token:${createHash('sha256').update(resetToken).digest('hex')}`;
  }

  /** HMAC con secreto del servidor: aunque se filtre Redis, el código de 6 dígitos no se deduce */
  private hashCode(ideUsua: number, code: string): string {
    return createHmac('sha256', envs.jwtSecret).update(`${ideUsua}:${code}`).digest('hex');
  }
}
