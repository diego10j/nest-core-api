import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { QueryOptionsDto } from '../../common/dto/query-options.dto';
import { ErrorsLoggerService } from '../../errors/errors-logger.service';
import { getCurrentDateTime, getCurrentTime, getDayNumber } from '../../util/helpers/date-util';
import { fToTitleCase } from '../../util/helpers/string-util';
import { DataSourceService } from '../connection/datasource.service';
import { SelectQuery, UpdateQuery } from '../connection/helpers';
import { AuditService } from '../modules/audit/audit.service';
import { EventAudit } from '../modules/audit/enum/event-audit';

import { ChangePasswordDto } from './dto/change-password.dto';
import { HorarioLoginDto } from './dto/horario-login.dto';
import { LoginUserDto } from './dto/login-user.dto';
import { MenuRolDto } from './dto/menu-rol.dto';
import { JwtPayload, AuthUser } from './interfaces';
import { PasswordService } from './password.service';
import { PASSWORD_MESSAGES } from './constants/password.constants';
import { UserNotFoundException } from './exceptions/user-not-found.exception';

@Injectable()
export class AuthService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly audit: AuditService,
    private readonly configService: ConfigService,
    private readonly errorsLoggerService: ErrorsLoggerService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) { }

  async login(loginUserDto: LoginUserDto, ip: string) {
    const { password, email } = loginUserDto;
    const queryUser = new SelectQuery(
      'SELECT ide_usua,uuid,cambia_clave_usua,admin_usua FROM sis_usuario WHERE mail_usua = $1 AND activo_usua=true',
    );
    queryUser.addStringParam(1, email);
    const dataUser = await this.dataSource.createSingleQuery(queryUser);
    if (!dataUser) {
      throw new UnauthorizedException('Credenciales no válidas, usuario incorrecto');
    }
    const dataPass = await this.getPwUsuario(dataUser.uuid);
    if (!dataPass) {
      throw new UnauthorizedException('Credenciales no válidas, contraseña incorrecta');
    }

    // Validar si el usuario está bloqueado
    if (dataPass.bloqueado_usua) {
      throw new UnauthorizedException('Usuario bloqueado, contactese con el administrador del sistema.');
    }

    //TODO: Verifica que el usuario no este caducado
    //TODO:  Verifica que la clave no haya caducado

    await this.validateLoginPassword(password, dataPass, dataUser.ide_usua, ip);
    // perfiles - roles
    const dataPerf = await this.getPerfilesUsuario(dataUser.ide_usua);
    if (dataPerf.length === 0) {
      throw new UnauthorizedException('El usuario no tiene perfiles asignados');
    }
    const roles = dataPerf.map((perf) => perf.ide_perf?.toString()).filter((id) => id != null);
    // sucursales
    const dataSucu = await this.getSucursalesUsuario(dataUser.ide_usua);
    if (dataSucu.length === 0) {
      throw new UnauthorizedException('El usuario no tiene sucursales asignadas');
    }
    //actualiza estado true a sessiones no cerradas
    const updateQuery = new UpdateQuery('sis_auditoria_acceso', 'ide_auac');
    updateQuery.values.set('fin_auac', true);
    updateQuery.where = 'ide_usua = $1 and ide_acau = $2 and  fin_auac = $3';
    updateQuery.addNumberParam(1, dataUser.ide_usua);
    updateQuery.addNumberParam(2, EventAudit.LOGIN_SUCCESS);
    updateQuery.addBooleanParam(3, false);
    updateQuery.setAudit(false);
    await this.dataSource.createQuery(updateQuery);
    //Auditoria
    this.audit.saveEventoAuditoria(
      dataUser.ide_usua,
      EventAudit.LOGIN_SUCCESS,
      ip,
      'Iniciar sessión',
      '', // device
    );

    return {
      accessToken: this.getJwtToken({ id: dataUser.uuid }),
      user: {
        ide_usua: Number.parseInt(dataUser.ide_usua),
        id: dataUser.uuid,
        displayName: fToTitleCase(dataPass.nom_usua),
        email: dataPass.mail_usua,
        login: dataPass.nick_usua,
        photoURL: `${this.configService.get('HOST_API')}/assets/images/avatars/${dataPass.avatar_usua}`,
        // phoneNumber: '0983113543',
        // country: 'Ecuador',
        // address: '90210 Broadway Blvd',
        // state: 'California',
        // city: 'San Francisco',
        // zipCode: '94116',
        // about: 'Praesent turpis. Phasellus viverra nulla ut metus varius laoreet. Phasellus tempus.',
        // role: 'admin',
        isPublic: dataUser.cambia_clave_usua,
        lastAccess: dataPass.fecha_auac,
        ip,
        requireChange: dataUser.cambia_clave_usua,
        isSuperUser: dataUser.admin_usua,
        perfiles: dataPerf,
        sucursales: dataSucu,
        empresas: [
          {
            ide_empr: Number.parseInt(dataPass.ide_empr),
            nom_empr: dataPass.nom_empr,
            logo_empr: dataPass.logotipo_empr,
            identificacion_empr: dataPass.identificacion_empr,
          },
        ],
        roles,
      },
    };
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

  async getMenuByRol(dtoIn: MenuRolDto) {
    // Consulta simple sin joins innecesarios
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

    // Uso correcto de itemMap para estructura jerárquica
    const buildHierarchicalMenu = () => {
      const itemMap = new Map<number, any>();
      const rootItems: any[] = [];

      // Paso 1: Crear todos los items en el mapa
      menuData.forEach((item) => {
        const perfilesArray = [`${dtoIn.ide_perf}`];
        const menuItem = {
          ide_opci: item.ide_opci,
          title: item.nom_opci,
          path: item.tipo_opci || null,
          icon: item.icono_opci || null,
          parentId: item.sis_ide_opci,
          roles: perfilesArray, // Usamos los perfiles obtenidos
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
            // ide_opci: child.ide_opci,
            // allowedRoles: child.roles // Incluimos roles
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
              // ide_opci: module.ide_opci,
              // allowedRoles: module.roles // Incluimos roles
            };

            // Procesar hijos recursivamente
            if (module.children.length > 0) {
              const processChildren = (children: any[]): any[] => {
                return children.map((child) => {
                  const childItem: any = {
                    title: child.title,
                    path: child.path,
                    // ide_opci: child.ide_opci,
                    // allowedRoles: child.roles // Incluimos roles
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
    };

    return buildHierarchicalMenu();
  }

  async checkAuthStatus(user: AuthUser) {
    return {
      user,
      accessToken: this.getJwtToken({ id: user.id }),
    };
  }

  /**
   * Cierra la sessión del usuario
   * @param QueryOptionsDto
   */
  async logout(QueryOptionsDto: QueryOptionsDto & HeaderParamsDto) {
    //actualiza estado true a sessiones no cerradas
    const updateQuery = new UpdateQuery('sis_auditoria_acceso', 'ide_auac');
    updateQuery.values.set('fin_auac', true);
    updateQuery.where = 'ide_usua = $1 and ide_acau = $2 and  fin_auac = $3';
    updateQuery.addNumberParam(1, QueryOptionsDto.ideUsua);
    updateQuery.addNumberParam(2, EventAudit.LOGOUT);
    updateQuery.addBooleanParam(3, false);
    this.dataSource.createQuery(updateQuery);
    //Auditoria
    this.audit.saveEventoAuditoria(
      QueryOptionsDto.ideUsua,
      EventAudit.LOGOUT,
      QueryOptionsDto.ip,
      'Cerrar sessión',
      QueryOptionsDto.device,
    );
    return {
      message: 'ok',
    };
  }

  /**
   * Cambia la contraseña del usuario
   * @param changePasswordDto
   */
  async changePassword(changePasswordDto: ChangePasswordDto) {
    const { ide_usua, currentPassword, newPassword } = changePasswordDto;

    const user = await this.fetchUserById(ide_usua);
    const userPassword = await this.fetchUserPasswordData(user.uuid);

    await this.passwordService.validatePassword(currentPassword, userPassword.password_uscl);
    this.passwordService.validatePasswordsDiffer(currentPassword, newPassword);

    const hashedPassword = await this.passwordService.hashPassword(newPassword);

    await this.updateUserPasswordInDatabase(ide_usua, hashedPassword);
    await this.clearPasswordChangeFlag(ide_usua);

    return {
      message: PASSWORD_MESSAGES.UPDATE_SUCCESS,
    };
  }

  /**
   * Obtiene el usuario por ID
   */
  private async fetchUserById(ideUsua: number) {
    const query = new SelectQuery(
      'SELECT uuid FROM sis_usuario WHERE ide_usua = $1 AND activo_usua = true',
    );
    query.addNumberParam(1, ideUsua);
    const user = await this.dataSource.createSingleQuery(query);

    if (!user) {
      throw new UserNotFoundException(PASSWORD_MESSAGES.USER_NOT_FOUND);
    }

    return user;
  }

  /**
   * Obtiene los datos de contraseña del usuario
   */
  private async fetchUserPasswordData(uuid: string) {
    const userPassword = await this.getPwUsuario(uuid);

    if (!userPassword) {
      throw new UnauthorizedException(PASSWORD_MESSAGES.PASSWORD_VERIFICATION_FAILED);
    }

    return userPassword;
  }

  /**
   * Actualiza la contraseña del usuario en la base de datos
   */
  private async updateUserPasswordInDatabase(ideUsua: number, hashedPassword: string) {
    const updateQuery = new UpdateQuery('sis_usuario_clave', 'ide_uscl');
    updateQuery.values.set('password_uscl', hashedPassword);
    updateQuery.values.set('fecha_vence_uscl', null);
    updateQuery.values.set('hora_actua', getCurrentDateTime());
    updateQuery.where = 'ide_usua = $1 AND activo_uscl = true';
    updateQuery.addNumberParam(1, ideUsua);
    await this.dataSource.createQuery(updateQuery);
  }

  /**
   * Limpia el flag de cambio de contraseña del usuario
   */
  private async clearPasswordChangeFlag(ideUsua: number) {
    const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');
    updateQuery.values.set('cambia_clave_usua', false);
    updateQuery.values.set('hora_actua', getCurrentDateTime());
    updateQuery.where = 'ide_usua = $1';
    updateQuery.addNumberParam(1, ideUsua);
    await this.dataSource.createQuery(updateQuery);
  }

  /**
   * Retorna password y datos del usuario
   * @param ide_usua
   * @returns
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
                WHERE ide_acau = ${EventAudit.LOGIN_SUCCESS}
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
   * Retorna Roles/Perfiles del usuario
   * @param ide_usua
   * @returns
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
   * Retorna Sucursales del usuario
   * @param ide_usua
   * @returns
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

  private getJwtToken(payload: JwtPayload) {
    const token = this.jwtService.sign(payload);
    return token;
  }

  /**
   * Valida la contraseña durante el login
   */
  private async validateLoginPassword(
    rawPassword: string,
    userPassword: any,
    userId: number,
    ip: string,
  ) {
    const isValidPassword = await bcrypt.compare(rawPassword, userPassword.password_uscl);

    if (!isValidPassword) {
      this.audit.saveEventoAuditoria(
        userId,
        EventAudit.LOGIN_ERROR,
        ip,
        'Contraseña incorrecta',
        '',
      );
      this.errorsLoggerService.createErrorLog(`Contraseña incorrecta usuario ${userPassword.nick_usua}`);
      throw new UnauthorizedException('Credenciales no válidas, Contraseña incorrecta');
    }
  }
}
