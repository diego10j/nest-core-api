import { BadRequestException, Injectable } from '@nestjs/common';
import { BaseService } from 'src/common/base-service';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { DataSourceService } from 'src/core/connection/datasource.service';
import { SelectQuery } from 'src/core/connection/helpers';
import { CoreService } from 'src/core/core.service';
import { GptService } from 'src/core/integration/gpt/gpt.service';

import { ConsultarTarifasDto } from './dto/consultar-tarifas.dto';
import { GetEnviosPorTransporteDto } from './dto/get-envios-transporte.dto';
import { GetTarifasByTransporteDto } from './dto/get-tarifas-transporte.dto';
import { GetFacturasParaRutaDto, GetRutasDto } from './dto/save-transporte.dto';

/** Resumen generado por IA sobre un lote de tarifas históricas para un peso buscado -
 * ver `TransportesService.analizarTarifasConIA`. */
export type ResumenTarifasIA = {
    resumen: string;
    sugerenciaPrecio: number | null;
    criterio: string;
    confianza: 'alta' | 'media' | 'baja';
};

// Tolerancia asimétrica fija sobre el peso buscado (no configurable por el usuario): los envíos
// reales rara vez pesan exactamente lo cotizado y suelen sesgarse levemente hacia arriba
// (empaque, redondeo de báscula), de ahí el rango -30% / +35% en vez de un ±30% simétrico.
const TOLERANCIA_INFERIOR_PCT = 30;
const TOLERANCIA_SUPERIOR_PCT = 35;

