import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { isDefined } from 'src/util/helpers/common-util';
import { getCurrentDate } from 'src/util/helpers/date-util';

import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery, InsertQuery, UpdateQuery } from '../../../connection/helpers';
import { CoreService } from '../../../core.service';

import { ChangePasswordPerfilDto } from './dto/change-password-perfil.dto';
import { ConfigPasswordDto } from './dto/config-password.dto';
import { PerfilUsuarioDto } from './dto/perfil-usuario.dto';
import { UpdatePerfilUsuarioDto } from './dto/update-perfil-usuario.dto';
import { UsuarioDto } from './dto/usuario.dto';

@Injectable()
export class UsuariosService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
    private readonly configService: ConfigService,
  ) { }

  // -------------------------------- USUARIO ---------------------------- //
  async getListDataUsuario(dto: QueryOptionsDto & HeaderParamsDto) {
    const condition = `ide_empr = ${dto.ideEmpr}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'usuario',
      primaryKey: 'ide_usua',
      columnLabel: 'nom_usua',
      condition,
    };
    return this.core.getListDataValues(dtoIn);
  }

  async getTableQueryUsuarioByUuid(dto: UsuarioDto & HeaderParamsDto) {
    let whereClause = `uuid = '${dto.uuid}'`;
    if (isDefined(dto.uuid) === false) {
      whereClause = `ide_usua = -1`;
    }

    const dtoIn = { ...dto, module: 'sis', tableName: 'usuario', primaryKey: 'ide_usua', condition: `${whereClause}` };
    return this.core.getTableQuery(dtoIn);
  }

  /**
   * Retorna el listado de Usuarios con sus perfiles
   * @returns
   */
  async getUsuarios(dtoIn?: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    SELECT
        a.uuid,
        a.ide_usua,
        a.nom_usua,
        a.nick_usua,
        a.activo_usua,
        a.avatar_usua,
        a.bloqueado_usua,
        a.fecha_reg_usua,
        a.mail_usua,
        COALESCE(
          json_agg(c.nom_perf ORDER BY c.nom_perf) FILTER (WHERE c.ide_perf IS NOT NULL),
          '[]'::json
        ) as perfiles
    FROM
        sis_usuario a
        LEFT JOIN sis_usuario_perfil b ON a.ide_usua = b.ide_usua AND b.activo_usper = true
        LEFT JOIN sis_perfil c ON b.ide_perf = c.ide_perf AND c.activo_perf = true AND c.ide_sist = 2
    WHERE
        a.ide_empr = $1
    GROUP BY
        a.uuid, a.ide_usua, a.nom_usua, a.nick_usua, a.activo_usua, a.avatar_usua, a.bloqueado_usua, a.fecha_reg_usua, a.mail_usua
    ORDER BY
        a.nom_usua`,
      dtoIn,
    );
    query.addParam(1, dtoIn.ideEmpr);
    return this.dataSource.createQuery(query);
  }


  async getTableQueryPerfilesUsuario(dto: PerfilUsuarioDto & HeaderParamsDto) {
    await this.resolveUsuarioId(dto);

    const whereClause = `ide_sist = ${dto.ide_sist} AND ide_usua = ${dto.ide_usua}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'usuario_perfil',
      primaryKey: 'ide_usper',
      condition: `${whereClause}`,
      orderBy: { column: 'ide_perf' },
    };
    return this.core.getTableQuery(dtoIn);
  }



  async getTableQuerySucursalesUsuario(dto: PerfilUsuarioDto & HeaderParamsDto) {
    await this.resolveUsuarioId(dto);

    const whereClause = `ide_usua = ${dto.ide_usua}`;
    const dtoIn = {
      ...dto,
      module: 'sis',
      tableName: 'usuario_sucursal',
      primaryKey: 'ide_ussu',
      condition: `${whereClause}`,
      orderBy: { column: 'sis_ide_sucu' },
    };
    return this.core.getTableQuery(dtoIn);
  }


  async getConfigPassword(dto?: PerfilUsuarioDto & HeaderParamsDto) {
    await this.resolveUsuarioId(dto);

    const query = new SelectQuery(
      `
    SELECT
       ide_uscl,
       ide_pecl,
       fecha_registro_uscl,
       fecha_vence_uscl,
       activo_uscl
    FROM
        sis_usuario_clave
    WHERE
        ide_usua = $1
    AND activo_uscl = true`
    );
    query.addParam(1, dto.ide_usua);
    return this.dataSource.createSingleQuery(query);
  }

  /**
   * Guarda la configuración de contraseña de un usuario
   * Si ide_uscl viene con valor, actualiza. Si no viene, crea nuevo registro.
   * @param dto ConfigPasswordDto & HeaderParamsDto
   * @returns 
   */
  async saveConfigPassword(dto: ConfigPasswordDto & HeaderParamsDto) {
    // Validar que ide_usua esté definido
    if (!isDefined(dto.ide_usua)) {
      throw new BadRequestException('El ID de usuario es requerido');
    }

    // Verificar que el usuario existe
    const queryUsuario = new SelectQuery(`SELECT ide_usua FROM sis_usuario WHERE ide_usua = $1 AND activo_usua = true`);
    queryUsuario.addNumberParam(1, dto.ide_usua);
    const usuario = await this.dataSource.createSingleQuery(queryUsuario);

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    // Validar la contraseña si se proporciona
    if (dto.password_uscl) {
      this.validatePasswordStrength(dto.password_uscl);
    }

    // Hashear la contraseña
    const hashedPassword = await bcrypt.hash(dto.password_uscl, 10);

    let ide_uscl: number;
    let message: string;

    // Si viene ide_uscl, entonces actualiza el registro existente
    if (isDefined(dto.ide_uscl)) {
      // Verificar que el registro existe
      const queryExiste = new SelectQuery(`SELECT ide_uscl FROM sis_usuario_clave WHERE ide_uscl = $1`);
      queryExiste.addNumberParam(1, dto.ide_uscl);
      const existeRegistro = await this.dataSource.createSingleQuery(queryExiste);

      if (!existeRegistro) {
        throw new NotFoundException('Configuración de contraseña no encontrada');
      }

      // Actualizar el registro existente con el estado que venga del DTO
      const updateQuery = new UpdateQuery('sis_usuario_clave', 'ide_uscl', dto);
      updateQuery.values.set('ide_pecl', dto.ide_pecl);
      updateQuery.values.set('fecha_vence_uscl', dto.fecha_vence_uscl || null);
      updateQuery.values.set('activo_uscl', dto.activo_uscl ?? true);
      updateQuery.where = 'ide_uscl = $1';
      updateQuery.addNumberParam(1, dto.ide_uscl);

      await this.dataSource.createQuery(updateQuery);

      ide_uscl = dto.ide_uscl;
      message = 'Configuración de contraseña actualizada exitosamente';
    } else {
      // No viene ide_uscl, verificar que no exista un registro para este usuario
      // para garantizar un único registro por usuario
      const queryExisteUsuario = new SelectQuery(`SELECT ide_uscl FROM sis_usuario_clave WHERE ide_usua = $1`);
      queryExisteUsuario.addNumberParam(1, dto.ide_usua);
      const registroExistente = await this.dataSource.createSingleQuery(queryExisteUsuario);

      if (registroExistente) {
        throw new BadRequestException(`El usuario ya tiene una configuración de contraseña. Use ide_uscl: ${registroExistente.ide_uscl} para actualizarla.`);
      }

      // No existe registro, crear uno nuevo
      // Obtener el siguiente ID de secuencia
      ide_uscl = await this.dataSource.getSeqTable('sis_usuario_clave', 'ide_uscl');

      // Crear la nueva configuración de contraseña
      const insertQuery = new InsertQuery('sis_usuario_clave', 'ide_uscl', dto);
      insertQuery.values.set('ide_uscl', ide_uscl);
      insertQuery.values.set('ide_usua', dto.ide_usua);
      insertQuery.values.set('ide_pecl', dto.ide_pecl);
      insertQuery.values.set('fecha_registro_uscl', getCurrentDate());
      insertQuery.values.set('fecha_vence_uscl', dto.fecha_vence_uscl || null);
      insertQuery.values.set('password_uscl', hashedPassword);
      insertQuery.values.set('clave_uscl', hashedPassword);
      insertQuery.values.set('activo_uscl', dto.activo_uscl ?? true);

      await this.dataSource.createQuery(insertQuery);

      message = 'Configuración de contraseña creada exitosamente';
    }

    return {
      success: true,
      message,
      ide_uscl,
    };
  }

  /**
   * Valida la fortaleza de la contraseña
   * @private
   */
  private validatePasswordStrength(password: string): void {
    // Validar longitud mínima (según el DTO debe ser 8, pero las constantes dicen 4)
    if (password.length < 8) {
      throw new BadRequestException('La contraseña debe tener al menos 8 caracteres');
    }

    // Validar longitud máxima
    if (password.length > 80) {
      throw new BadRequestException('La contraseña no puede exceder 80 caracteres');
    }

    // Validación básica: al menos debe contener letras y números
    const hasLetters = /[a-zA-Z]/.test(password);
    const hasNumbers = /[0-9]/.test(password);

    if (!hasLetters || !hasNumbers) {
      throw new BadRequestException('La contraseña debe contener al menos letras y números');
    }
  }


  /**
   * Resuelve el UUID del usuario a ide_usua
   * @private
   */
  private async resolveUsuarioId(dto: PerfilUsuarioDto): Promise<void> {
    if (dto.uuid && !isDefined(dto.ide_usua)) {
      const query = new SelectQuery(
        `SELECT ide_usua FROM sis_usuario WHERE uuid = $1`,
      );
      query.addParam(1, dto.uuid);
      const res = await this.dataSource.createSingleQuery(query);
      if (!res) {
        throw new NotFoundException(`Usuario no encontrado`);
      }
      dto.ide_usua = res.ide_usua;
    }

    if (isDefined(dto.ide_usua) === false) {
      throw new BadRequestException('No se pudo determinar el ID de usuario');
    }
  }

  // -------------------------------- PERFIL USUARIO ---------------------------- //

  async updatePerfilUsuario(dto: UpdatePerfilUsuarioDto, ide_usua: number, login: string) {
    if (!isDefined(dto.nom_usua) && !isDefined(dto.avatar_usua)) {
      throw new BadRequestException('Debe enviar al menos nom_usua o avatar_usua para actualizar');
    }

    const usuarioActual = await this.findUsuarioById(ide_usua);

    const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');

    if (isDefined(dto.nom_usua)) {
      updateQuery.values.set('nom_usua', dto.nom_usua);
    }
    if (isDefined(dto.avatar_usua)) {
      updateQuery.values.set('avatar_usua', dto.avatar_usua);
    }

    updateQuery.values.set('usuario_actua', login);
    updateQuery.where = 'ide_usua = $1';
    updateQuery.addNumberParam(1, ide_usua);

    await this.dataSource.createQuery(updateQuery);

    const hostApi = this.configService.get('HOST_API');
    const avatarFinal = dto.avatar_usua ?? usuarioActual.avatar_usua;

    return {
      success: true,
      message: 'Perfil actualizado exitosamente',
      nom_usua: dto.nom_usua ?? usuarioActual.nom_usua,
      avatar_usua: avatarFinal,
      avatarUrl: avatarFinal
        ? `${hostApi}/api/sistema/usuarios/getAvatar/${avatarFinal}`
        : null,
    };
  }

  async changePasswordPerfil(dto: ChangePasswordPerfilDto, ide_usua: number, login: string) {
    if (dto.newPassword !== dto.confirmNewPassword) {
      throw new BadRequestException('La nueva contraseña y la confirmación no coinciden');
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException('La nueva contraseña debe ser diferente a la actual');
    }

    const queryPass = new SelectQuery(`
      SELECT password_uscl
      FROM sis_usuario_clave
      WHERE ide_usua = $1 AND activo_uscl = true
    `);
    queryPass.addNumberParam(1, ide_usua);
    const passRecord = await this.dataSource.createSingleQuery(queryPass);

    if (!passRecord) {
      throw new NotFoundException('No se encontró la configuración de contraseña del usuario');
    }

    const isPasswordValid = await bcrypt.compare(dto.currentPassword, passRecord.password_uscl);
    if (!isPasswordValid) {
      throw new BadRequestException('La contraseña actual es incorrecta');
    }

    this.validatePasswordStrength(dto.newPassword);

    const hashedPassword = await bcrypt.hash(dto.newPassword, 10);

    const updateQuery = new UpdateQuery('sis_usuario_clave', 'ide_uscl');
    updateQuery.values.set('password_uscl', hashedPassword);
    updateQuery.values.set('clave_uscl', hashedPassword);
    updateQuery.values.set('usuario_actua', login);
    updateQuery.where = 'ide_usua = $1 AND activo_uscl = true';
    updateQuery.addNumberParam(1, ide_usua);

    await this.dataSource.createQuery(updateQuery);

    return {
      success: true,
      message: 'Contraseña actualizada exitosamente',
    };
  }

  async getPerfilUsuario(ide_usua: number, ide_empr: number) {
    const queryUsuario = new SelectQuery(`
      SELECT
        a.ide_usua,
        a.uuid,
        a.nom_usua,
        a.nick_usua,
        a.mail_usua,
        a.avatar_usua,
        a.activo_usua,
        a.bloqueado_usua,
        a.admin_usua,
        a.ide_cucor,
        a.fecha_reg_usua,
        a.fecha_caduc_usua,
        a.ide_empr
      FROM sis_usuario a
      WHERE a.ide_usua = $1 AND a.ide_empr = $2 AND a.activo_usua = true
    `);
    queryUsuario.addNumberParam(1, ide_usua);
    queryUsuario.addNumberParam(2, ide_empr);
    const usuario = await this.dataSource.createSingleQuery(queryUsuario);

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const queryPerfiles = new SelectQuery(`
      SELECT
        b.ide_perf,
        b.nom_perf,
        a.activo_usper
      FROM sis_usuario_perfil a
      INNER JOIN sis_perfil b ON a.ide_perf = b.ide_perf
      WHERE a.ide_usua = $1
        AND b.activo_perf = true
        AND b.ide_sist = 2
      ORDER BY b.nom_perf
    `);
    queryPerfiles.addNumberParam(1, ide_usua);
    const perfiles = await this.dataSource.createSelectQuery(queryPerfiles);

    const querySucursales = new SelectQuery(`
      SELECT
        b.ide_sucu,
        b.nom_sucu,
        a.activo_ussu
      FROM sis_usuario_sucursal a
      INNER JOIN sis_sucursal b ON a.sis_ide_sucu = b.ide_sucu
      WHERE a.ide_usua = $1
      ORDER BY b.nom_sucu
    `);
    querySucursales.addNumberParam(1, ide_usua);
    const sucursales = await this.dataSource.createSelectQuery(querySucursales);

    const queryUltimaConexion = new SelectQuery(`
      SELECT
        TO_TIMESTAMP(fecha_auac || ' ' || hora_auac, 'YYYY-MM-DD HH24:MI:SS') AS fecha_conexion,
        ip_auac
      FROM sis_auditoria_acceso
      WHERE ide_usua = $1 AND ide_acau = 1
      ORDER BY ide_auac DESC
      LIMIT 1
    `);
    queryUltimaConexion.addNumberParam(1, ide_usua);
    const ultimaConexion = await this.dataSource.createSingleQuery(queryUltimaConexion);

    let cuentaCorreo = null;
    if (isDefined(usuario.ide_cucor)) {
      const queryCuenta = new SelectQuery(`
        SELECT
          ide_cucor,
          alias_cucor,
          correo_cucor,
          nom_correo_cucor,
          usuario_cucor,
          activo_cucor
        FROM sis_cuenta_correo
        WHERE ide_cucor = $1
      `);
      queryCuenta.addNumberParam(1, usuario.ide_cucor);
      cuentaCorreo = await this.dataSource.createSingleQuery(queryCuenta);
    }

    const hostApi = this.configService.get('HOST_API');

    return {
      usuario: {
        ide_usua: usuario.ide_usua,
        uuid: usuario.uuid,
        nom_usua: usuario.nom_usua,
        nick_usua: usuario.nick_usua,
        mail_usua: usuario.mail_usua,
        avatar_usua: usuario.avatar_usua,
        avatarUrl: usuario.avatar_usua
          ? `${hostApi}/api/sistema/usuarios/getAvatar/${usuario.avatar_usua}`
          : null,
        activo_usua: usuario.activo_usua,
        bloqueado_usua: usuario.bloqueado_usua,
        admin_usua: usuario.admin_usua,
        fecha_reg_usua: usuario.fecha_reg_usua,
        fecha_caduc_usua: usuario.fecha_caduc_usua,
        ide_empr: usuario.ide_empr,
      },
      perfiles,
      sucursales,
      ultimaConexion: ultimaConexion
        ? {
          fechaConexion: ultimaConexion.fecha_conexion,
          ip: ultimaConexion.ip_auac,
        }
        : null,
      cuentaCorreo,
    };
  }

  async uploadAvatar(file: Express.Multer.File, ide_usua: number, login: string) {
    if (!file) {
      throw new BadRequestException('No se ha enviado ninguna imagen');
    }

    await this.findUsuarioById(ide_usua);

    const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');
    updateQuery.values.set('avatar_usua', file.filename);
    updateQuery.values.set('usuario_actua', login);
    updateQuery.where = 'ide_usua = $1';
    updateQuery.addNumberParam(1, ide_usua);

    await this.dataSource.createQuery(updateQuery);

    return {
      success: true,
      message: 'Avatar actualizado exitosamente',
      fileName: file.filename,
      originalName: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
    };
  }

  private async findUsuarioById(ide_usua: number) {
    const query = new SelectQuery(`
      SELECT ide_usua, nom_usua, avatar_usua, nick_usua, mail_usua, activo_usua
      FROM sis_usuario
      WHERE ide_usua = $1 AND activo_usua = true
    `);
    query.addNumberParam(1, ide_usua);
    const usuario = await this.dataSource.createSingleQuery(query);
    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado o inactivo');
    }
    return usuario;
  }

}
