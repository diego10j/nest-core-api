import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { LoginUserDto } from './dto/login-user.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { AuthUser } from './interfaces';

import { ValidateUserCredentialsUseCase } from './application/use-cases/validate-user-credentials.use-case';
import { BuildAuthUserUseCase } from './application/use-cases/build-auth-user.use-case';
import { ChangePasswordUseCase } from './application/use-cases/change-password.use-case';
import { ResetPasswordUseCase } from './application/use-cases/reset-password.use-case';
import { TokenService } from './application/services/token.service';
import { SessionService } from './application/services/session.service';
import { TokenBlacklistService } from './application/services/token-blacklist.service';
import { LoginAttemptsService } from './application/services/login-attempts.service';
import { DataSourceService } from '../connection/datasource.service';
import { SelectQuery } from '../connection/helpers';
import { getCurrentTime, getDayNumber } from '../../util/helpers/date-util';

/**
 * AuthService - Refactorizado con Clean Architecture, DDD y SOLID
 * 
 * Orquestador de Use Cases que implementa:
 * - SRP: Delega responsabilidades a use cases y servicios especializados
 * - OCP: Extensible mediante nuevos use cases sin modificar código existente
 * - DIP: Depende de abstracciones (interfaces de repositorios)
 * 
 * ✅ Mejoras de seguridad implementadas:
 * - Rate limiting con intentos fallidos
 * - Blacklist de tokens en Redis
 * - Validación robusta de contraseñas
 * 
 * Este servicio actúa como orquestador, no como implementador
 */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly validateCredentialsUseCase: ValidateUserCredentialsUseCase,
    private readonly buildAuthUserUseCase: BuildAuthUserUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly resetPasswordUseCase: ResetPasswordUseCase,
    private readonly tokenService: TokenService,
    private readonly sessionService: SessionService,
    private readonly tokenBlacklistService: TokenBlacklistService,
    private readonly loginAttemptsService: LoginAttemptsService,
    private readonly dataSource: DataSourceService,
    private readonly configService: ConfigService,
  ) { }

  /**
   * Login - Orquesta el proceso de autenticación con protección contra fuerza bruta
   */
  async login(loginUserDto: LoginUserDto, ip: string) {
    const { password, email } = loginUserDto;

    try {
      // 1. Verificar si la cuenta está bloqueada
      await this.loginAttemptsService.checkIfLocked(email);

      // 2. Validar credenciales (Use Case)
      const validatedUser = await this.validateCredentialsUseCase.execute(email, password);

      // 3. Resetear intentos fallidos después de login exitoso
      await this.loginAttemptsService.resetFailedAttempts(email);

      // 4. Obtener datos completos del usuario (Use Case)
      const empresaData = await this.getEmpresaData(validatedUser.uuid);
      const authUser = await this.buildAuthUserUseCase.execute(
        validatedUser.uuid,
        ip,
        empresaData,
      );

      // 5. Registrar sesión y auditoría (Service)
      await this.sessionService.recordLoginSuccess(validatedUser.ideUsua, ip);

      // 6. Generar token (Service)
      const accessToken = this.tokenService.generateAccessToken(validatedUser.uuid);

      // 7. Registrar token activo para posible invalidación
      const expirationTime = this.getTokenExpirationSeconds();
      await this.tokenBlacklistService.registerUserToken(
        validatedUser.uuid,
        accessToken,
        expirationTime
      );

      this.logger.log(`Login exitoso: ${email} desde ${ip}`);

      return {
        accessToken,
        user: authUser,
      };
    } catch (error) {
      // Registrar intento fallido si es error de autenticación
      if (error instanceof UnauthorizedException) {
        const attempts = await this.loginAttemptsService.recordFailedAttempt(email);
        const remaining = 5 - attempts;

        this.logger.warn(
          `Intento de login fallido: ${email} desde ${ip}. Intentos: ${attempts}/5`
        );

        if (remaining > 0 && attempts < 5) {
          throw new UnauthorizedException(
            `Credenciales inválidas. Le quedan ${remaining} intento(s) antes de bloqueo temporal.`
          );
        }
      }

      throw error;
    }
  }

  /**
   * Verifica el estado de autenticación
   */
  async checkAuthStatus(user: AuthUser) {
    return {
      user,
      accessToken: this.tokenService.generateAccessToken(user.id),
    };
  }

  /**
   * Cierra la sesión del usuario e invalida el token
   */
  async logout(ideUsua: number, ip: string, token: string, device: string = '') {
    try {
      // 1. Agregar token a blacklist
      const decoded = this.tokenService.decodeToken(token);
      if (decoded && decoded.exp) {
        const expiresIn = decoded.exp - Math.floor(Date.now() / 1000);
        if (expiresIn > 0) {
          await this.tokenBlacklistService.blacklistToken(token, expiresIn);
        }
      }

      // 2. Registrar logout en base de datos
      await this.sessionService.recordLogout(ideUsua, ip, device);

      this.logger.log(`Logout exitoso: Usuario ${ideUsua} desde ${ip}`);

      return {
        message: 'Sesión cerrada exitosamente',
      };
    } catch (error) {
      this.logger.error(`Error en logout: ${error.message}`);
      throw error;
    }
  }

  /**
   * Cambia la contraseña del usuario e invalida todos sus tokens
   */
  async changePassword(changePasswordDto: ChangePasswordDto, userId: string) {
    const { ide_usua, currentPassword, newPassword } = changePasswordDto;

    try {
      // 1. Cambiar contraseña
      const result = await this.changePasswordUseCase.execute(ide_usua, currentPassword, newPassword);

      // 2. Invalidar todos los tokens del usuario
      await this.tokenBlacklistService.blacklistAllUserTokens(userId);

      this.logger.log(`Contraseña cambiada: Usuario ${ide_usua}`);

      return result;
    } catch (error) {
      this.logger.error(`Error al cambiar contraseña: ${error.message}`);
      throw error;
    }
  }

  /**
   * Resetea la contraseña del usuario a "Temporal1" y activa el flag de cambio de clave
   */
  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    const { ide_usua } = resetPasswordDto;

    try {
      // Resetear contraseña y activar flag de cambio
      const result = await this.resetPasswordUseCase.execute(ide_usua);

      this.logger.log(`Contraseña reseteada: Usuario ${ide_usua}`);

      return result;
    } catch (error) {
      this.logger.error(`Error al resetear contraseña: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtiene el tiempo de expiración del token en segundos
   */
  private getTokenExpirationSeconds(): number {
    const expiresIn = this.configService.get('JWT_SECRET_EXPIRES_TIME') || '8h';

    // Convertir formato (ej: "8h", "15m") a segundos
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));

    switch (unit) {
      case 'h':
        return value * 3600;
      case 'm':
        return value * 60;
      case 's':
        return value;
      default:
        return 28800; // 8 horas por defecto
    }
  }

  // ============= Métodos de soporte (podrían convertirse en use cases) =============

  /**
   * Obtiene los datos de la empresa del usuario
   * TODO: Convertir en Use Case o Repository
   */
  private async getEmpresaData(uuid: string) {
    const query = new SelectQuery(`
      SELECT 
        a.ide_empr,
        e.nom_empr,
        e.identificacion_empr,
        e.logotipo_empr
      FROM sis_usuario a
        INNER JOIN sis_empresa e ON a.ide_empr = e.ide_empr
      WHERE a.uuid = $1
    `);
    query.addParam(1, uuid);

    return this.dataSource.createSingleQuery(query);
  }

  /**
   * Obtiene perfiles de un usuario
   * Método público para usar en jwt.strategy
   */
  async getPerfilesUsuario(ide_usua: number) {
    const queryPerf = new SelectQuery(`
      SELECT
        a.ide_perf,
        nom_perf
      FROM
        sis_usuario_perfil a
        INNER JOIN sis_perfil b on a.ide_perf = b.ide_perf
      WHERE
        activo_perf = true
        AND activo_usper = true
        and a.ide_usua = $1
        and b.ide_sist = 2
    `);
    queryPerf.addIntParam(1, ide_usua);
    return this.dataSource.createSelectQuery(queryPerf);
  }

  /**
   * Obtiene sucursales de un usuario
   * Método público para usar en jwt.strategy
   */
  async getSucursalesUsuario(ide_usua: number) {
    const querySucu = new SelectQuery(`
      SELECT
        b.ide_sucu,
        nom_sucu,
        '' as logo_sucu
      FROM
        sis_usuario_sucursal a
        INNER JOIN sis_sucursal b on a.sis_ide_sucu = b.ide_sucu
      WHERE
        activo_ussu = true
        and a.ide_usua = $1
    `);
    querySucu.addIntParam(1, ide_usua);
    return this.dataSource.createSelectQuery(querySucu);
  }

  /**
   * Obtiene datos completos del usuario por UUID
   * Usado por jwt.strategy
   */
  async getPwUsuario(uuid: string) {
    const queryPass = new SelectQuery(`
      SELECT 
        a.bloqueado_usua,
        a.fecha_caduc_usua,
        fecha_vence_uscl,
        a.ide_usua,
        b.password_uscl,
        a.nom_usua,
        a.mail_usua,
        a.ide_empr,
        a.avatar_usua,
        a.nick_usua,
        a.admin_usua,
        a.cambia_clave_usua,
        e.nom_empr,
        e.identificacion_empr,
        e.logotipo_empr,
        f.fecha_auac,
        f.ip_auac,
        a.uuid
      FROM 
        sis_usuario a 
        INNER JOIN sis_usuario_clave b ON a.ide_usua = b.ide_usua 
        INNER JOIN sis_empresa e ON a.ide_empr = e.ide_empr
        LEFT JOIN (
          SELECT  
            TO_TIMESTAMP(fecha_auac || ' ' || hora_auac, 'YYYY-MM-DD HH24:MI:SS') AS fecha_auac, 
            ide_usua,
            ip_auac
          FROM sis_auditoria_acceso 
          WHERE ide_acau = 1
          ORDER BY ide_auac DESC
          LIMIT 1
        ) f ON a.ide_usua = f.ide_usua
      WHERE 
        uuid = $1
        AND a.activo_usua = true 
        AND b.activo_uscl = true   
    `);
    queryPass.addParam(1, uuid);
    return this.dataSource.createSingleQuery(queryPass);
  }

  /**
   * Valida si el perfil de un usuario tiene horario configurado
   */
  async validarHorarioLogin(dtoIn: HorarioLoginDto) {
    const query = new SelectQuery(`
      SELECT
        ide_hora,
        hora_inicio_hora,
        hora_fin_hora
      FROM
        sis_usuario_perfil a
        INNER JOIN sis_perfil b on a.ide_perf = b.ide_perf
        inner join sis_horario c on a.ide_tihor = c.ide_tihor
        and activo_perf = true
        AND activo_usper = true
        and a.ide_usua = $1
        and a.ide_perf = $2
        and dia_hora = $3
        and $4 between hora_inicio_hora
        and hora_fin_hora
        and activo_hora = true
    `);
    query.addParam(1, dtoIn.ide_usua);
    query.addParam(2, dtoIn.ide_perf);
    query.addParam(3, getDayNumber());
    query.addParam(4, getCurrentTime());
    const data = await this.dataSource.createSingleQuery(query);

    if (data) {
      return data;
    } else {
      throw new UnauthorizedException(`Horario no definido para el perfil ${dtoIn.nom_perf}`);
    }
  }

  /**
   * Obtiene el menú por rol/perfil
   */
  async getMenuByRol(dtoIn: MenuRolDto) {
    const selectQueryMenu = new SelectQuery(`
      SELECT 
        ide_opci,
        nom_opci,
        sis_ide_opci,
        tipo_opci,
        icono_opci
      FROM sis_opcion o
      WHERE ide_opci IN (
        SELECT p.ide_opci 
        FROM sis_perfil_opcion p 
        WHERE p.ide_perf = $1
      )
      AND o.ide_sist = ${this.configService.get('ID_SISTEMA')}
      ORDER BY 
        CASE 
          WHEN sis_ide_opci IS NULL THEN 1
          ELSE 2
        END,
        orden_opci
    `);

    selectQueryMenu.addNumberParam(1, dtoIn.ide_perf);
    const menuData = await this.dataSource.createSelectQuery(selectQueryMenu);

    return this.buildHierarchicalMenu(menuData, dtoIn.ide_perf);
  }

  /**
   * Construye el menú jerárquico
   */
  private buildHierarchicalMenu(menuData: any[], idePerf: number) {
    const itemMap = new Map<number, any>();
    const rootItems: any[] = [];

    // Paso 1: Crear todos los items en el mapa
    menuData.forEach((item) => {
      const perfilesArray = [`${idePerf}`];
      const menuItem = {
        ide_opci: item.ide_opci,
        title: item.nom_opci,
        path: item.tipo_opci || null,
        icon: item.icono_opci || null,
        parentId: item.sis_ide_opci,
        roles: perfilesArray,
        children: [],
      };
      itemMap.set(item.ide_opci, menuItem);
    });

    // Paso 2: Construir jerarquía
    itemMap.forEach((item) => {
      if (item.parentId === null) {
        rootItems.push(item);
      } else {
        const parent = itemMap.get(item.parentId);
        if (parent) {
          parent.children.push(item);
        }
      }
    });

    // Paso 3: Procesar estructura final
    const sections = [];

    // Buscar sección General
    const generalSection = rootItems.find((item) => item.title === 'General');
    if (generalSection && generalSection.children.length > 0) {
      sections.push({
        subheader: 'General',
        items: generalSection.children.map((child) => ({
          title: child.title,
          path: child.path,
          icon: child.icon,
        })),
      });
    }

    // Buscar sección Módulos
    const modulosSection = rootItems.find((item) => item.title === 'Módulos');
    if (modulosSection && modulosSection.children.length > 0) {
      sections.push({
        subheader: 'Módulos',
        items: modulosSection.children.map((module) => {
          const resultItem: any = {
            title: module.title,
            path: module.path,
            icon: module.icon,
          };

          // Procesar hijos recursivamente
          if (module.children.length > 0) {
            const processChildren = (children: any[]): any[] => {
              return children.map((child) => {
                const childItem: any = {
                  title: child.title,
                  path: child.path,
                };

                if (child.children.length > 0) {
                  childItem.children = processChildren(child.children);
                }

                return childItem;
              });
            };

            resultItem.children = processChildren(module.children);
          }

          return resultItem;
        }),
      });
    }

    return sections;
  }
}
