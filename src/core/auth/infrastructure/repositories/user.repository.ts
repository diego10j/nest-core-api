import { Injectable } from '@nestjs/common';
import { IUserRepository } from '../../domain/repositories/user.repository.interface';
import { User } from '../../domain/entities/user.entity';
import { Email } from '../../domain/value-objects/email.vo';
import { UserId } from '../../domain/value-objects/user-id.vo';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery, UpdateQuery } from '../../../connection/helpers';
import { fToTitleCase } from '../../../../util/helpers/string-util';
import { getCurrentDateTime } from '../../../../util/helpers/date-util';
import { EventAudit } from '../../../modules/audit/enum/event-audit';
import { ConfigService } from '@nestjs/config';

/**
 * Implementación del repositorio de usuarios usando PostgreSQL
 * Infrastructure Layer
 */
@Injectable()
export class UserRepository implements IUserRepository {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly configService: ConfigService,
  ) { }

  async findByEmail(email: Email): Promise<User | null> {
    const query = new SelectQuery(`
      SELECT 
        ide_usua,
        uuid,
        cambia_clave_usua,
        admin_usua,
        nom_usua,
        mail_usua,
        nick_usua,
        avatar_usua,
        bloqueado_usua,
        activo_usua
      FROM sis_usuario 
      WHERE mail_usua = $1 
        AND activo_usua = true
    `);
    query.addStringParam(1, email.value);

    const data = await this.dataSource.createSingleQuery(query);

    if (!data) {
      return null;
    }

    return this.mapToEntity(data);
  }

  async findById(id: UserId): Promise<User | null> {
    const query = new SelectQuery(`
      SELECT 
        a.ide_usua,
        a.uuid,
        a.cambia_clave_usua,
        a.admin_usua,
        a.nom_usua,
        a.mail_usua,
        a.nick_usua,
        a.avatar_usua,
        a.bloqueado_usua,
        a.activo_usua,
        a.ide_empr,
        e.nom_empr,
        e.identificacion_empr,
        e.logotipo_empr,
        f.fecha_auac,
        f.ip_auac
      FROM sis_usuario a
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
      WHERE a.uuid = $1 
        AND a.activo_usua = true
    `);
    query.addParam(1, id.value);

    const data = await this.dataSource.createSingleQuery(query);

    if (!data) {
      return null;
    }

    return this.mapToEntity(data);
  }

  async findByNumericId(ideUsua: number): Promise<User | null> {
    const query = new SelectQuery(`
      SELECT 
        ide_usua,
        uuid,
        cambia_clave_usua,
        admin_usua,
        nom_usua,
        mail_usua,
        nick_usua,
        avatar_usua,
        bloqueado_usua,
        activo_usua
      FROM sis_usuario 
      WHERE ide_usua = $1 
        AND activo_usua = true
    `);
    query.addNumberParam(1, ideUsua);

    const data = await this.dataSource.createSingleQuery(query);

    if (!data) {
      return null;
    }

    return this.mapToEntity(data);
  }

  async getPasswordHash(id: UserId): Promise<string | null> {
    const query = new SelectQuery(`
      SELECT b.password_uscl
      FROM sis_usuario a 
        INNER JOIN sis_usuario_clave b ON a.ide_usua = b.ide_usua 
      WHERE a.uuid = $1
        AND a.activo_usua = true 
        AND b.activo_uscl = true   
    `);
    query.addParam(1, id.value);

    const data = await this.dataSource.createSingleQuery(query);

    return data?.password_uscl || null;
  }

  async getPasswordHashByNumericId(ideUsua: number): Promise<string | null> {
    const query = new SelectQuery(`
      SELECT b.password_uscl
      FROM sis_usuario a 
        INNER JOIN sis_usuario_clave b ON a.ide_usua = b.ide_usua 
      WHERE a.ide_usua = $1
        AND a.activo_usua = true 
        AND b.activo_uscl = true   
    `);
    query.addNumberParam(1, ideUsua);

    const data = await this.dataSource.createSingleQuery(query);

    return data?.password_uscl || null;
  }

  async updatePassword(ideUsua: number, hashedPassword: string): Promise<void> {
    const updateQuery = new UpdateQuery('sis_usuario_clave', 'ide_uscl');
    updateQuery.values.set('password_uscl', hashedPassword);
    updateQuery.values.set('fecha_vence_uscl', null);
    updateQuery.values.set('hora_actua', getCurrentDateTime());
    updateQuery.where = 'ide_usua = $1 AND activo_uscl = true';
    updateQuery.addNumberParam(1, ideUsua);

    await this.dataSource.createQuery(updateQuery);
  }

  async clearPasswordChangeFlag(ideUsua: number): Promise<void> {
    const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');
    updateQuery.values.set('cambia_clave_usua', false);
    updateQuery.values.set('hora_actua', getCurrentDateTime());
    updateQuery.where = 'ide_usua = $1';
    updateQuery.addNumberParam(1, ideUsua);

    await this.dataSource.createQuery(updateQuery);
  }

  async setPasswordChangeFlag(ideUsua: number): Promise<void> {
    const updateQuery = new UpdateQuery('sis_usuario', 'ide_usua');
    updateQuery.values.set('cambia_clave_usua', true);
    updateQuery.values.set('hora_actua', getCurrentDateTime());
    updateQuery.where = 'ide_usua = $1';
    updateQuery.addNumberParam(1, ideUsua);

    await this.dataSource.createQuery(updateQuery);
  }

  private mapToEntity(data: any): User {
    return User.create({
      id: data.uuid,
      ideUsua: Number.parseInt(data.ide_usua),
      email: data.mail_usua,
      displayName: data.nom_usua,
      login: data.nick_usua,
      isBlocked: data.bloqueado_usua,
      isSuperUser: data.admin_usua,
      requirePasswordChange: data.cambia_clave_usua,
      photoURL: data.avatar_usua,
    });
  }
}
