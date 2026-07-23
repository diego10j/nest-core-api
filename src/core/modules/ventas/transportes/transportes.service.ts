import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';

import { GetTarifasByTransporteDto } from './dto/get-tarifas-transporte.dto';
import { GetFacturasParaRutaDto, GetRutasDto } from './dto/save-transporte.dto';

@Injectable()
export class TransportesService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
    ) {
        super();
    }

    // ─── TRANSPORTE (ven_transporte) ──────────────────────────────────────────

    async getTransportes(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                t.ide_vgtra,
                t.ide_geper,
                p.nom_geper,
                p.identificac_geper,
                t.nombre_vgtra,
                t.descripcion_vgtra,
                t.logo_vgtra,
                t.cobertura_nacional_vgtra,
                t.flete_cobro_vgtra,
                t.activo_vgtra,
                CASE
                    WHEN t.cobertura_nacional_vgtra = TRUE
                    THEN (SELECT COUNT(*) FROM gen_provincia)
                    ELSE COALESCE(pc.provincias, 0)
                END AS provincias
            FROM ven_transporte t
            INNER JOIN gen_persona p ON t.ide_geper = p.ide_geper
            LEFT JOIN (
                SELECT ide_vgtra, COUNT(DISTINCT ide_geprov)::int AS provincias
                FROM ven_tarifa_transporte
                WHERE activo_vgttr = TRUE
                GROUP BY ide_vgtra
            ) pc ON pc.ide_vgtra = t.ide_vgtra
            WHERE t.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY t.nombre_vgtra
        `, dtoIn);
        return this.dataSource.createQuery(q, 'ven_transporte');
    }

    async getListDataTransportes(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'ven',
            tableName: 'transporte',
            primaryKey: 'ide_vgtra',
            columnLabel: 'nombre_vgtra',
            condition: `ide_empr = ${dtoIn.ideEmpr} AND activo_vgtra = true`,
        });
    }

    // ─── TARIFA TRANSPORTE (ven_tarifa_transporte) ────────────────────────────

    async getTarifasTransporte(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                tf.ide_vgttr,
                tf.ide_vgtra,
                t.nombre_vgtra,
                tf.ide_geprov,
                p.nombre_geprov,
                tf.ide_gecant,
                c.nombre_gecant,
                tf.ciudad_vgttr,
                tf.nombre1_vgttr, tf.precio1_vgttr, tf.descripcion1_vgttr, tf.activo1_vgttr,
                tf.nombre2_vgttr, tf.precio2_vgttr, tf.descripcion2_vgttr, tf.activo2_vgttr,
                tf.nombre3_vgttr, tf.precio3_vgttr, tf.descripcion3_vgttr, tf.activo3_vgttr,
                tf.nombre4_vgttr, tf.precio4_vgttr, tf.descripcion4_vgttr, tf.activo4_vgttr,
                tf.comentario_vgttr,
                tf.activo_vgttr
            FROM ven_tarifa_transporte tf
            INNER JOIN ven_transporte t ON tf.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_provincia p ON tf.ide_geprov = p.ide_geprov
            LEFT JOIN gen_canton c ON tf.ide_gecant = c.ide_gecant
            WHERE tf.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY t.nombre_vgtra, p.nombre_geprov, c.nombre_gecant, tf.ciudad_vgttr
        `, dtoIn);
        q.isLazy = false;
        return this.dataSource.createQuery(q, 'ven_tarifa_transporte');
    }

    async getTarifasByTransporte(dtoIn: GetTarifasByTransporteDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                tf.ide_vgttr,
                tf.ide_vgtra,
                t.nombre_vgtra,
                tf.ide_geprov,
                p.nombre_geprov,
                tf.ide_gecant,
                c.nombre_gecant,
                tf.ciudad_vgttr,
                tf.nombre1_vgttr, tf.precio1_vgttr, tf.descripcion1_vgttr, tf.activo1_vgttr,
                tf.nombre2_vgttr, tf.precio2_vgttr, tf.descripcion2_vgttr, tf.activo2_vgttr,
                tf.nombre3_vgttr, tf.precio3_vgttr, tf.descripcion3_vgttr, tf.activo3_vgttr,
                tf.nombre4_vgttr, tf.precio4_vgttr, tf.descripcion4_vgttr, tf.activo4_vgttr,
                tf.comentario_vgttr,
                tf.activo_vgttr
            FROM ven_tarifa_transporte tf
            INNER JOIN ven_transporte t ON tf.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_provincia p ON tf.ide_geprov = p.ide_geprov
            LEFT JOIN gen_canton c ON tf.ide_gecant = c.ide_gecant
            WHERE tf.ide_vgtra = $1
              AND tf.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY p.nombre_geprov, c.nombre_gecant, tf.ciudad_vgttr
        `, dtoIn);
        q.addIntParam(1, dtoIn.ide_vgtra);
        q.isLazy = false;
        return this.dataSource.createQuery(q, 'ven_tarifa_transporte');
    }

    // ─── ESTADO ENVÍO (cxc_estado_envio) ──────────────────────────────────────

    async getEstadosEnvio(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        return this.core.getTableQuery({
            ...dtoIn,
            module: 'cxc',
            tableName: 'estado_envio',
            primaryKey: 'ide_cceen',
            orderBy: { column: 'orden_cceen' },
            condition: 'activo_cceen = true',
        });
    }

    async getTableQueryEstadoEnvio(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        return this.core.getTableQuery({
            ...dtoIn,
            module: 'cxc',
            tableName: 'estado_envio',
            primaryKey: 'ide_cceen',
            orderBy: { column: 'orden_cceen' },
        });
    }

    async getListDataEstadosEnvio(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'cxc',
            tableName: 'estado_envio',
            primaryKey: 'ide_cceen',
            columnLabel: 'nombre_cceen',
            condition: 'activo_cceen = true',
            columnOrder: 'orden_cceen',
        });
    }

    // ─── ENVÍO (cxc_transporte_factura) ───────────────────────────────────────

    async getEnvios(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                e.ide_cctfa,
                e.ide_cccfa,
                f.secuencial_cccfa,
                f.total_cccfa,
                f.fecha_emisi_cccfa,
                cl.nom_geper AS cliente,
                cl.identificac_geper,
                e.ide_vgtra,
                t.nombre_vgtra,
                e.es_transporte_propio_cctfa,
                e.ide_gecam,
                c.placa_gecam,
                c.descripcion_gecam AS vehiculo,
                e.ide_geper,
                ch.nom_geper AS chofer,
                e.ide_cceen,
                ee.nombre_cceen,
                ee.color_cceen,
                ee.icono_cceen,
                e.fecha_inicio_cctfa,
                e.fecha_fin_cctfa,
                e.fecha_fin_real_cctfa,
                e.path_imagen_guia_cctfa,
                e.base_flete_cctfa,
                e.valor_iva_flete_cctfa,
                e.total_flete_cctfa,
                e.base_flete_real_cctfa,
                e.valor_iva_flete_real_cctfa,
                e.total_flete_real_cctfa,
                e.flete_pagado_cctfa,
                e.comentario_cctfa,
                e.enviar_por_correo_cctfa,
                e.correo_cctfa,
                e.fecha_envio_cctfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_camion c ON e.ide_gecam = c.placa_gecam
            LEFT JOIN gen_persona ch ON e.ide_geper = ch.ide_geper
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            WHERE e.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY e.ide_cctfa DESC
        `, dtoIn);
        return this.dataSource.createQuery(q, 'cxc_transporte_factura');
    }

    async getEnvioById(dtoIn: { ide_cctfa: number } & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                e.ide_cctfa,
                e.ide_cccfa,
                f.secuencial_cccfa,
                f.total_cccfa,
                f.fecha_emisi_cccfa,
                cl.nom_geper AS cliente,
                cl.identificac_geper,
                cl.direccion_geper,
                cl.telefono_geper,
                e.ide_vgtra,
                t.nombre_vgtra,
                e.es_transporte_propio_cctfa,
                e.ide_gecam,
                ca.placa_gecam,
                ca.descripcion_gecam AS vehiculo,
                e.ide_geper,
                ch2.nom_geper AS chofer,
                e.ide_cceen,
                ee.nombre_cceen,
                e.fecha_inicio_cctfa,
                e.fecha_fin_cctfa,
                e.fecha_fin_real_cctfa,
                e.path_imagen_guia_cctfa,
                e.base_flete_cctfa,
                e.valor_iva_flete_cctfa,
                e.total_flete_cctfa,
                e.base_flete_real_cctfa,
                e.valor_iva_flete_real_cctfa,
                e.total_flete_real_cctfa,
                e.flete_pagado_cctfa,
                e.comentario_cctfa,
                e.enviar_por_correo_cctfa,
                e.correo_cctfa,
                e.fecha_envio_cctfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_camion ca ON e.ide_gecam = ca.placa_gecam
            LEFT JOIN gen_persona ch2 ON e.ide_geper = ch2.ide_geper
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            WHERE e.ide_cctfa = $1
        `);
        q.addIntParam(1, dtoIn.ide_cctfa);
        const row = await this.dataSource.createSingleQuery(q);
        if (!row) throw new BadRequestException(`Envío ide_cctfa=${dtoIn.ide_cctfa} no encontrado`);
        return { row, message: 'ok' };
    }

    // ─── RUTA (ven_ruta) ──────────────────────────────────────────────────────

    async getRutas(dtoIn: GetRutasDto & HeaderParamsDto) {
        const condFecha = [];
        const params: number[] = [];
        let paramIdx = 0;

        if (dtoIn.fechaDesde) {
            paramIdx++;
            condFecha.push(`r.fecha_ruta_vgrta >= $${paramIdx}`);
            params.push(null as any);
        }
        if (dtoIn.fechaHasta) {
            paramIdx++;
            condFecha.push(`r.fecha_ruta_vgrta <= $${paramIdx}`);
            params.push(null as any);
        }

        // Reconstruir params con valores reales
        let pi = 0;
        if (dtoIn.fechaDesde) params[pi++] = dtoIn.fechaDesde as any;
        if (dtoIn.fechaHasta) params[pi++] = dtoIn.fechaHasta as any;

        const q = new SelectQuery(`
            SELECT
                r.ide_vgrta,
                r.ide_gecam,
                c.placa_gecam,
                c.descripcion_gecam,
                r.ide_geper,
                p.nom_geper AS chofer,
                r.ide_usua,
                u.nom_usua,
                r.fecha_ruta_vgrta,
                r.nombre_vgrta,
                r.latitud_inicio_vgrta,
                r.longitud_inicio_vgrta,
                r.direccion_inicio_vgrta,
                r.comentario_vgrta,
                r.activo_vgrta,
                (SELECT COUNT(1) FROM ven_ruta_det WHERE ide_vgrta = r.ide_vgrta) AS total_paradas,
                (SELECT COUNT(1) FROM ven_ruta_det WHERE ide_vgrta = r.ide_vgrta AND realizado_vgrtd = true) AS paradas_completadas
            FROM ven_ruta r
            INNER JOIN gen_camion c ON r.ide_gecam = c.placa_gecam
            INNER JOIN gen_persona p ON r.ide_geper = p.ide_geper
            LEFT JOIN sis_usuario u ON r.ide_usua = u.ide_usua
            WHERE r.ide_empr = ${dtoIn.ideEmpr}
            ${condFecha.length ? 'AND ' + condFecha.join(' AND ') : ''}
            ORDER BY r.fecha_ruta_vgrta DESC, r.ide_vgrta DESC
        `, dtoIn);
        if (dtoIn.fechaDesde) q.addParam(1, dtoIn.fechaDesde);
        if (dtoIn.fechaHasta) {
            const idx = dtoIn.fechaDesde ? 2 : 1;
            q.addParam(idx, dtoIn.fechaHasta);
        }
        return this.dataSource.createQuery(q, 'ven_ruta');
    }

    async getRutaById(dtoIn: { ide_vgrta: number } & HeaderParamsDto) {
        const qCab = new SelectQuery(`
            SELECT
                r.*, c.placa_gecam, c.descripcion_gecam,
                p.nom_geper AS chofer, u.nom_usua
            FROM ven_ruta r
            INNER JOIN gen_camion c ON r.ide_gecam = c.placa_gecam
            INNER JOIN gen_persona p ON r.ide_geper = p.ide_geper
            LEFT JOIN sis_usuario u ON r.ide_usua = u.ide_usua
            WHERE r.ide_vgrta = $1
        `);
        qCab.addIntParam(1, dtoIn.ide_vgrta);

        const qDet = new SelectQuery(`
            SELECT
                d.*,
                f.secuencial_cccfa,
                f.total_cccfa,
                f.fecha_emisi_cccfa,
                cl.nom_geper AS cliente,
                cl.identificac_geper,
                cl.direccion_geper,
                e.ide_cceen,
                e.es_transporte_propio_cctfa,
                e.path_imagen_guia_cctfa,
                ee.nombre_cceen,
                ee.color_cceen,
                t.nombre_vgtra,
                ca2.placa_gecam AS envio_placa,
                ca2.descripcion_gecam AS envio_vehiculo,
                ch2.nom_geper AS envio_chofer
            FROM ven_ruta_det d
            LEFT JOIN cxc_cabece_factura f ON d.ide_cccfa = f.ide_cccfa
            LEFT JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
            LEFT JOIN cxc_transporte_factura e ON d.ide_cctfa = e.ide_cctfa
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_camion ca2 ON e.ide_gecam = ca2.placa_gecam
            LEFT JOIN gen_persona ch2 ON e.ide_geper = ch2.ide_geper
            WHERE d.ide_vgrta = $1
            ORDER BY d.orden_vgrtd
        `);
        qDet.addIntParam(1, dtoIn.ide_vgrta);

        const [cabecera, detalles] = await Promise.all([
            this.dataSource.createSingleQuery(qCab),
            this.dataSource.createSelectQuery(qDet),
        ]);

        //  if (!cabecera) throw new BadRequestException(`Ruta ide_vgrta=${dtoIn.ide_vgrta} no encontrada`);

        return { row: { cabecera, detalles }, message: 'ok' };
    }

    async getFacturasParaRuta(dtoIn: GetFacturasParaRutaDto & HeaderParamsDto) {
        const condTipo = dtoIn.tipoEnvio === 'propio'
            ? 'AND e.es_transporte_propio_cctfa = true'
            : dtoIn.tipoEnvio === 'externo'
                ? 'AND e.es_transporte_propio_cctfa = false'
                : '';

        const condExcluir = dtoIn.ideVgrta != null
            ? `AND NOT EXISTS (SELECT 1 FROM ven_ruta_det rd WHERE rd.ide_cccfa = e.ide_cccfa AND rd.ide_vgrta = ${dtoIn.ideVgrta})`
            : '';

        const q = new SelectQuery(`
            SELECT
                f.ide_cccfa,
                f.secuencial_cccfa,
                f.total_cccfa,
                f.fecha_emisi_cccfa,
                cl.nom_geper AS cliente,
                cl.identificac_geper,
                cl.direccion_geper,
                e.ide_cctfa,
                e.ide_vgtra,
                e.es_transporte_propio_cctfa,
                e.ide_cceen,
                ee.nombre_cceen,
                ee.color_cceen,
                t.nombre_vgtra,
                e.ide_gecam,
                ca.placa_gecam,
                ca.descripcion_gecam AS vehiculo,
                e.ide_geper AS ide_chofer,
                ch.nom_geper AS chofer,
                e.fecha_inicio_cctfa,
                e.fecha_fin_cctfa,
                e.base_flete_cctfa,
                e.total_flete_cctfa,
                e.base_flete_real_cctfa,
                e.total_flete_real_cctfa,
                e.comentario_cctfa
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
            LEFT JOIN gen_camion ca ON e.ide_gecam = ca.placa_gecam
            LEFT JOIN gen_persona ch ON e.ide_geper = ch.ide_geper
            WHERE f.fecha_emisi_cccfa >= $1
              AND f.fecha_emisi_cccfa <= $2
              AND f.ide_empr = ${dtoIn.ideEmpr}
              AND f.ide_sucu = $3
              ${condTipo}
              ${condExcluir}
            ORDER BY f.secuencial_cccfa
        `, dtoIn);
        q.addParam(1, dtoIn.fechaDesde);
        q.addParam(2, dtoIn.fechaHasta);
        q.addParam(3, dtoIn.ideSucu);
        return this.dataSource.createQuery(q, 'cxc_transporte_factura');
    }

    // ─── COMBOS ADICIONALES ───────────────────────────────────────────────────

    async getListDataCamiones(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'gen',
            tableName: 'camion',
            primaryKey: 'placa_gecam',
            columnLabel: 'descripcion_gecam',
            condition: `ide_empr = ${dtoIn.ideEmpr}`,
        });
    }

    async getListDataProvincias(dtoIn: HeaderParamsDto) {
        return this.core.getListDataValues({
            ...dtoIn,
            module: 'gen',
            tableName: 'provincia',
            primaryKey: 'ide_geprov',
            columnLabel: 'nombre_geprov',
        });
    }

    /**
     * Retorna transportes disponibles para una provincia/ciudad.
     * Prioridad 1: transportes con tarifa configurada.
     * Prioridad 2: transportes con cobertura nacional sin tarifa explícita.
     */
    async getTransportesPorDestino(
        dtoIn: { ide_geprov?: number; ide_gecant?: number; ciudad_vgttr?: string } & HeaderParamsDto,
    ) {
        const tieneProv = dtoIn.ide_geprov != null;
        const tieneCanton = dtoIn.ide_gecant != null;
        // provincia filtra en CTE y LEFT JOIN. Cantón solo en LEFT JOIN (muestra todas las
        // tarifas de la provincia, no excluye transportes sin tarifa exacta de cantón).
        const condProv = tieneProv ? `AND tf.ide_geprov = $1` : '';
        const condCantonCte = ''; // NO filtrar por cantón en CTE — incluye todas las tarifas de la provincia
        const condCantonJoin = tieneCanton ? `AND tf.ide_gecant = $2` : '';
        const condCiudad = dtoIn.ciudad_vgttr
            ? `AND (tf.ciudad_vgttr ILIKE '%${dtoIn.ciudad_vgttr.replace(/'/g, "''")}%'
                 OR EXISTS (SELECT 1 FROM gen_canton WHERE ide_gecant = tf.ide_gecant AND nombre_gecant ILIKE '%${dtoIn.ciudad_vgttr.replace(/'/g, "''")}%'))`
            : '';
        const paramEmpr = tieneProv ? (tieneCanton ? '$3' : '$2') : (tieneCanton ? '$2' : '$1');

        const q = new SelectQuery(`
            WITH transportes_filtrados AS (
                SELECT DISTINCT t.ide_vgtra
                FROM ven_transporte t
                LEFT JOIN ven_tarifa_transporte tf
                    ON tf.ide_vgtra = t.ide_vgtra
                   AND tf.activo_vgttr = true
                   ${condProv}
                   ${condCantonCte}
                   ${condCiudad}
                WHERE t.activo_vgtra = true
                  AND t.ide_empr = ${paramEmpr}
                  AND (tf.ide_vgttr IS NOT NULL OR t.cobertura_nacional_vgtra = true)
            )
            SELECT
                t.ide_vgtra AS value,
                t.nombre_vgtra AS label,
                t.logo_vgtra,
                t.cobertura_nacional_vgtra,
                t.flete_cobro_vgtra,
                COALESCE(
                    json_agg(
                        json_build_object(
                            'ide_vgttr', tf.ide_vgttr,
                            'ide_geprov', tf.ide_geprov,
                            'nombre_geprov', p.nombre_geprov,
                            'ide_gecant', tf.ide_gecant,
                            'nombre_gecant', ca.nombre_gecant,
                            'ciudad_vgttr', tf.ciudad_vgttr,
                            'nombre1_vgttr', tf.nombre1_vgttr,
                            'precio1_vgttr', tf.precio1_vgttr,
                            'activo1_vgttr', tf.activo1_vgttr,
                            'descripcion1_vgttr', tf.descripcion1_vgttr,
                            'nombre2_vgttr', tf.nombre2_vgttr,
                            'precio2_vgttr', tf.precio2_vgttr,
                            'activo2_vgttr', tf.activo2_vgttr,
                            'descripcion2_vgttr', tf.descripcion2_vgttr,
                            'nombre3_vgttr', tf.nombre3_vgttr,
                            'precio3_vgttr', tf.precio3_vgttr,
                            'activo3_vgttr', tf.activo3_vgttr,
                            'descripcion3_vgttr', tf.descripcion3_vgttr,
                            'nombre4_vgttr', tf.nombre4_vgttr,
                            'precio4_vgttr', tf.precio4_vgttr,
                            'activo4_vgttr', tf.activo4_vgttr,
                            'descripcion4_vgttr', tf.descripcion4_vgttr
                        ) ORDER BY tf.ciudad_vgttr
                    ) FILTER (WHERE tf.ide_vgttr IS NOT NULL),
                    '[]'::json
                ) AS tarifas
            FROM transportes_filtrados f
            INNER JOIN ven_transporte t ON t.ide_vgtra = f.ide_vgtra
            LEFT JOIN ven_tarifa_transporte tf
                ON tf.ide_vgtra = t.ide_vgtra
               AND tf.activo_vgttr = true
               ${condProv}
               ${condCantonJoin}
               ${condCiudad}
            LEFT JOIN gen_provincia p ON tf.ide_geprov = p.ide_geprov
            LEFT JOIN gen_canton ca ON tf.ide_gecant = ca.ide_gecant
            GROUP BY t.ide_vgtra, t.nombre_vgtra, t.logo_vgtra, t.cobertura_nacional_vgtra, t.flete_cobro_vgtra
            ORDER BY COUNT(tf.ide_vgttr) DESC, t.nombre_vgtra
        `);
        if (tieneProv) q.addIntParam(1, dtoIn.ide_geprov!);
        if (tieneCanton) q.addIntParam(tieneProv ? 2 : 1, dtoIn.ide_gecant!);
        q.addIntParam(tieneProv ? (tieneCanton ? 3 : 2) : (tieneCanton ? 2 : 1), dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(q);
    }

    async getFacturasSinEnvio(dtoIn: QueryOptionsDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                f.ide_cccfa,
                f.secuencial_cccfa,
                f.fecha_emisi_cccfa,
                f.total_cccfa,
                p.nom_geper AS cliente,
                p.identificac_geper
            FROM cxc_cabece_factura f
            INNER JOIN gen_persona p ON f.ide_geper = p.ide_geper
            WHERE f.ide_empr = ${dtoIn.ideEmpr}
              AND f.ide_sucu = ${dtoIn.ideSucu}
              AND f.secuencial_cccfa IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM cxc_transporte_factura e
                  WHERE e.ide_cccfa = f.ide_cccfa
              )
            ORDER BY f.fecha_emisi_cccfa DESC
        `, dtoIn);
        return this.dataSource.createQuery(q, 'cxc_cabece_factura');
    }
}
