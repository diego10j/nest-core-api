import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';

import { BdtProcesoService, calcularHuella } from './bdt-proceso.service';
import { IdeDocumentoDto } from './dto/ide-documento.dto';
import { IdeInartiDto } from './dto/ide-inarti.dto';
import { IdeProcesoDto } from './dto/ide-proceso.dto';
import { RevisarDocumentoDto } from './dto/revisar-documento.dto';
import { SetVigenteOrigenDto } from './dto/set-vigente-origen.dto';
import { UuidArchivoDto } from './dto/uuid-archivo.dto';

const lista = (rows: any[]) => ({ rowCount: rows.length, rows });

/** Lecturas y revisión manual de la base técnica (tab "Datos técnicos" del producto). */
@Injectable()
export class BdtDatosService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly proceso: BdtProcesoService,
  ) {}

  /**
   * Estado de la base técnica del producto + si hay adjuntos nuevos/modificados sin procesar
   * (compara la huella actual de los adjuntos con la del último proceso).
   */
  async getResumenProducto(dto: IdeInartiDto & HeaderParamsDto) {
    const [resumen, archivos, ultimaCorrida] = await Promise.all([
      this.dataSource.pool.query(`SELECT * FROM bdt_producto WHERE ide_inarti = $1 AND ide_empr = $2`, [
        dto.ide_inarti,
        dto.ideEmpr,
      ]),
      this.proceso.listarArchivosProducto(dto.ide_inarti, dto.ideEmpr),
      this.dataSource.pool.query(
        `SELECT ide_bdrun, estado_bdrun, fecha_inicio_bdrun, fecha_fin_bdrun, total_bdrun, procesados_bdrun,
                sin_cambios_bdrun, omitidos_bdrun, revision_bdrun, errores_bdrun, tokens_bdrun, usuario_ingre
           FROM bdt_proceso WHERE ide_inarti = $1 AND ide_empr = $2 ORDER BY ide_bdrun DESC LIMIT 1`,
        [dto.ide_inarti, dto.ideEmpr],
      ),
    ]);
    const producto = resumen.rows[0] ?? null;
    const huellaActual = calcularHuella(archivos);
    return {
      producto,
      totalAdjuntos: archivos.length,
      hayCambiosSinProcesar: archivos.length > 0 && producto?.huella_archivos_bdprd !== huellaActual,
      ultimaCorrida: ultimaCorrida.rows[0] ?? null,
    };
  }

  async getProceso(dto: IdeProcesoDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(`SELECT * FROM bdt_proceso WHERE ide_bdrun = $1 AND ide_empr = $2`, [
      dto.ide_bdrun,
      dto.ideEmpr,
    ]);
    if (!r.rows.length) throw new BadRequestException('Proceso no encontrado');
    return r.rows[0];
  }

  async getDocumentos(dto: IdeInartiDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT d.ide_bddoc, d.uuid_origen_bddoc, d.nombre_original_bddoc, d.ruta_carpeta_bddoc, d.tipo_bddoc,
              d.tipo_fuente_bddoc, d.idioma_bddoc, d.metodo_extraccion_bddoc, d.paginas_bddoc,
              d.estado_bddoc, d.confianza_bddoc, d.motivos_revision_bddoc, d.vigente_bddoc, d.publico_bddoc,
              d.producto_detectado_bddoc, d.fabricante_detectado_bddoc, d.proveedor_detectado_bddoc,
              d.lote_detectado_bddoc, d.fecha_emision_bddoc, d.fecha_revision_bddoc, d.fecha_fabricacion_bddoc,
              d.fecha_analisis_bddoc, d.fecha_vencimiento_bddoc, d.fecha_referencia_bddoc,
              d.error_bddoc, d.intentos_bddoc, d.fecha_proceso_bddoc, d.usuario_revisa_bddoc, d.fecha_revisa_bddoc,
              d.tokens_entrada_bddoc + d.tokens_salida_bddoc AS tokens,
              f.nombre_bdfab, (SELECT COUNT(*) FROM bdt_valor v WHERE v.ide_bddoc = d.ide_bddoc)::int AS total_valores,
              (SELECT COUNT(*) FROM bdt_seccion s WHERE s.ide_bddoc = d.ide_bddoc)::int AS total_secciones
         FROM bdt_documento d
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = d.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
        WHERE d.ide_inarti = $1 AND d.ide_empr = $2
        ORDER BY d.vigente_bddoc DESC, d.tipo_bddoc, d.fecha_referencia_bddoc DESC NULLS LAST, d.ide_bddoc DESC`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    return lista(r.rows);
  }

  /**
   * Documento técnico generado a partir de un adjunto ("Ver texto" en el explorador de archivos).
   * ide_bddoc = null si el archivo todavía no se ha procesado.
   */
  async getDocumentoPorArchivo(dto: UuidArchivoDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT ide_bddoc, estado_bddoc, tipo_bddoc FROM bdt_documento
        WHERE uuid_origen_bddoc = $1::uuid AND ide_empr = $2
        ORDER BY fecha_proceso_bddoc DESC NULLS LAST LIMIT 1`,
      [dto.uuid, dto.ideEmpr],
    );
    return r.rows[0] ?? { ide_bddoc: null };
  }

  /** Documento completo para la vista de revisión: texto original, traducción, valores y secciones. */
  async getDocumento(dto: IdeDocumentoDto & HeaderParamsDto) {
    const doc = await this.dataSource.pool.query(
      `SELECT d.*, f.nombre_bdfab, f.pais_bdfab, p.nombre_bdprv, l.numero_bdlot
         FROM bdt_documento d
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = d.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
         LEFT JOIN bdt_proveedor p ON p.ide_bdprv = d.ide_bdprv
         LEFT JOIN bdt_lote l ON l.ide_bdlot = d.ide_bdlot
        WHERE d.ide_bddoc = $1 AND d.ide_empr = $2`,
      [dto.ide_bddoc, dto.ideEmpr],
    );
    if (!doc.rows.length) throw new BadRequestException('Documento no encontrado');
    const [valores, secciones] = await Promise.all([
      this.dataSource.pool.query(
        `SELECT v.*, p.clave_bdpro, p.nombre_es_bdpro
           FROM bdt_valor v LEFT JOIN bdt_propiedad p ON p.ide_bdpro = v.ide_bdpro
          WHERE v.ide_bddoc = $1 ORDER BY v.pagina_bdval NULLS LAST, v.ide_bdval`,
        [dto.ide_bddoc],
      ),
      this.dataSource.pool.query(
        `SELECT ide_bdsec, numero_bdsec, clave_bdsec, titulo_bdsec, pagina_desde_bdsec, pagina_hasta_bdsec,
                contenido_bdsec, contenido_original_bdsec
           FROM bdt_seccion WHERE ide_bddoc = $1 ORDER BY numero_bdsec NULLS LAST, ide_bdsec`,
        [dto.ide_bddoc],
      ),
    ]);
    return { documento: doc.rows[0], valores: valores.rows, secciones: secciones.rows };
  }

  /** Valores técnicos vigentes del producto (especificaciones y resultados de lote). */
  async getValores(dto: IdeInartiDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT v.ide_bdval, v.ide_bddoc, v.naturaleza_bdval, v.nombre_original_bdval, v.valor_texto_bdval,
              v.operador_bdval, v.valor_num_bdval, v.valor_min_bdval, v.valor_max_bdval, v.unidad_bdval,
              v.metodo_bdval, v.especificacion_bdval, v.pagina_bdval,
              p.clave_bdpro, p.nombre_es_bdpro, p.categoria_bdpro,
              d.tipo_bddoc, d.nombre_original_bddoc, d.estado_bddoc, d.fecha_referencia_bddoc,
              l.numero_bdlot, f.nombre_bdfab
         FROM bdt_valor v
         JOIN bdt_documento d ON d.ide_bddoc = v.ide_bddoc
         LEFT JOIN bdt_propiedad p ON p.ide_bdpro = v.ide_bdpro
         LEFT JOIN bdt_lote l ON l.ide_bdlot = v.ide_bdlot
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = v.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
        WHERE v.ide_inarti = $1 AND d.ide_empr = $2 AND d.vigente_bddoc
          AND d.estado_bddoc IN ('APROBADO', 'REVISION')
        ORDER BY p.categoria_bdpro NULLS LAST, COALESCE(p.nombre_es_bdpro, v.nombre_original_bdval),
                 d.fecha_referencia_bddoc DESC NULLS LAST`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    return lista(r.rows);
  }

  async getLotes(dto: IdeInartiDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT l.*, d.nombre_original_bddoc, d.uuid_origen_bddoc, d.estado_bddoc, f.nombre_bdfab
         FROM bdt_lote l
         LEFT JOIN bdt_documento d ON d.ide_bddoc = l.ide_bddoc
         LEFT JOIN bdt_producto_fabricante pf ON pf.ide_bdpfa = l.ide_bdpfa
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
        WHERE l.ide_inarti = $1 AND l.ide_empr = $2
        ORDER BY COALESCE(l.fecha_analisis_bdlot, l.fecha_fabricacion_bdlot) DESC NULLS LAST, l.ide_bdlot DESC`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    return lista(r.rows);
  }

  /** Orígenes técnicos (producto + fabricante/grado) y cuál está vigente. */
  async getOrigenes(dto: IdeInartiDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT pf.*, f.nombre_bdfab, f.pais_bdfab, p.nombre_bdprv,
              (SELECT COUNT(*) FROM bdt_documento d WHERE d.ide_bdpfa = pf.ide_bdpfa AND d.vigente_bddoc)::int AS documentos
         FROM bdt_producto_fabricante pf
         LEFT JOIN bdt_fabricante f ON f.ide_bdfab = pf.ide_bdfab
         LEFT JOIN bdt_proveedor p ON p.ide_bdprv = pf.ide_bdprv
        WHERE pf.ide_inarti = $1 AND pf.ide_empr = $2
        ORDER BY pf.vigente_bdpfa DESC, pf.ide_bdpfa DESC`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    return lista(r.rows);
  }

  async getHistorial(dto: IdeInartiDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `SELECT h.ide_bdhis, h.accion_bdhis, h.descripcion_bdhis, h.antes_bdhis, h.despues_bdhis, h.ide_bdrun,
              h.ide_bddoc, d.nombre_original_bddoc, h.usuario_ingre, h.fecha_ingre
         FROM bdt_historial h
         LEFT JOIN bdt_documento d ON d.ide_bddoc = h.ide_bddoc
        WHERE h.ide_inarti = $1 AND h.ide_empr = $2
        ORDER BY h.fecha_ingre DESC, h.ide_bdhis DESC
        LIMIT 300`,
      [dto.ide_inarti, dto.ideEmpr],
    );
    return lista(r.rows);
  }

  /** Aprobación/rechazo manual, con corrección opcional de tipo y valores (queda en el historial). */
  async revisarDocumento(dto: RevisarDocumentoDto & HeaderParamsDto) {
    const client = await this.dataSource.pool.connect();
    try {
      await client.query('BEGIN');
      const actual = await client.query(
        `SELECT ide_inarti, tipo_bddoc, estado_bddoc, nombre_original_bddoc FROM bdt_documento
          WHERE ide_bddoc = $1 AND ide_empr = $2 FOR UPDATE`,
        [dto.ide_bddoc, dto.ideEmpr],
      );
      if (!actual.rows.length) throw new BadRequestException('Documento no encontrado');
      const doc = actual.rows[0];

      const registrar = (accion: string, descripcion: string, antes?: unknown, despues?: unknown) =>
        client.query(
          `INSERT INTO bdt_historial (ide_inarti, ide_bddoc, accion_bdhis, descripcion_bdhis, antes_bdhis,
                                      despues_bdhis, usuario_ingre, ide_empr)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            doc.ide_inarti,
            dto.ide_bddoc,
            accion,
            descripcion.slice(0, 500),
            antes ? JSON.stringify(antes) : null,
            despues ? JSON.stringify(despues) : null,
            dto.login,
            dto.ideEmpr,
          ],
        );

      if (dto.tipo && dto.tipo !== doc.tipo_bddoc) {
        await registrar('CORRECCION_MANUAL', `Tipo: ${doc.tipo_bddoc} → ${dto.tipo}`, { tipo: doc.tipo_bddoc }, { tipo: dto.tipo });
      }

      for (const v of dto.valores ?? []) {
        const previo = await client.query(
          `SELECT nombre_original_bdval, valor_texto_bdval, valor_num_bdval, valor_min_bdval, valor_max_bdval, unidad_bdval
             FROM bdt_valor WHERE ide_bdval = $1 AND ide_bddoc = $2`,
          [v.ide_bdval, dto.ide_bddoc],
        );
        if (!previo.rows.length) continue;
        const p = previo.rows[0];
        await client.query(
          `UPDATE bdt_valor SET valor_texto_bdval = COALESCE($2, valor_texto_bdval),
                  valor_num_bdval = CASE WHEN $3::boolean THEN $4 ELSE valor_num_bdval END,
                  valor_min_bdval = CASE WHEN $5::boolean THEN $6 ELSE valor_min_bdval END,
                  valor_max_bdval = CASE WHEN $7::boolean THEN $8 ELSE valor_max_bdval END,
                  unidad_bdval = COALESCE($9, unidad_bdval)
            WHERE ide_bdval = $1`,
          [
            v.ide_bdval,
            v.valor_texto ?? null,
            v.valor_num !== undefined,
            v.valor_num ?? null,
            v.valor_min !== undefined,
            v.valor_min ?? null,
            v.valor_max !== undefined,
            v.valor_max ?? null,
            v.unidad ?? null,
          ],
        );
        await registrar(
          'CORRECCION_MANUAL',
          `${p.nombre_original_bdval}: ${p.valor_texto_bdval ?? '—'} → ${v.valor_texto ?? p.valor_texto_bdval ?? '—'}`,
          p,
          v,
        );
      }

      await client.query(
        `UPDATE bdt_documento SET estado_bddoc = $2, tipo_bddoc = COALESCE($3, tipo_bddoc), tipo_fuente_bddoc =
                CASE WHEN $3 IS NOT NULL AND $3 <> tipo_bddoc THEN 'MANUAL' ELSE tipo_fuente_bddoc END,
                usuario_revisa_bddoc = $4, fecha_revisa_bddoc = NOW(), usuario_actua = $4, fecha_actua = NOW()
          WHERE ide_bddoc = $1`,
        [dto.ide_bddoc, dto.estado, dto.tipo ?? null, dto.login],
      );
      await registrar(
        dto.estado,
        `${doc.nombre_original_bddoc} ${dto.estado === 'APROBADO' ? 'aprobado' : 'rechazado'}${dto.observacion ? `: ${dto.observacion}` : ''}`,
        { estado: doc.estado_bddoc },
        { estado: dto.estado },
      );

      // Mantener los contadores del producto al día sin re-procesar.
      await client.query(
        `UPDATE bdt_producto p SET
            total_revision_bdprd = (SELECT COUNT(*) FROM bdt_documento d
                                     WHERE d.ide_inarti = p.ide_inarti AND d.vigente_bddoc AND d.estado_bddoc = 'REVISION'),
            estado_bdprd = CASE
              WHEN p.estado_bdprd = 'CON_REVISION' AND NOT EXISTS (
                     SELECT 1 FROM bdt_documento d
                      WHERE d.ide_inarti = p.ide_inarti AND d.vigente_bddoc AND d.estado_bddoc = 'REVISION')
              THEN 'ACTUALIZADO' ELSE p.estado_bdprd END,
            fecha_ultimo_cambio_bdprd = NOW(), fecha_actua = NOW()
          WHERE p.ide_inarti = $1`,
        [doc.ide_inarti],
      );

      await client.query('COMMIT');
      return { message: 'ok' };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** Marca qué origen (fabricante/grado) se comercializa actualmente — lo usa el chat como "el actual". */
  async setVigenteOrigen(dto: SetVigenteOrigenDto & HeaderParamsDto) {
    const r = await this.dataSource.pool.query(
      `UPDATE bdt_producto_fabricante SET vigente_bdpfa = $2, usuario_actua = $3, fecha_actua = NOW()
        WHERE ide_bdpfa = $1 AND ide_empr = $4
        RETURNING ide_inarti, nombre_comercial_bdpfa`,
      [dto.ide_bdpfa, dto.vigente, dto.login, dto.ideEmpr],
    );
    if (!r.rows.length) throw new BadRequestException('Origen no encontrado');
    await this.dataSource.pool.query(
      `INSERT INTO bdt_historial (ide_inarti, accion_bdhis, descripcion_bdhis, despues_bdhis, usuario_ingre, ide_empr)
       VALUES ($1, 'FABRICANTE_VIGENTE', $2, $3, $4, $5)`,
      [
        r.rows[0].ide_inarti,
        `${r.rows[0].nombre_comercial_bdpfa ?? 'Origen'} marcado como ${dto.vigente ? 'vigente' : 'no vigente'}`,
        JSON.stringify({ ide_bdpfa: dto.ide_bdpfa, vigente: dto.vigente }),
        dto.login,
        dto.ideEmpr,
      ],
    );
    return { message: 'ok' };
  }
}