@Injectable()
export class TransportesService extends BaseService {
    constructor(
        private readonly dataSource: DataSourceService,
        private readonly core: CoreService,
        private readonly gptService: GptService,
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
                END AS provincias,
                (
                    SELECT COUNT(*) FROM cxc_transporte_factura e
                    WHERE e.ide_vgtra = t.ide_vgtra AND e.ide_empr = t.ide_empr
                ) AS num_envios
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
                t.ide_geper,
                (
                    SELECT COUNT(*)
                    FROM cxc_transporte_factura e
                    WHERE e.ide_vgtra = t.ide_vgtra
                      AND e.ide_empr = t.ide_empr
                ) AS num_envios,
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
            GROUP BY t.ide_vgtra, t.nombre_vgtra, t.logo_vgtra, t.cobertura_nacional_vgtra, t.flete_cobro_vgtra, t.ide_geper
            ORDER BY num_envios DESC, COUNT(tf.ide_vgttr) DESC, t.nombre_vgtra
        `);
        if (tieneProv) q.addIntParam(1, dtoIn.ide_geprov!);
        if (tieneCanton) q.addIntParam(tieneProv ? 2 : 1, dtoIn.ide_gecant!);
        q.addIntParam(tieneProv ? (tieneCanton ? 3 : 2) : (tieneCanton ? 2 : 1), dtoIn.ideEmpr);
        return this.dataSource.createSelectQuery(q);
    }

    /**
     * Envíos ya realizados por un transportista puntual en un rango de fechas, ordenados por
     * fecha (más reciente primero) - para ver a quién se le ha enviado, con el detalle de qué
     * se envió (productos que hacen kardex, agrupados y sumados por unidad - ej. "30 kg" aunque
     * la factura tenga varios productos en kg) y el flete cobrado.
     */
    async getEnviosPorTransporte(dtoIn: GetEnviosPorTransporteDto & HeaderParamsDto) {
        const q = new SelectQuery(`
            SELECT
                e.ide_cctfa,
                e.ide_cccfa,
                f.secuencial_cccfa,
                f.fecha_emisi_cccfa,
                f.total_cccfa,
                e.fecha_inicio_cctfa,
                e.fecha_envio_cctfa,
                cl.nom_geper AS cliente,
                cl.identificac_geper,
                cl.direccion_geper,
                prov.nombre_geprov,
                cant.nombre_gecant,
                ee.nombre_cceen AS estado_envio,
                ee.color_cceen,
                e.total_flete_cctfa,
                e.total_flete_real_cctfa,
                e.flete_pagado_cctfa,
                COALESCE(du.detalle_unidades, '[]'::json) AS detalle_unidades
            FROM cxc_transporte_factura e
            INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
            INNER JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
            LEFT JOIN gen_provincia prov ON cl.ide_geprov = prov.ide_geprov
            LEFT JOIN gen_canton cant ON cl.ide_gecant = cant.ide_gecant
            LEFT JOIN cxc_estado_envio ee ON e.ide_cceen = ee.ide_cceen
            LEFT JOIN LATERAL (
                SELECT json_agg(
                    json_build_object('unidad', s.siglas_inuni, 'cantidad', s.total)
                    ORDER BY s.total DESC
                ) AS detalle_unidades
                FROM (
                    SELECT
                        COALESCE(u.siglas_inuni, 'unid.') AS siglas_inuni,
                        SUM(d.cantidad_ccdfa) AS total
                    FROM cxc_deta_factura d
                    INNER JOIN inv_articulo p ON d.ide_inarti = p.ide_inarti
                    LEFT JOIN inv_unidad u ON p.ide_inuni = u.ide_inuni
                    WHERE d.ide_cccfa = e.ide_cccfa
                      AND p.hace_kardex_inarti = true
                    GROUP BY COALESCE(u.siglas_inuni, 'unid.')
                ) s
            ) du ON true
            WHERE e.ide_vgtra = $1
              AND e.ide_empr = $2
              AND ($3::date IS NULL OR COALESCE(e.fecha_envio_cctfa, e.fecha_inicio_cctfa, f.fecha_emisi_cccfa) >= $3)
              AND ($4::date IS NULL OR COALESCE(e.fecha_envio_cctfa, e.fecha_inicio_cctfa, f.fecha_emisi_cccfa) <= $4)
            ORDER BY COALESCE(e.fecha_envio_cctfa, e.fecha_inicio_cctfa, f.fecha_emisi_cccfa) DESC
        `, dtoIn);
        q.addIntParam(1, dtoIn.ide_vgtra);
        q.addIntParam(2, dtoIn.ideEmpr);
        q.addParam(3, dtoIn.fechaInicio ?? null);
        q.addParam(4, dtoIn.fechaFin ?? null);
        return this.dataSource.createQuery(q, 'cxc_transporte_factura');
    }

    /**
     * "Consultar Tarifas": búsqueda dinámica sobre los envíos YA REGISTRADOS (histórico real,
     * no la tarifa de catálogo) para que un vendedor pueda cotizar un costo referencial de
     * transporte - por destino (provincia/cantón/descripción libre, al menos uno obligatorio) y/o
     * por peso aproximado (requiere unidad) con tolerancia asimétrica fija (el destino del envío
     * se toma de la dirección registrada del cliente en gen_persona, no hay campo de destino
     * propio en cxc_transporte_factura). Excluye envíos con transporte propio (es_transporte_
     * propio_cctfa = true) y los que no tienen transportista asignado - típicamente retiro en
     * sucursal (ide_vgtra IS NULL, siempre con costo 0) - ninguno de los dos representa un costo
     * de flete real a un transportista, así que no sirven como referencia para cotizar uno.
     * Devuelve costo_real (flete ya cobrado) y costo_estimado
     * (flete calculado al generar el envío) para que el vendedor vea cuál es más confiable.
     * Limitado a los 300 más recientes para no devolver el histórico completo sin acotar cuando
     * la búsqueda es muy amplia. Cuando se busca por peso+unidad y hay más de 10 resultados, se
     * agrega un resumen generado por IA (ver `analizarTarifasConIA`).
     */
    async consultarTarifas(dtoIn: ConsultarTarifasDto & HeaderParamsDto) {
        if (!dtoIn.ide_geprov && !dtoIn.ide_gecant && !dtoIn.descripcion?.trim()) {
            throw new BadRequestException(
                'Debe especificar al menos un filtro de destino: provincia, cantón o descripción.',
            );
        }
        if ((dtoIn.peso != null) !== (dtoIn.ide_inuni != null)) {
            throw new BadRequestException('Para buscar por peso debe indicar también la unidad de medida.');
        }
        const tienePeso = dtoIn.peso != null && dtoIn.peso > 0 && dtoIn.ide_inuni != null;

        const q = new SelectQuery(`
            WITH envios AS (
                SELECT
                    e.ide_cctfa,
                    e.ide_cccfa,
                    e.ide_cpcfa,
                    f.secuencial_cccfa,
                    COALESCE(e.fecha_envio_cctfa, e.fecha_inicio_cctfa, f.fecha_emisi_cccfa) AS fecha_envio,
                    cl.nom_geper AS cliente,
                    cl.identificac_geper,
                    cl.direccion_geper,
                    prov.nombre_geprov,
                    cant.nombre_gecant,
                    t.ide_vgtra,
                    t.nombre_vgtra,
                    t.logo_vgtra,
                    e.total_flete_cctfa AS costo_estimado,
                    e.total_flete_real_cctfa AS costo_real,
                    e.flete_pagado_cctfa,
                    e.path_imagen_guia_cctfa,
                    COALESCE(du.detalle_unidades, '[]'::json) AS detalle_unidades,
                    -- cantidad enviada en la unidad buscada (NULL si no aplica/no tiene) - usada
                    -- para filtrar por tolerancia y para ordenar por mejor coincidencia primero
                    du.cantidad_unidad_buscada
                FROM cxc_transporte_factura e
                INNER JOIN cxc_cabece_factura f ON e.ide_cccfa = f.ide_cccfa
                INNER JOIN gen_persona cl ON f.ide_geper = cl.ide_geper
                LEFT JOIN gen_provincia prov ON cl.ide_geprov = prov.ide_geprov
                LEFT JOIN gen_canton cant ON cl.ide_gecant = cant.ide_gecant
                LEFT JOIN ven_transporte t ON e.ide_vgtra = t.ide_vgtra
                LEFT JOIN LATERAL (
                    SELECT
                        json_agg(
                            json_build_object(
                                'ide_inuni', s.ide_inuni, 'unidad', s.siglas_inuni, 'cantidad', s.total
                            ) ORDER BY s.total DESC
                        ) AS detalle_unidades,
                        MAX(s.total) FILTER (WHERE s.ide_inuni = $6::int) AS cantidad_unidad_buscada
                    FROM (
                        SELECT
                            u.ide_inuni,
                            COALESCE(u.siglas_inuni, 'unid.') AS siglas_inuni,
                            SUM(d.cantidad_ccdfa) AS total
                        FROM cxc_deta_factura d
                        INNER JOIN inv_articulo p ON d.ide_inarti = p.ide_inarti
                        LEFT JOIN inv_unidad u ON p.ide_inuni = u.ide_inuni
                        WHERE d.ide_cccfa = e.ide_cccfa
                          AND p.hace_kardex_inarti = true
                        GROUP BY u.ide_inuni, COALESCE(u.siglas_inuni, 'unid.')
                    ) s
                ) du ON true
                WHERE e.ide_empr = $1
                  AND e.es_transporte_propio_cctfa = false
                  AND e.ide_vgtra IS NOT NULL
                  AND ($2::int IS NULL OR cl.ide_geprov = $2)
                  AND ($3::int IS NULL OR cl.ide_gecant = $3)
                  AND ($4::varchar IS NULL OR (
                        prov.nombre_geprov ILIKE '%' || $4 || '%'
                        OR cant.nombre_gecant ILIKE '%' || $4 || '%'
                        OR cl.direccion_geper ILIKE '%' || $4 || '%'
                    ))
            )
            SELECT *
            FROM envios en
            WHERE (
                $5::boolean IS NOT TRUE
                OR (
                    en.cantidad_unidad_buscada IS NOT NULL
                    AND en.cantidad_unidad_buscada
                        BETWEEN $7 * (1 - ${TOLERANCIA_INFERIOR_PCT} / 100.0)
                        AND $7 * (1 + ${TOLERANCIA_SUPERIOR_PCT} / 100.0)
                )
            )
            ORDER BY fecha_envio DESC
            LIMIT 300
        `, dtoIn);
        q.addIntParam(1, dtoIn.ideEmpr);
        q.addParam(2, dtoIn.ide_geprov ?? null);
        q.addParam(3, dtoIn.ide_gecant ?? null);
        q.addParam(4, dtoIn.descripcion?.trim() || null);
        q.addParam(5, tienePeso);
        q.addParam(6, dtoIn.ide_inuni ?? null);
        q.addParam(7, dtoIn.peso ?? null);
        const rows = await this.dataSource.createSelectQuery(q);

        const resumenIA =
            tienePeso && Array.isArray(rows) && rows.length > 10
                ? await this.analizarTarifasConIA(rows, dtoIn.peso as number, dtoIn.ide_inuni as number)
                : null;

        return { rows, resumenIA };
    }

    /**
     * Genera, con IA, un resumen en criterio experto del comportamiento de precios para el peso
     * buscado y, si detecta un patrón definido (envíos con peso y costo consistentes), sugiere un
     * precio referencial único. Si los datos son dispersos o no hay suficiente consistencia,
     * `sugerenciaPrecio` viene en null en vez de inventar un número - nunca debe romper la
     * búsqueda principal (si OpenAI falla, se retorna null y el usuario solo ve los resultados).
     */
    private async analizarTarifasConIA(
        rows: any[],
        peso: number,
        ideInuni: number,
    ): Promise<ResumenTarifasIA | null> {
        try {
            const unidad =
                rows
                    .flatMap((r) => r.detalle_unidades ?? [])
                    .find((d: any) => d.ide_inuni === ideInuni)?.unidad ?? 'unidades';

            const muestra = rows.slice(0, 150).map((r) => ({
                peso: r.cantidad_unidad_buscada,
                costo_real: r.costo_real,
                costo_estimado: r.costo_estimado,
                fecha: r.fecha_envio,
                transporte: r.nombre_vgtra,
            }));

            const prompt = `Eres un analista de logística de una empresa ecuatoriana, experto en fletes de transporte terrestre.
Se te entrega un listado de envíos históricos reales para un peso buscado de ${peso} ${unidad}, cada uno con el peso realmente enviado (similar al buscado), el costo real cobrado (o estimado si no hay real), el transportista y la fecha.

Tu tarea:
1. Redacta un resumen breve (2 a 4 frases, en español, tono profesional para un vendedor interno) sobre el comportamiento de precios para ese peso aproximado: rango típico, si varía mucho por transportista, si hay tendencia reciente, etc.
2. Si detectas un patrón claro y consistente (varios envíos de peso y costo similares, sin dispersión relevante), sugiere un precio referencial único en "sugerenciaPrecio".
3. Si los datos son dispersos, contradictorios o insuficientes para un patrón confiable, deja "sugerenciaPrecio" en null y explica el motivo en "criterio" - nunca inventes un precio sin respaldo en los datos.
4. "confianza" refleja qué tan sólido es el patrón encontrado ("alta" = muy consistente, "media" = razonable pero con dispersión, "baja" = poco confiable o sin datos suficientes).

Responde EXCLUSIVAMENTE en JSON con esta forma exacta:
{"resumen": string, "sugerenciaPrecio": number|null, "criterio": string, "confianza": "alta"|"media"|"baja"}`;

            const result = await this.gptService.parseTextToJson(prompt, JSON.stringify(muestra));

            return {
                resumen: String(result?.resumen ?? ''),
                sugerenciaPrecio: result?.sugerenciaPrecio != null ? Number(result.sugerenciaPrecio) : null,
                criterio: String(result?.criterio ?? ''),
                confianza: (['alta', 'media', 'baja'] as const).includes(result?.confianza)
                    ? result.confianza
                    : 'media',
            };
        } catch {
            return null;
        }
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
