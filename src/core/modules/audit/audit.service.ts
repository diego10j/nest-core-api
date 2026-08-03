import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';

import { isDefined } from '../../../util/helpers/common-util';
import { getCurrentDate, getCurrentTime } from '../../../util/helpers/date-util';
import { DataSourceService } from '../../connection/datasource.service';
import { DeleteQuery, InsertQuery, SelectQuery } from '../../connection/helpers';

import { DeleteAuditoriaDto } from './dto/delete-auditoria.dto';
import { EventosAuditoriaDto } from './dto/eventos-auditoria.dto';
import { EventAudit } from './enum/event-audit';

@Injectable()
export class AuditService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Guarda una accion de Auditoria
   * @param ide_usua
   * @param ide_acau
   * @param ip
   * @param detalle_auac
   * @param dispositivo
   * @param fin_auac
   */
  async saveEventoAuditoria(
    ide_usua: number,
    ide_acau: number,
    ip: string,
    detalle_auac: string,
    dispositivo: string,
    fin_auac: boolean = true,
  ) {
    try {
      const insertQuery = new InsertQuery('sis_auditoria_acceso', 'ide_auac');
      insertQuery.values.set('ide_usua', ide_usua);
      insertQuery.values.set('ide_acau', ide_acau);
      insertQuery.values.set('fecha_auac', getCurrentDate());
      insertQuery.values.set('hora_auac', getCurrentTime());
      insertQuery.values.set('ip_auac', ip);
      insertQuery.values.set('fin_auac', fin_auac);
      insertQuery.values.set('id_session_auac', dispositivo);
      insertQuery.values.set('detalle_auac', detalle_auac);
      insertQuery.values.set('ide_auac', await this.dataSource.getSeqTable('sis_auditoria_acceso', 'ide_auac'));
      await this.dataSource.createQuery(insertQuery);
    } catch (error) {
      console.error('[AuditService] Error al guardar evento de auditoría:', error);
    }
  }

  /**
   * Retorna las acciones de auditoria realizadas en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getEventosAuditoria(dtoIn: EventosAuditoriaDto & HeaderParamsDto) {
    const { fechaInicio, fechaFin, ide_usua } = dtoIn;
    const condUsuario = isDefined(ide_usua) ? ' and a.ide_usua = $3' : '';
    const queryPass = new SelectQuery(`
        select a.ide_auac,fecha_auac,hora_auac,nom_usua,nom_acau,
        (select nom_opci from sis_opcion where ide_opci = CAST (a.detalle_auac as INTEGER) and a.ide_acau=11) as pantalla,
        ip_auac,detalle_auac
        from sis_auditoria_acceso a
        inner join sis_accion_auditoria b on a.ide_acau = b.ide_acau
        left join sis_usuario c on a.ide_usua = c.ide_usua
        where fecha_auac between $1 and $2
        ${condUsuario}
        order by fecha_auac desc ,hora_auac desc, nom_usua`);
    queryPass.addParam(1, fechaInicio);
    queryPass.addParam(2, fechaFin);
    if (isDefined(ide_usua)) queryPass.addIntParam(3, ide_usua);
    return this.dataSource.createQuery(queryPass);
  }

  /**
   * Elimina los registros de auditoria en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async deleteEventosAuditoria(dtoIn: DeleteAuditoriaDto & HeaderParamsDto) {
    const dq = new DeleteQuery('sis_auditoria_acceso');
    dq.where = 'fecha_auac BETWEEN $1 AND $2';
    dq.addParam(1, dtoIn.fechaInicio);
    dq.addParam(2, dtoIn.fechaFin);
    if (dtoIn.ide_auac) {
      dq.where += ' AND ide_auac = ANY($3)';
      dq.addArrayStringParam(3, dtoIn.ide_auac);
    }
    await this.dataSource.createQuery(dq);
    await this.saveEventoAuditoria(
      dtoIn.ideUsua,
      EventAudit.DELETE_AUDIT,
      dtoIn.ip,
      `${dtoIn.login} Borra Auditoria`,
      dtoIn.device,
    );
    return {
      message: 'ok',
    };
  }

  getQueryActividadesPorTabla(tableName: string, valor: number) {
    const query = new SelectQuery(`     
    SELECT
        a.ide_acti,
        a.nom_acti,
        a.ide_usua,
        a.sis_ide_usua,
        a.descripcion_acti,
        a.fecha_creacion_acti,
        a.fecha_completada_acti,
        a.historial_acti,
        a.usuario_ingre,
        a.usuario_actua,
        at.nom_actti,
        ae.nom_actes,
        a.descripcion_acti,
        a.fecha_actividad_acti,
        COALESCE(
            json_agg(
                json_build_object(
                    'ide_actco', c.ide_actco,
                    'comentario_actco', c.comentario_actco,
                    'fecha_comentario_actco', c.fecha_comentario_actco,
                    'usuario_ingre', c.usuario_ingre
                )
            ) FILTER (WHERE c.ide_actco IS NOT NULL),
            NULL
        ) AS comentarios
    FROM
        sis_actividad a
        JOIN sis_actividad_tipo at ON a.ide_actti = at.ide_actti
        JOIN sis_actividad_estado ae ON a.ide_actes = ae.ide_actes
        LEFT JOIN sis_actividad_comentario c ON c.ide_acti = a.ide_acti
    WHERE
        a.tabla_acti = $1
        AND a.valor_pk_acti = $2
    GROUP BY
        a.ide_acti,
        a.nom_acti,
        a.ide_usua,
        a.sis_ide_usua,
        a.descripcion_acti,
        a.fecha_creacion_acti,
        a.fecha_completada_acti,
        a.historial_acti,
        a.usuario_ingre,
        a.usuario_actua,
        at.nom_actti,
        ae.nom_actes,
        a.fecha_actividad_acti
        `);
    query.addStringParam(1, tableName);
    query.addIntParam(2, valor);
    return query;
  }

  /**
   * Registra la visita a una pantalla del menú (para armar "páginas más usadas" en el inicio).
   * Solo se registra si el path corresponde a una opción real de sis_opcion — las rutas de
   * detalle/edición (con id dinámico) no coinciden con ninguna opción y se ignoran en silencio.
   */
  async registrarVisitaPantalla(headers: HeaderParamsDto, path: string) {
    const queryOpcion = new SelectQuery(
      `SELECT ide_opci FROM sis_opcion WHERE tipo_opci = $1 AND ide_sist = $2`,
    );
    queryOpcion.addStringParam(1, path);
    queryOpcion.addNumberParam(2, this.configService.get('ID_SISTEMA'));
    const opcion = await this.dataSource.createSingleQuery(queryOpcion);
    if (!opcion) return;

    await this.saveEventoAuditoria(
      headers.ideUsua,
      EventAudit.PAGE_VIEW,
      headers.ip,
      String(opcion.ide_opci),
      headers.device,
    );
  }

  /**
   * Páginas más visitadas por el usuario, limitadas a las opciones que su perfil actual todavía
   * tiene permitidas (paridad con el menú real que devuelve auth.getMenuByRol).
   */
  async getPaginasMasUsadas(headers: HeaderParamsDto, limit: number) {
    const query = new SelectQuery(`
      SELECT o.ide_opci, o.nom_opci AS title, o.tipo_opci AS path, o.icono_opci AS icon,
        COUNT(*) AS visitas
      FROM sis_auditoria_acceso a
      INNER JOIN sis_opcion o ON o.ide_opci = CAST(a.detalle_auac AS INTEGER)
      INNER JOIN sis_perfil_opcion po ON po.ide_opci = o.ide_opci AND po.ide_perf = $1
      WHERE a.ide_acau = ${EventAudit.PAGE_VIEW}
        AND a.ide_usua = $2
        AND o.ide_sist = $3
        AND a.detalle_auac ~ '^\\d+$'
      GROUP BY o.ide_opci, o.nom_opci, o.tipo_opci, o.icono_opci
      ORDER BY visitas DESC
      LIMIT $4
    `);
    query.addNumberParam(1, headers.idePerf);
    query.addNumberParam(2, headers.ideUsua);
    query.addNumberParam(3, this.configService.get('ID_SISTEMA'));
    query.addNumberParam(4, limit);
    return this.dataSource.createSelectQuery(query);
  }
}
