import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { SearchDto } from 'src/common/dto/search.dto';
import { UuidDto } from 'src/common/dto/uuid.dto';
import { ObjectQueryDto } from 'src/core/connection/dto';
import { Query, UpdateQuery } from 'src/core/connection/helpers';
import { ResultQuery } from 'src/core/connection/interfaces/resultQuery';
import { CoreService } from 'src/core/core.service';
import { WhatsappService } from 'src/core/whatsapp/whatsapp.service';
import { validateDataRequiere } from 'src/util/helpers/common-util';
import { getCurrentDateTime, getDateFormat, getDateFormatFront } from 'src/util/helpers/date-util';
import { DataSourceService } from '../../../connection/datasource.service';
import { SelectQuery } from '../../../connection/helpers/select-query';
import { BaseService } from '../../../../common/base-service';
import { QueryOptionsDto } from '../../../../common/dto/query-options.dto';

import { IdClienteDto } from './dto/id-cliente.dto';
import { TrnClienteDto } from './dto/trn-cliente.dto';
import { VentasMensualesClienteDto } from './dto/ventas-mensuales.dto';

import { validateCedula, validateRUC } from 'src/util/helpers/validations/cedula-ruc';

import { SaveDto } from '../../../../common/dto/save.dto';

import { ExistClienteDto } from './dto/exist-client.dto';
import { ValidaWhatsAppCliente } from './dto/valida-whatsapp-cliente.dto';

const CLIENTE = {
  tableName: 'gen_persona',
  primaryKey: 'ide_geper',
};

@Injectable()
export class ClientesService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
    private readonly core: CoreService,
    private readonly whatsapp: WhatsappService,
  ) {
    super();
    // obtiene las variables del sistema para el servicio
    this.core
      .getVariables([
        'p_cxc_estado_factura_normal', // 0
        'p_cxp_estado_factura_normal', // 0
        'p_gen_tipo_identificacion_ruc', //  1
        'p_gen_tipo_identificacion_cedula', // 0
      ])
      .then((result) => {
        this.variables = result;
      });
  }

  async getCliente(dtoIn: UuidDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        SELECT
            p.ide_geper,
            p.uuid,
            p.ide_getip,
            detalle_getip,
            p.codigo_geper,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            p.nombre_compl_geper,
            p.contacto_geper,
            p.direccion_geper,
            nombre_geprov,
            nombre_gecant,
            p.correo_geper,
            p.telefono_geper,
            p.movil_geper,
            p.pagina_web_geper,
            repre_legal_geper,
            observacion_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            p.limite_credito_geper,
            dias_credito_geper,
            c.nombre_vgven,
            activo_geper,
            requiere_actua_geper,
            nombre_getitp,
            nombre_cntco,
            p.fecha_ingre,
            p.fecha_actua,
            p.usuario_ingre,
            p.usuario_actua
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN gen_tipo_persona d ON p.ide_getip = d.ide_getip
            LEFT JOIN gen_provincia e ON p.ide_geprov = e.ide_geprov
            LEFT JOIN gen_canton f ON p.ide_gecant = f.ide_gecant
            LEFT JOIN gen_titulo_persona g ON p.ide_getitp = g.ide_getitp
            LEFT JOIN gen_tipo_identifi h ON p.ide_getid = h.ide_getid
            LEFT JOIN con_tipo_contribu i ON p.ide_cntco = i.ide_cntco
        WHERE  
            uuid = $1`);
    query.addStringParam(1, dtoIn.uuid);

    const res = await this.dataSource.createSingleQuery(query);
    if (res) {
      const ide_geper = res.ide_geper;
      // Total
      const totales = await this.getInfoTotalesCliente(ide_geper);

      return {
        rowCount: 1,
        row: {
          cliente: res,
        },
        datos: { totales },

        message: 'ok',
      } as ResultQuery;
    } else {
      throw new BadRequestException(`No existe el cliente`);
    }
  }

  /**
   * Retorna el listado de clientes
   * @param dtoIn
   * @returns
   */
  async getClientes(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            detalle_getip,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            c.nombre_vgven,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN gen_tipo_persona d on p.ide_getip = d.ide_getip
            LEFT JOIN gen_tipo_identifi h on p.ide_getid = h.ide_getid
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
            AND P.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY
            p.nom_geper
        `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el listado de clientes
   * @param dtoIn
   * @returns
   */
  async getSaldosClientes(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        WITH saldo_cte AS (
            SELECT
                ide_geper,
                SUM(valor_ccdtr * signo_ccttr) AS saldo,
                MAX(ct.fecha_trans_ccctr) AS ultima_transaccion
            FROM
                cxc_detall_transa dt
                LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr
                LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr
            WHERE 
                dt.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY
                ide_geper
        )
        SELECT
            p.ide_geper,
            p.uuid,
            p.nom_geper,
            nombre_getid,
            p.identificac_geper,
            detalle_getip,
            p.correo_geper,
            p.fecha_ingre_geper,
            b.nombre_cndfp,
            c.nombre_vgven,
            ultima_transaccion,
            COALESCE(s.saldo, 0) AS saldo,
            activo_geper
        FROM
            gen_persona p
            LEFT JOIN con_deta_forma_pago b ON b.ide_cndfp = p.ide_cndfp
            LEFT JOIN ven_vendedor c ON c.ide_vgven = p.ide_vgven
            LEFT JOIN saldo_cte s ON s.ide_geper = p.ide_geper
            LEFT JOIN gen_tipo_persona d on p.ide_getip = d.ide_getip
            LEFT JOIN gen_tipo_identifi h on p.ide_getip = h.ide_getid
        WHERE
            p.es_cliente_geper = true
            AND p.identificac_geper IS NOT NULL
            AND p.nivel_geper = 'HIJO'
            AND P.ide_empr = ${dtoIn.ideEmpr}
            AND COALESCE(s.saldo, 0) != 0
        ORDER BY
            p.nom_geper
        `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna las transacciones de ingreso/egreso de un cliente en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getTrnCliente(dtoIn: TrnClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
            WITH saldo_inicial AS (
                SELECT 
                    ide_geper,
                    COALESCE(SUM(valor_ccdtr * signo_ccttr), 0) AS saldo_inicial
                FROM 
                    cxc_detall_transa dt 
                    LEFT JOIN cxc_cabece_transa ct ON dt.ide_ccctr = ct.ide_ccctr 
                    LEFT JOIN cxc_tipo_transacc tt ON tt.ide_ccttr = dt.ide_ccttr 
                WHERE 
                    ide_geper = $1
                    AND fecha_trans_ccdtr < $2
                    AND dt.ide_empr = ${dtoIn.ideEmpr}
                GROUP BY 
                    ide_geper
            ),
            movimientos AS (
                SELECT 
                    a.ide_ccdtr,
                    fecha_trans_ccdtr,
                    docum_relac_ccdtr, 
                    observacion_ccdtr AS observacion,
                    nombre_ccttr AS transaccion,            
                    CASE WHEN signo_ccttr = 1 THEN valor_ccdtr END AS debe,
                    CASE WHEN signo_ccttr = -1 THEN valor_ccdtr END AS haber,
                    0 as saldo,
                    fecha_venci_ccdtr,
                    ide_teclb,
                    ide_cnccc
                FROM 
                    cxc_detall_transa a
                    INNER JOIN cxc_tipo_transacc b ON a.ide_ccttr = b.ide_ccttr
                    INNER JOIN cxc_cabece_transa d ON a.ide_ccctr = d.ide_ccctr
                WHERE 
                    ide_geper = $3
                    AND fecha_trans_ccdtr BETWEEN $4 AND $5
                    AND a.ide_sucu = ${dtoIn.ideSucu}
                ORDER BY 
                    fecha_trans_ccdtr, a.ide_ccdtr
            )
            SELECT 
                -1 AS ide_ccdtr,
                '${getDateFormat(dtoIn.fechaInicio)}' AS fecha_trans_ccdtr,
                NULL AS docum_relac_ccdtr,
                'SALDO INICIAL AL ${getDateFormatFront(dtoIn.fechaInicio)}' AS observacion,
                'Saldo Inicial' AS transaccion,
                NULL AS debe,
                NULL AS haber,
                COALESCE(saldo_inicial.saldo_inicial, 0) AS saldo,  -- Aseguramos saldo 0 si no hay registros
                NULL AS fecha_venci_ccdtr,
                NULL AS ide_teclb,
                NULL AS ide_cnccc
            FROM 
                (SELECT 1) AS dummy
                LEFT JOIN saldo_inicial ON TRUE  -- Cambio clave para manejar casos sin registros
                
            UNION ALL
                
            SELECT 
                mov.ide_ccdtr,
                mov.fecha_trans_ccdtr,
                mov.docum_relac_ccdtr,
                mov.observacion,
                mov.transaccion,
                mov.debe,
                mov.haber,
                COALESCE(saldo_inicial.saldo_inicial, 0) + 
                COALESCE(SUM(mov.debe) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) - 
                COALESCE(SUM(mov.haber) OVER (ORDER BY mov.fecha_trans_ccdtr, mov.ide_ccdtr), 0) AS saldo,
                mov.fecha_venci_ccdtr,
                mov.ide_teclb,
                mov.ide_cnccc
            FROM 
                movimientos mov
                CROSS JOIN (SELECT COALESCE(SUM(saldo_inicial), 0) AS saldo_inicial FROM saldo_inicial) saldo_inicial
            ORDER BY 
                fecha_trans_ccdtr, ide_ccdtr
          `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_geper);
    query.addParam(2, dtoIn.fechaInicio);
    query.addIntParam(3, dtoIn.ide_geper);
    query.addParam(4, dtoIn.fechaInicio);
    query.addParam(5, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el detalle de facturas de ventas del cliente en un rango de fechas
   * @param dtoIn
   * @returns
   */
  async getDetalleVentasCliente(dtoIn: TrnClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        WITH notas_credito_detalle AS (
            SELECT 
                cdn.ide_inarti,
                lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
                SUM(cdn.valor_cpdno) AS valor_nota_credito
            FROM cxp_cabecera_nota cn
            JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE cn.fecha_emisi_cpcno BETWEEN $4 AND $5
              AND cn.ide_cpeno = 1  -- Estado normal de nota de crédito
              AND cn.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY cdn.ide_inarti, lpad(cf.secuencial_cccfa::text, 9, '0')
        )
        SELECT
            cdf.ide_ccdfa,
            cf.fecha_emisi_cccfa,
            CONCAT(
                SUBSTRING(serie_ccdaf FROM 1 FOR 3), '-', 
                SUBSTRING(serie_ccdaf FROM 4 FOR 3), '-', 
                secuencial_cccfa
            ) AS secuencial_cccfa, 
            iart.nombre_inarti,
            observacion_ccdfa,
            cdf.cantidad_ccdfa,
            uni.siglas_inuni,
            cdf.precio_ccdfa,
            cdf.total_ccdfa,
            cf.ide_cccfa,
            COALESCE(ncd.valor_nota_credito, 0) AS valor_nota_credito,
            -- Campo calculado para el neto después de nota de crédito
            (cdf.total_ccdfa - COALESCE(ncd.valor_nota_credito, 0)) AS total_neto
        FROM
            cxc_deta_factura cdf
            INNER JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            INNER JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            LEFT JOIN cxc_datos_fac df ON cf.ide_ccdaf = df.ide_ccdaf 
            LEFT JOIN inv_unidad uni ON cdf.ide_inuni = uni.ide_inuni
            LEFT JOIN notas_credito_detalle ncd ON cdf.ide_inarti = ncd.ide_inarti 
                AND lpad(cf.secuencial_cccfa::text, 9, '0') = ncd.secuencial_padded
        WHERE
            cf.ide_geper = $1
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND cf.fecha_emisi_cccfa BETWEEN $2 AND $3
            AND cf.ide_empr = ${dtoIn.ideEmpr}
        ORDER BY 
            cf.fecha_emisi_cccfa DESC, serie_ccdaf, secuencial_cccfa
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_geper);
    query.addParam(2, dtoIn.fechaInicio);
    query.addParam(3, dtoIn.fechaFin);
    query.addParam(4, dtoIn.fechaInicio);
    query.addParam(5, dtoIn.fechaFin);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Retorna el saldo del cliente
   * @param dtoIn
   * @returns
   */
  async getSaldo(dtoIn: IdClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(`     
            SELECT 
                ct.ide_geper,
                COALESCE(SUM(valor_ccdtr* signo_ccttr), 0) AS saldo
            FROM
                cxc_detall_transa dt
            INNER JOIN cxc_cabece_transa ct on dt.ide_ccctr=ct.ide_ccctr
            INNER JOIN cxc_tipo_transacc tt on tt.ide_ccttr=dt.ide_ccttr
            WHERE
                ct.ide_geper = $1
                AND ct.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY   
                ide_geper
            `);
    query.addIntParam(1, dtoIn.ide_geper);
    return await this.dataSource.createQuery(query);
  }

  /**
   * Reorna los productos que compra el cliente, con ultima fecha de compra,
   * ultimo precio de venta, cantidad, unidad
   * @param dtoIn
   * @returns
   */
  async getProductosCliente(dtoIn: IdClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `     
        WITH compras_periodo AS (
            SELECT
                d.ide_inarti,
                c.fecha_trans_incci,
                d.precio_indci
            FROM inv_det_comp_inve d
            JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
            JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
            JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
            WHERE
                c.ide_inepi = 1
                AND e.signo_intci = 1
                AND d.precio_indci > 0
                AND c.ide_intti IN (19, 16, 3025)
                AND c.ide_empr = ${dtoIn.ideEmpr}
        ),
        ultima_compra_fuera_periodo AS (
            SELECT DISTINCT ON (d.ide_inarti)
                d.ide_inarti,
                c.fecha_trans_incci,
                d.precio_indci
            FROM inv_det_comp_inve d
            JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
            JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
            JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
            WHERE
                c.ide_inepi = 1
                AND e.signo_intci = 1
                AND d.precio_indci > 0
                AND c.ide_intti IN (19, 16, 3025)
                AND c.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY d.ide_inarti, c.fecha_trans_incci DESC
        ),
        UltimasVentas AS (
            SELECT 
                a.ide_inarti, 
                MAX(b.fecha_emisi_cccfa) AS fecha_ultima_venta,
                COUNT(DISTINCT b.ide_cccfa) AS total_compras,
                SUM(a.cantidad_ccdfa) AS cantidad_total,
                AVG(a.precio_ccdfa) AS precio_promedio
            FROM cxc_deta_factura a
            INNER JOIN cxc_cabece_factura b ON a.ide_cccfa = b.ide_cccfa
            WHERE b.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND b.ide_geper = $1
            AND a.ide_empr = ${dtoIn.ideEmpr} 
            GROUP BY a.ide_inarti
        ),
        DetallesUltimaVenta AS (
            SELECT 
                uv.ide_inarti,
                b.fecha_emisi_cccfa AS fecha_ultima_venta,
                d.precio_ccdfa AS ultimo_precio,
                d.cantidad_ccdfa AS ultima_cantidad,
                u.siglas_inuni,
                b.ide_cccfa,
                b.secuencial_cccfa,
                c.serie_ccdaf,
                d.ide_ccdfa,
                iart.hace_kardex_inarti,
                -- Cálculo de precio de compra usando la lógica de f_utilidad_ventas
                COALESCE(
                    (SELECT pc.precio_indci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = d.ide_inarti
                       AND pc.fecha_trans_incci > b.fecha_emisi_cccfa
                       AND pc.fecha_trans_incci <= (b.fecha_emisi_cccfa + INTERVAL '5 days')
                     ORDER BY pc.fecha_trans_incci ASC
                     LIMIT 1),
                    (SELECT pc.precio_indci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = d.ide_inarti
                       AND pc.fecha_trans_incci <= b.fecha_emisi_cccfa
                     ORDER BY pc.fecha_trans_incci DESC
                     LIMIT 1),
                    (SELECT uc.precio_indci
                     FROM ultima_compra_fuera_periodo uc
                     WHERE uc.ide_inarti = d.ide_inarti
                     LIMIT 1),
                    0
                ) AS precio_compra,
                COALESCE(
                    (SELECT pc.fecha_trans_incci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = d.ide_inarti
                       AND pc.fecha_trans_incci > b.fecha_emisi_cccfa
                       AND pc.fecha_trans_incci <= (b.fecha_emisi_cccfa + INTERVAL '5 days')
                     ORDER BY pc.fecha_trans_incci ASC
                     LIMIT 1),
                    (SELECT pc.fecha_trans_incci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = d.ide_inarti
                       AND pc.fecha_trans_incci <= b.fecha_emisi_cccfa
                     ORDER BY pc.fecha_trans_incci DESC
                     LIMIT 1),
                    (SELECT uc.fecha_trans_incci
                     FROM ultima_compra_fuera_periodo uc
                     WHERE uc.ide_inarti = d.ide_inarti
                     LIMIT 1),
                    NULL
                ) AS fecha_ultima_compra
            FROM UltimasVentas uv
            INNER JOIN cxc_deta_factura d ON uv.ide_inarti = d.ide_inarti
            INNER JOIN cxc_cabece_factura b ON d.ide_cccfa = b.ide_cccfa AND b.fecha_emisi_cccfa = uv.fecha_ultima_venta
            INNER JOIN cxc_datos_fac c ON b.ide_ccdaf = c.ide_ccdaf
            INNER JOIN inv_articulo iart ON d.ide_inarti = iart.ide_inarti
            LEFT JOIN inv_unidad u ON d.ide_inuni = u.ide_inuni
            WHERE b.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
            AND b.ide_geper = $2
            AND b.ide_empr = ${dtoIn.ideEmpr} 
        )
        SELECT DISTINCT 
            uv.ide_inarti,
            c.nombre_inarti,
            uv.fecha_ultima_venta,
            dv.ultimo_precio,
            dv.ultima_cantidad,
            dv.siglas_inuni,
            dv.ide_cccfa,
            c.foto_inarti,
            CONCAT(
                SUBSTRING(dv.serie_ccdaf FROM 1 FOR 3), '-', 
                SUBSTRING(dv.serie_ccdaf FROM 4 FOR 3), '-', 
                dv.secuencial_cccfa
            ) AS secuencial,
            -- Métricas de compras y utilidad
            uv.total_compras,
            uv.cantidad_total,
            uv.precio_promedio,
            dv.precio_compra,
            dv.fecha_ultima_compra,
            dv.hace_kardex_inarti,
            -- Cálculos de utilidad
            CASE
                WHEN dv.hace_kardex_inarti = false THEN 0
                ELSE (dv.ultimo_precio - dv.precio_compra)
            END AS utilidad_unitaria,
            CASE
                WHEN dv.hace_kardex_inarti = false THEN 0
                ELSE ROUND((dv.ultimo_precio - dv.precio_compra) * dv.ultima_cantidad, 2)
            END AS utilidad_neta,
            CASE
                WHEN dv.hace_kardex_inarti = false THEN 0
                WHEN dv.precio_compra > 0 THEN 
                    ROUND(((dv.ultimo_precio - dv.precio_compra) / dv.precio_compra) * 100, 2)
                ELSE 0
            END AS porcentaje_utilidad,
            -- Clasificación de margen
            CASE 
                WHEN dv.precio_compra > 0 AND dv.hace_kardex_inarti = true THEN
                    CASE 
                        WHEN ((dv.ultimo_precio - dv.precio_compra) / dv.precio_compra) * 100 >= 30 THEN 'ALTO'
                        WHEN ((dv.ultimo_precio - dv.precio_compra) / dv.precio_compra) * 100 >= 15 THEN 'MEDIO'
                        ELSE 'BAJO'
                    END
                WHEN dv.hace_kardex_inarti = false THEN 'SIN_KARDEX'
                ELSE 'SIN_COSTO'
            END AS clasificacion_margen,
            -- Días desde última compra - CORREGIDO Y SIMPLIFICADO
            CASE 
                WHEN dv.fecha_ultima_compra IS NOT NULL THEN
                    (CURRENT_DATE - dv.fecha_ultima_compra)
                ELSE NULL
            END AS dias_desde_ultima_compra
        FROM UltimasVentas uv
        INNER JOIN inv_articulo c ON uv.ide_inarti = c.ide_inarti
        LEFT JOIN DetallesUltimaVenta dv ON uv.ide_inarti = dv.ide_inarti AND uv.fecha_ultima_venta = dv.fecha_ultima_venta
        ORDER BY uv.fecha_ultima_venta DESC, c.nombre_inarti
        `,
      dtoIn,
    );
    query.addIntParam(1, dtoIn.ide_geper);
    query.addIntParam(2, dtoIn.ide_geper);
    const rows = await this.dataSource.createSelectQuery(query);
    return {
      rows,
      rowCount: rows.length || 0,
    };
  }

  /**
   * Retorna el total de ventas mensuales en un período
   * @param dtoIn
   * @returns
   */
  async getVentasMensuales(dtoIn: VentasMensualesClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH FacturasFiltradas AS (
            SELECT 
                EXTRACT(MONTH FROM fecha_emisi_cccfa) AS mes,
                COUNT(ide_cccfa) AS num_facturas,
                SUM(base_grabada_cccfa) AS ventas12,
                SUM(base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas0,
                SUM(base_grabada_cccfa + base_tarifa0_cccfa + base_no_objeto_iva_cccfa) AS ventas_brutas,
                SUM(valor_iva_cccfa) AS iva,
                SUM(total_cccfa) AS total,
                AVG(total_cccfa) AS promedio_venta
            FROM 
                cxc_cabece_factura
            WHERE 
                fecha_emisi_cccfa >= $1 AND fecha_emisi_cccfa <= $2
                AND ide_geper = $3
                AND ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                AND ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM fecha_emisi_cccfa)
        ),
        NotasCredito AS (
            SELECT 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno) AS mes,
                COUNT(cn.ide_cpcno) AS num_notas_credito,
                SUM(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS total_nota_credito,
                AVG(cn.base_grabada_cpcno + cn.base_tarifa0_cpcno + cn.base_no_objeto_iva_cpcno) AS promedio_nota_credito
            FROM 
                cxp_cabecera_nota cn
            INNER JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE 
                cn.fecha_emisi_cpcno BETWEEN $4 AND $5
                AND cn.ide_cpeno = 1
                AND cn.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_geper = $6
                AND cf.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY 
                EXTRACT(MONTH FROM cn.fecha_emisi_cpcno)
        )
        SELECT 
            gm.ide_gemes,
            gm.nombre_gemes,
            COALESCE(ff.num_facturas, 0) AS num_facturas,
            COALESCE(ff.ventas12, 0) AS ventas_con_iva,
            COALESCE(ff.ventas0, 0) AS ventas_sin_iva,
            COALESCE(ff.ventas_brutas, 0) AS ventas_brutas,
            COALESCE(nc.num_notas_credito, 0) AS num_notas_credito,
            COALESCE(nc.total_nota_credito, 0) AS total_nota_credito,
            COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0) AS ventas_netas,
            COALESCE(ff.iva, 0) AS iva,
            COALESCE(ff.total, 0) - COALESCE(nc.total_nota_credito, 0) AS total_neto,
            COALESCE(ff.promedio_venta, 0) AS promedio_venta,
            COALESCE(nc.promedio_nota_credito, 0) AS promedio_nota_credito,
            -- Métricas adicionales
            CASE 
                WHEN COALESCE(ff.ventas_brutas, 0) > 0 THEN
                    ROUND((COALESCE(nc.total_nota_credito, 0) / ff.ventas_brutas * 100), 2)
                ELSE 0
            END AS porcentaje_devolucion,
            -- Cálculo mes anterior para comparación
            LAG(COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) OVER (ORDER BY gm.ide_gemes) AS ventas_netas_mes_anterior,
            CASE 
                WHEN LAG(COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) OVER (ORDER BY gm.ide_gemes) > 0 THEN
                    ROUND((((COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) - 
                           LAG(COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) OVER (ORDER BY gm.ide_gemes)) * 100.0 / 
                           LAG(COALESCE(ff.ventas_brutas, 0) - COALESCE(nc.total_nota_credito, 0)) OVER (ORDER BY gm.ide_gemes)), 2)
                ELSE NULL
            END AS crecimiento_porcentual
        FROM 
            gen_mes gm
        LEFT JOIN 
            FacturasFiltradas ff ON gm.ide_gemes = ff.mes
        LEFT JOIN 
            NotasCredito nc ON gm.ide_gemes = nc.mes
        ORDER BY 
            gm.ide_gemes
    `);

    query.addStringParam(1, `${dtoIn.periodo}-01-01`);
    query.addStringParam(2, `${dtoIn.periodo}-12-31`);
    query.addIntParam(3, dtoIn.ide_geper);
    query.addStringParam(4, `${dtoIn.periodo}-01-01`);
    query.addStringParam(5, `${dtoIn.periodo}-12-31`);
    query.addIntParam(6, dtoIn.ide_geper);

    return await this.dataSource.createQuery(query);
  }

  async save(dtoIn: SaveDto & HeaderParamsDto) {
    if (dtoIn.isUpdate === true) {
      // Actualiza el cliente
      const isValid = await this.validateUpdateCliente(dtoIn.data, dtoIn.ideEmpr);
      if (isValid) {
        const ide_geper = dtoIn.data.ide_geper;
        // delete dtoIn.data.ide_geper;
        // delete dtoIn.data.uuid;
        const objQuery = {
          operation: 'update',
          module: 'gen',
          tableName: 'persona',
          primaryKey: 'ide_geper',
          object: dtoIn.data,
          condition: `ide_geper = ${ide_geper}`,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: false,
        });
      }
    } else {
      // Crea el cliente
      const isValid = await this.validateInsertCliente(dtoIn.data, dtoIn.ideEmpr);
      if (isValid === true) {
        const objQuery = {
          operation: 'insert',
          module: 'gen',
          tableName: 'persona',
          primaryKey: 'ide_geper',
          object: dtoIn.data,
        } as ObjectQueryDto;
        return await this.core.save({
          ...dtoIn,
          listQuery: [objQuery],
          audit: true,
        });
      }
    }
  }

  async getVentasConUtilidad(dtoIn: TrnClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(`
        WITH compras_periodo AS (
            SELECT
                d.ide_inarti,
                c.fecha_trans_incci,
                d.precio_indci
            FROM inv_det_comp_inve d
            JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
            JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
            JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
            WHERE
                c.ide_inepi = 1
                AND c.fecha_trans_incci BETWEEN ($1::DATE - INTERVAL '5 days') AND ($2::DATE + INTERVAL '5 days')
                AND e.signo_intci = 1
                AND d.precio_indci > 0
                AND c.ide_intti IN (19, 16, 3025)
                AND c.ide_empr = ${dtoIn.ideEmpr}
        ),
        ultima_compra_fuera_periodo AS (
            SELECT DISTINCT ON (d.ide_inarti)
                d.ide_inarti,
                c.fecha_trans_incci,
                d.precio_indci
            FROM inv_det_comp_inve d
            JOIN inv_cab_comp_inve c ON d.ide_incci = c.ide_incci
            JOIN inv_tip_tran_inve t ON c.ide_intti = t.ide_intti
            JOIN inv_tip_comp_inve e ON t.ide_intci = e.ide_intci
            WHERE
                c.ide_inepi = 1
                AND e.signo_intci = 1
                AND d.precio_indci > 0
                AND c.ide_intti IN (19, 16, 3025)
                AND c.fecha_trans_incci < ($3::DATE - INTERVAL '5 days')
                AND c.ide_empr = ${dtoIn.ideEmpr}
            ORDER BY d.ide_inarti, c.fecha_trans_incci DESC
        ),
        datos_completos AS (
            SELECT
                cdf.ide_ccdfa,
                cdf.ide_inarti,
                cf.fecha_emisi_cccfa,
                cf.secuencial_cccfa,
                per.nom_geper,
                iart.nombre_inarti,
                cdf.cantidad_ccdfa,
                uni.siglas_inuni,
                cdf.precio_ccdfa AS precio_venta,
                cdf.total_ccdfa,
                ven.nombre_vgven,
                iart.hace_kardex_inarti,
                cf.ide_cndfp1 AS ide_cndfp,
                fp.nombre_cndfp,
                fp.dias_cndfp,
                -- Lógica mejorada para precio de compra (igual a la función):
                COALESCE(
                    -- Primero busca compras posteriores cercanas (dentro de 5 días)
                    (SELECT pc.precio_indci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = cdf.ide_inarti
                       AND pc.fecha_trans_incci > cf.fecha_emisi_cccfa
                       AND pc.fecha_trans_incci <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                     ORDER BY pc.fecha_trans_incci ASC
                     LIMIT 1),
                    -- Luego busca compras anteriores (dentro del período extendido)
                    (SELECT pc.precio_indci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = cdf.ide_inarti
                       AND pc.fecha_trans_incci <= cf.fecha_emisi_cccfa
                     ORDER BY pc.fecha_trans_incci DESC
                     LIMIT 1),
                    -- Finalmente busca la última compra anterior fuera del período
                    (SELECT uc.precio_indci
                     FROM ultima_compra_fuera_periodo uc
                     WHERE uc.ide_inarti = cdf.ide_inarti
                     LIMIT 1),
                    0
                ) AS precio_compra,
                
                COALESCE(
                    (SELECT pc.fecha_trans_incci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = cdf.ide_inarti
                       AND pc.fecha_trans_incci > cf.fecha_emisi_cccfa
                       AND pc.fecha_trans_incci <= (cf.fecha_emisi_cccfa + INTERVAL '5 days')
                     ORDER BY pc.fecha_trans_incci ASC
                     LIMIT 1),
                    (SELECT pc.fecha_trans_incci
                     FROM compras_periodo pc
                     WHERE pc.ide_inarti = cdf.ide_inarti
                       AND pc.fecha_trans_incci <= cf.fecha_emisi_cccfa
                     ORDER BY pc.fecha_trans_incci DESC
                     LIMIT 1),
                    (SELECT uc.fecha_trans_incci
                     FROM ultima_compra_fuera_periodo uc
                     WHERE uc.ide_inarti = cdf.ide_inarti
                     LIMIT 1),
                    NULL
                ) AS fecha_ultima_compra,

                cf.secuencial_cccfa AS numero_factura
            FROM cxc_deta_factura cdf
            JOIN cxc_cabece_factura cf ON cf.ide_cccfa = cdf.ide_cccfa
            JOIN inv_articulo iart ON iart.ide_inarti = cdf.ide_inarti
            JOIN gen_persona per ON cf.ide_geper = per.ide_geper
            LEFT JOIN ven_vendedor ven ON cf.ide_vgven = ven.ide_vgven
            LEFT JOIN inv_unidad uni ON uni.ide_inuni = iart.ide_inuni
            LEFT JOIN con_deta_forma_pago fp ON cf.ide_cndfp1 = fp.ide_cndfp
            WHERE
                cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                AND cf.fecha_emisi_cccfa BETWEEN $4 AND $5
                AND cf.ide_empr = ${dtoIn.ideEmpr}
                AND cf.ide_geper = $6
        ),
        facturas_con_nota AS (
            SELECT 
                lpad(cf.secuencial_cccfa::text, 9, '0') AS secuencial_padded,
                cdn.ide_inarti,
                SUM(cdn.valor_cpdno) AS valor_nota_credito
            FROM cxp_cabecera_nota cn
            JOIN cxp_detalle_nota cdn ON cn.ide_cpcno = cdn.ide_cpcno
            JOIN cxc_cabece_factura cf ON cn.num_doc_mod_cpcno LIKE '%' || lpad(cf.secuencial_cccfa::text, 9, '0')
            WHERE cn.fecha_emisi_cpcno BETWEEN $7 AND $8
              AND cn.ide_cpeno = 1
              AND cn.ide_empr = ${dtoIn.ideEmpr}
            GROUP BY lpad(cf.secuencial_cccfa::text, 9, '0'), cdn.ide_inarti
        )
        SELECT
            dc.ide_ccdfa,
            dc.ide_inarti,
            dc.fecha_emisi_cccfa,
            dc.secuencial_cccfa,
            dc.nom_geper,
            dc.nombre_inarti,
            dc.cantidad_ccdfa,
            dc.siglas_inuni,
            dc.precio_venta,
            dc.total_ccdfa,
            dc.nombre_vgven,
            dc.hace_kardex_inarti,
            dc.precio_compra,
            -- Cálculos de utilidad (igual a la función):
            CASE
                WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
                ELSE (dc.precio_venta - dc.precio_compra)
            END AS utilidad_unitaria,
            CASE
                WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
                ELSE ROUND((dc.precio_venta - dc.precio_compra) * dc.cantidad_ccdfa, 2)
            END AS utilidad_neta,
            CASE
                WHEN dc.hace_kardex_inarti = false OR COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 0
                WHEN dc.precio_compra > 0 THEN ROUND(((dc.precio_venta - dc.precio_compra) / dc.precio_compra) * 100, 2)
                ELSE 0
            END AS porcentaje_utilidad,
            -- Campos adicionales de la función:
            COALESCE(fn.valor_nota_credito, 0) AS nota_credito,
            dc.fecha_ultima_compra,
            dc.ide_cndfp,
            dc.nombre_cndfp,
            dc.dias_cndfp,
            -- Métricas adicionales:
            ROUND(dc.precio_venta * dc.cantidad_ccdfa, 2) AS venta_total,
            ROUND(dc.precio_compra * dc.cantidad_ccdfa, 2) AS costo_total,
            -- Clasificación de margen:
            CASE 
                WHEN dc.precio_compra > 0 AND dc.hace_kardex_inarti = true AND COALESCE(fn.valor_nota_credito, 0) = 0 THEN
                    CASE 
                        WHEN ((dc.precio_venta - dc.precio_compra) / dc.precio_compra) * 100 >= 30 THEN 'ALTO'
                        WHEN ((dc.precio_venta - dc.precio_compra) / dc.precio_compra) * 100 >= 15 THEN 'MEDIO'
                        ELSE 'BAJO'
                    END
                WHEN dc.hace_kardex_inarti = false THEN 'SIN_KARDEX'
                WHEN COALESCE(fn.valor_nota_credito, 0) <> 0 THEN 'CON_NOTA_CREDITO'
                ELSE 'SIN_COSTO'
            END AS clasificacion_margen
        FROM datos_completos dc
        LEFT JOIN facturas_con_nota fn ON lpad(dc.numero_factura::text, 9, '0') = fn.secuencial_padded 
                                       AND dc.ide_inarti = fn.ide_inarti
        ORDER BY 
            dc.fecha_emisi_cccfa DESC, 
            dc.secuencial_cccfa
    `);

    query.addParam(1, dtoIn.fechaInicio);
    query.addParam(2, dtoIn.fechaFin);
    query.addParam(3, dtoIn.fechaInicio);
    query.addParam(4, dtoIn.fechaInicio);
    query.addParam(5, dtoIn.fechaFin);
    query.addIntParam(6, dtoIn.ide_geper);
    query.addParam(7, dtoIn.fechaInicio);
    query.addParam(8, dtoIn.fechaFin);

    return await this.dataSource.createQuery(query);
  }
  // -------------------------------- PRIVATE FUNCTIONS ---------------------------- //

  /**
   * Validación para crear cliente
   * @param data
   */
  private async validateInsertCliente(data: any, ideEmpr: number) {
    const colReq = [
      'identificac_geper',
      'nom_geper',
      'nombre_compl_geper',
      'codigo_geper',
      'ide_getid',
      'ide_cntco',
      'direccion_geper',
      'telefono_geper',
    ];

    const resColReq = validateDataRequiere(data, colReq);

    if (resColReq.length > 0) {
      throw new BadRequestException(resColReq);
    }
    // Valida identificacion
    if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_cedula')) {
      const valid = validateCedula(data.identificac_geper);
      if (valid === false) {
        throw new BadRequestException(`Cédula ${data.identificac_geper} no válida`);
      }
    } else if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_ruc')) {
      const result = validateRUC(data.identificac_geper, false);
      if (result.isValid === false) {
        throw new BadRequestException(`${result.type} no válido`);
      }
    }

    // validar que no exista el cliente en la misma empresa
    const queryClie = new SelectQuery(`
            select
                1
            from
                gen_persona
            where
                identificac_geper = $1
            and ide_empr = $2
            `);
    queryClie.addParam(1, data.identificac_geper);
    queryClie.addParam(2, ideEmpr);
    const resClie = await this.dataSource.createSelectQuery(queryClie);
    if (resClie.length > 0) {
      throw new BadRequestException(`El cliente ${data.identificac_geper} ya existe`);
    }

    return true;
  }

  private async validateUpdateCliente(data: any, ideEmpr: number) {
    const colReq = ['ide_geper', 'ide_getid', 'identificac_geper'];

    const resColReq = validateDataRequiere(data, colReq);

    if (resColReq.length > 0) {
      throw new BadRequestException(resColReq);
    }

    // Valida identificacion
    if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_cedula')) {
      const valid = validateCedula(data.identificac_geper);
      if (valid === false) {
        throw new BadRequestException(`Cédula ${data.identificac_geper} no válida`);
      }
    } else if (data.ide_getid == this.variables.get('p_gen_tipo_identificacion_ruc')) {
      const result = validateRUC(data.identificac_geper, false);
      if (result.isValid === false) {
        throw new BadRequestException(`${result.type} no válido`);
      }
    }

    // validar que el cliente exista
    const queryClieE = new SelectQuery(`
        select
            1
        from
            gen_persona
        where
            identificac_geper = $1
        and ide_empr = $2 and ide_geper = $3
        `);
    queryClieE.addParam(1, data.identificac_geper);
    queryClieE.addParam(2, ideEmpr);
    queryClieE.addParam(3, data.ide_geper);
    const resClieE = await this.dataSource.createSelectQuery(queryClieE);
    if (resClieE.length === 0) {
      throw new BadRequestException(`El cliente ${data.identificac_geper} no existe`);
    }

    // validar que algun otro cliente no tenga la misma identificacion
    const queryClie = new SelectQuery(`
            select
                1
            from
                gen_persona
            where
                identificac_geper = $1
            and ide_empr = $2
            and ide_geper != $3
            `);
    queryClie.addParam(1, data.identificac_geper);
    queryClie.addParam(2, ideEmpr);
    queryClie.addParam(3, data.ide_geper);
    const resClie = await this.dataSource.createSelectQuery(queryClie);
    if (resClie.length > 0) {
      throw new BadRequestException(`Otro cliente ya existe con el número de identificación ${data.identificac_geper}`);
    }

    return true;
  }

  /**
   * Retorna el listado de clientes
   * @param dtoIn
   * @returns
   */
  async getDireccionesCliente(dtoIn: IdClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        select
            a.ide_gedirp,
            a.nombre_dir_gedirp,
            a.direccion_gedirp,
            a.referencia_gedirp ,
            a.telefono_gedirp ,
            a.movil_gedirp,
            a.longitud_gedirp,
            a.latitud_gedirp ,
            b.nombre_geprov ,
            c.nombre_gecant ,
            d.nombre_getidi,
            a.activo_gedirp,
            a.defecto_gedirp
        from
            gen_direccion_persona a
        left join gen_provincia b on
            a.ide_geprov = b.ide_geprov
        left join gen_canton c on
            a.ide_gecant = c.ide_gecant
        inner join gen_tipo_direccion d on
            a.ide_getidi = d.ide_getidi 
        where a.ide_geper = $1
        and a.ide_getidi is not null
        order by defecto_gedirp desc, activo_gedirp desc
        `,
      dtoIn,
    );
    query.addParam(1, dtoIn.ide_geper);
    return await this.dataSource.createSelectQuery(query);
  }

  /**
   * Retorna el listado de clientes
   * @param dtoIn
   * @returns
   */
  async getContactosCliente(dtoIn: IdClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
    select
        a.ide_gedirp,
        a.nombre_dir_gedirp,
        a.referencia_gedirp ,
        a.telefono_gedirp ,
        a.correo_gedirp,
        a.movil_gedirp,
        a.activo_gedirp,
        a.ide_gegen,
        a.ide_gegen,
        nombre_gegen
    from
        gen_direccion_persona a
    left join gen_genero b on a.ide_gegen = b.ide_gegen
    where a.ide_geper = $1
    and ide_getidi is null
    order by activo_gedirp desc, nombre_dir_gedirp
    `,
      dtoIn,
    );
    query.addParam(1, dtoIn.ide_geper);
    return await this.dataSource.createSelectQuery(query);
  }

  /**
   * Retorna información de totales de trn del cliente
   * @param ide_geper
   * @returns
   */
  async getInfoTotalesCliente(ide_geper: number) {
    const query = new SelectQuery(`     
            SELECT 
                COUNT(1) AS total_facturas,
                MAX(fecha_emisi_cccfa) AS ultima_venta,
                MIN(fecha_emisi_cccfa) AS primera_venta,
                SUM(total_cccfa) AS total_ventas
            FROM 
                cxc_cabece_factura cf
            WHERE 
                    cf.ide_geper = $1
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
                `);
    query.addIntParam(1, ide_geper);
    return await this.dataSource.createSingleQuery(query);
  }

  async searchCliente(dto: SearchDto & HeaderParamsDto) {
    const dtoIn = {
      ...dto,
      module: 'gen',
      tableName: 'persona',
      columnsReturn: ['ide_geper', 'identificac_geper', 'nom_geper'],
      columnsSearch: ['nom_geper', 'identificac_geper', 'correo_geper'],
      columnOrder: 'nom_geper',
      condition: `ide_empr = ${dto.ideEmpr} and activo_geper = true and es_cliente_geper = true and nivel_geper = 'HIJO'`,
    };
    return await this.core.search(dtoIn);
  }

  async existCliente(dto: ExistClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(`     
        SELECT 
            ide_geper,
            uuid,
            nom_geper
        FROM 
            gen_persona 
        WHERE 
                identificac_geper = $1
                and ide_empr = $2
            `);
    query.addStringParam(1, dto.identificacion);
    query.addIntParam(1, dto.ideEmpr);
    const data = await this.dataSource.createSingleQuery(query);
    return {
      rowCount: data ? 1 : 0,
      row: {
        cliente: data,
      },
      message: data ? `El cliente ${data.nom_geper} ya se encuentra registrado` : 'No existe',
    } as ResultQuery;
  }

  async validarWhatsAppCliente(dto: ValidaWhatsAppCliente & HeaderParamsDto): Promise<ResultQuery> {
    try {
      // Validar si el número tiene WhatsApp
      const validation = await this.whatsapp.whatsappWeb.validateWhatsAppNumber(dto.ideEmpr, dto.telefono);

      if (!validation?.isValid) {
        return {
          error: true,
          message: 'El número proporcionado no está asociado a una cuenta de WhatsApp válida.',
        };
      }

      // Usar el número formateado si está disponible
      dto.telefono = validation.formattedNumber || dto.telefono;

      // Actualizar datos del cliente
      await this.updateWhatsAppCliente(dto);

      return {
        error: false,
        message: 'El número fue validado y actualizado correctamente.',
      };
    } catch (error) {
      console.error('Error al validar el número de WhatsApp:', error);
      return {
        error: true,
        message: 'Ocurrió un error al validar el número de WhatsApp. Intente nuevamente más tarde.',
      };
    }
  }


  async actualizarVendedorClientesInactivos(dtoIn: HeaderParamsDto & { ideVgvenDefault?: number }) {
    // Validar y determinar el valor
    let valorAsignacion: string;

    if (dtoIn.ideVgvenDefault !== undefined &&
      dtoIn.ideVgvenDefault !== null &&
      Number.isInteger(dtoIn.ideVgvenDefault) &&
      dtoIn.ideVgvenDefault > 0) {
      valorAsignacion = dtoIn.ideVgvenDefault.toString();
    } else {
      valorAsignacion = 'NULL';
    }

    const query = new Query();
    query.query = `
        UPDATE gen_persona 
        SET ide_vgven = ${valorAsignacion}
        WHERE ide_empr = ${dtoIn.ideEmpr}
            AND es_cliente_geper = true
            -- AND ide_vgven IS NOT NULL
            AND NOT EXISTS (
                SELECT 1 
                FROM cxc_cabece_factura cf 
                WHERE cf.ide_geper = gen_persona.ide_geper 
                    AND cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months'
                    AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')}
                    AND cf.ide_empr = ${dtoIn.ideEmpr}
            )
    `;

    return await this.dataSource.createQuery(query);
  }

  private async updateWhatsAppCliente(dto: ValidaWhatsAppCliente) {
    const query = new UpdateQuery(CLIENTE.tableName, CLIENTE.primaryKey);
    query.values.set('whatsapp_geper', dto.telefono);
    query.values.set('fecha_veri_what_geper', getCurrentDateTime());
    query.where = 'ide_geper = $1';
    query.addNumberParam(1, dto.ide_geper);
    await this.dataSource.createQuery(query);
  }


  async getSegumientoClientes(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
      WITH clientes_inactivos AS (
        SELECT 
            gp.ide_geper,
            gp.uuid,
            gp.nombre_compl_geper,
            gp.identificac_geper,
            gp.direccion_geper,
            gp.telefono_geper,
            gp.correo_geper,
            gp.ide_vgven,
            vv.nombre_vgven AS nombre_vendedor_actual,
            gp.fecha_ingre_geper,
            gpv.nombre_geprov AS provincia,
            gct.nombre_gecant AS canton,
            -- Última compra
            MAX(cf.fecha_emisi_cccfa) AS ultima_fecha_compra,
            
            -- MÉTRICAS DE COMPRAS (Últimos 12 meses)
            COUNT(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '12 months' 
                  THEN cf.ide_cccfa END) AS facturas_ultimo_ano,
            COALESCE(SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '12 months' 
                  THEN cf.total_cccfa END), 0) AS monto_ultimo_ano,
            
            -- MÉTRICAS DE COMPRAS (Últimos 6 meses)
            COUNT(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months' 
                  THEN cf.ide_cccfa END) AS facturas_ultimo_semestre,
            COALESCE(SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months' 
                  THEN cf.total_cccfa END), 0) AS monto_ultimo_semestre,
            
            -- MÉTRICAS HISTÓRICAS
            COUNT(cf.ide_cccfa) AS total_facturas_historico,
            COALESCE(SUM(cf.total_cccfa), 0) AS monto_total_historico,
            COALESCE(AVG(cf.total_cccfa), 0) AS ticket_promedio_historico,
            
            -- FRECUENCIA DE COMPRA CORREGIDA
            CASE 
                WHEN COUNT(cf.ide_cccfa) > 0 THEN
                    (CURRENT_DATE - MIN(cf.fecha_emisi_cccfa))::numeric / COUNT(cf.ide_cccfa)
                ELSE 0
            END AS dias_entre_compras_promedio,
            
            -- TIEMPO DE INACTIVIDAD CORREGIDO
            CASE 
                WHEN MAX(cf.fecha_emisi_cccfa) IS NOT NULL THEN
                    CURRENT_DATE - MAX(cf.fecha_emisi_cccfa)
                ELSE
                    CURRENT_DATE - gp.fecha_ingre_geper
            END AS dias_inactivo,
            
            CASE 
                WHEN MAX(cf.fecha_emisi_cccfa) IS NOT NULL THEN
                    (CURRENT_DATE - MAX(cf.fecha_emisi_cccfa))::numeric / 30
                ELSE
                    (CURRENT_DATE - gp.fecha_ingre_geper)::numeric / 30
            END AS meses_inactivo,
            
            -- CATEGORIZACIÓN POR VOLUMEN
            CASE 
                WHEN COALESCE(SUM(cf.total_cccfa), 0) > 10000 THEN 'A - ALTO VOLUMEN'
                WHEN COALESCE(SUM(cf.total_cccfa), 0) > 5000 THEN 'B - MEDIO VOLUMEN'
                WHEN COALESCE(SUM(cf.total_cccfa), 0) > 1000 THEN 'C - BAJO VOLUMEN'
                ELSE 'D - VOLUMEN MÍNIMO'
            END AS categoria_cliente,
            
            -- TENDENCIA
            COALESCE(
                SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months' 
                    THEN cf.total_cccfa END) - 
                SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '12 months' 
                         AND cf.fecha_emisi_cccfa < CURRENT_DATE - INTERVAL '6 months' 
                    THEN cf.total_cccfa END),
                0
            ) AS tendencia_monto
            
        FROM gen_persona gp
        LEFT JOIN cxc_cabece_factura cf ON gp.ide_geper = cf.ide_geper 
            AND cf.ide_empr = ${dtoIn.ideEmpr}
            AND cf.ide_ccefa = ${this.variables.get('p_cxc_estado_factura_normal')} 
        LEFT JOIN ven_vendedor vv ON gp.ide_vgven = vv.ide_vgven
        LEFT JOIN gen_provincia gpv ON gp.ide_geprov = gpv.ide_geprov
        LEFT JOIN gen_canton gct ON gp.ide_gecant = gct.ide_gecant
        WHERE 
            gp.es_cliente_geper = true
            AND gp.nivel_geper = 'HIJO'
            AND gp.ide_empr = ${dtoIn.ideEmpr}
            AND gp.activo_geper = true
        GROUP BY 
            gp.ide_geper, gp.uuid, gp.nombre_compl_geper, gp.identificac_geper, 
            gp.direccion_geper, gp.telefono_geper, gp.correo_geper,
            gp.ide_vgven, vv.nombre_vgven, gp.fecha_ingre_geper, 
            gpv.nombre_geprov, gct.nombre_gecant
    ),
    clientes_priorizados AS (
        SELECT *,
            -- PUNTAJE DE PRIORIDAD
            CASE 
                WHEN meses_inactivo BETWEEN 3 AND 6 THEN 
                    CASE categoria_cliente 
                        WHEN 'A - ALTO VOLUMEN' THEN 100
                        WHEN 'B - MEDIO VOLUMEN' THEN 80
                        WHEN 'C - BAJO VOLUMEN' THEN 60
                        ELSE 40
                    END
                WHEN meses_inactivo BETWEEN 7 AND 12 THEN 
                    CASE categoria_cliente 
                        WHEN 'A - ALTO VOLUMEN' THEN 90
                        WHEN 'B - MEDIO VOLUMEN' THEN 70
                        WHEN 'C - BAJO VOLUMEN' THEN 50
                        ELSE 30
                    END
                WHEN meses_inactivo > 12 THEN 
                    CASE categoria_cliente 
                        WHEN 'A - ALTO VOLUMEN' THEN 80
                        WHEN 'B - MEDIO VOLUMEN' THEN 60
                        WHEN 'C - BAJO VOLUMEN' THEN 40
                        ELSE 20
                    END
                ELSE 0
            END * 
            CASE WHEN monto_ultimo_ano > 0 THEN 1.5 ELSE 1 END *
            CASE WHEN facturas_ultimo_ano >= 3 THEN 1.3 ELSE 1 END AS puntaje_prioridad,
            
            -- RECOMENDACIÓN DE ACCIÓN
            CASE 
                WHEN meses_inactivo >= 12 AND categoria_cliente LIKE 'A%' THEN 'CONTACTO URGENTE - CLIENTE ESTRATÉGICO'
                WHEN meses_inactivo >= 6 AND monto_ultimo_ano > 5000 THEN 'CONTACTO PRIORITARIO - ALTO POTENCIAL'
                WHEN meses_inactivo >= 3 AND facturas_ultimo_ano > 0 THEN 'CONTACTO PROGRAMADO - CLIENTE RECURRENTE'
                WHEN meses_inactivo >= 6 THEN 'CONTACTO DE REACTIVACIÓN'
                WHEN ultima_fecha_compra IS NULL AND fecha_ingre_geper < CURRENT_DATE - INTERVAL '3 months' THEN 'CONTACTO - PROSPECTO ANTIGUO'
                ELSE 'SEGUIMIENTO NORMAL'
            END AS accion_recomendada
            
        FROM clientes_inactivos
        WHERE meses_inactivo >= 3 OR ultima_fecha_compra IS NULL
    )
    SELECT 
        ide_geper,
        uuid,
        nombre_compl_geper AS nombre_cliente,
        identificac_geper AS identificacion,
        direccion_geper AS direccion,
        telefono_geper AS telefono,
        correo_geper AS email,
        provincia,
        canton,
        nombre_vendedor_actual AS vendedor_asignado,
        
        -- Información de Inactividad
        ultima_fecha_compra AS ultima_compra,
        ROUND(meses_inactivo::numeric, 1) AS meses_inactivo,
        dias_inactivo,
        
        -- Métricas Clave
        categoria_cliente AS categoria,
        ROUND(monto_total_historico, 2) AS monto_historico,
        ROUND(monto_ultimo_ano, 2) AS monto_ultimo_ano,
        ROUND(monto_ultimo_semestre, 2) AS monto_ultimo_semestre,
        facturas_ultimo_ano,
        ROUND(ticket_promedio_historico, 2) AS factura_promedio,
        ROUND(dias_entre_compras_promedio, 1) AS frecuencia_compra_dias,
        
        -- Análisis de Tendencia
        ROUND(tendencia_monto, 2) AS tendencia_monto,
        CASE 
            WHEN tendencia_monto > 0 THEN 'CRECIENTE'
            WHEN tendencia_monto < 0 THEN 'DECRECIENTE'
            ELSE 'ESTABLE'
        END AS tendencia,
        
        -- Priorización
        ROUND(puntaje_prioridad::numeric, 1) AS puntaje_prioridad,
        accion_recomendada
        
    FROM clientes_priorizados
    ORDER BY 
        puntaje_prioridad DESC,
        meses_inactivo DESC,
        monto_total_historico DESC
      `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }




  async getClientesAContactar(dtoIn: QueryOptionsDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
      WITH clientes_activos AS (
        SELECT 
            gp.ide_geper,
            gp.uuid,
            gp.nombre_compl_geper,
            gp.identificac_geper,
            gp.direccion_geper,
            gp.telefono_geper,
            gp.correo_geper,
            gp.ide_vgven,
            vv.nombre_vgven AS nombre_vendedor_actual,
            gp.movil_geper,
            gpv.nombre_geprov AS provincia,
            gct.nombre_gecant AS canton,
            
            -- PATRONES DE COMPRA
            MAX(cf.fecha_emisi_cccfa) AS ultima_compra,
            MIN(cf.fecha_emisi_cccfa) AS primera_compra,
            COUNT(cf.ide_cccfa) AS total_facturas,
            
            -- FRECUENCIA DE COMPRA
            CASE 
                WHEN COUNT(cf.ide_cccfa) > 1 THEN
                    (MAX(cf.fecha_emisi_cccfa) - MIN(cf.fecha_emisi_cccfa))::numeric / (COUNT(cf.ide_cccfa) - 1)
                ELSE 0
            END AS frecuencia_promedio_dias,
            
            -- COMPORTAMIENTO RECIENTE
            COUNT(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '3 months' 
                  THEN cf.ide_cccfa END) AS facturas_ultimo_trimestre,
                  
            COUNT(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months' 
                       AND cf.fecha_emisi_cccfa < CURRENT_DATE - INTERVAL '3 months'
                  THEN cf.ide_cccfa END) AS facturas_trimestre_anterior,
            
            -- MONTOS RECIENTES
            COALESCE(SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '3 months' 
                  THEN cf.total_cccfa END), 0) AS monto_ultimo_trimestre,
                  
            COALESCE(SUM(CASE WHEN cf.fecha_emisi_cccfa >= CURRENT_DATE - INTERVAL '6 months' 
                       AND cf.fecha_emiSI_cccfa < CURRENT_DATE - INTERVAL '3 months'
                  THEN cf.total_cccfa END), 0) AS monto_trimestre_anterior,
            
            -- TICKET PROMEDIO
            COALESCE(AVG(cf.total_cccfa), 0) AS ticket_promedio,
            
            -- VARIABLES PARA PREDICCIÓN
            CURRENT_DATE - MAX(cf.fecha_emisi_cccfa) AS dias_desde_ultima_compra
            
        FROM gen_persona gp
        LEFT JOIN cxc_cabece_factura cf ON gp.ide_geper = cf.ide_geper 
            AND cf.ide_empr = 0 
            AND cf.ide_ccefa = 0
        LEFT JOIN ven_vendedor vv ON gp.ide_vgven = vv.ide_vgven
        LEFT JOIN gen_provincia gpv ON gp.ide_geprov = gpv.ide_geprov
        LEFT JOIN gen_canton gct ON gp.ide_gecant = gct.ide_gecant
        WHERE 
            gp.es_cliente_geper = true
            AND gp.nivel_geper = 'HIJO'
            AND gp.ide_empr = 0
            AND gp.activo_geper = true
            AND cf.fecha_emisi_cccfa IS NOT NULL
        GROUP BY 
            gp.ide_geper, gp.uuid, gp.nombre_compl_geper, gp.identificac_geper, 
            gp.direccion_geper, gp.telefono_geper, gp.correo_geper, gp.movil_geper,
            gp.ide_vgven, vv.nombre_vgven, gpv.nombre_geprov, gct.nombre_gecant
        HAVING COUNT(cf.ide_cccfa) >= 2
    ),
    prediccion_compras AS (
        SELECT *,
            -- ALGORITMO DE PREDICCIÓN MEJORADO
            CASE 
                -- Cliente que superó su ciclo habitual
                WHEN frecuencia_promedio_dias > 0 AND dias_desde_ultima_compra >= frecuencia_promedio_dias THEN 100
                
                -- Cliente con patrón trimestral sin comprar este período
                WHEN facturas_trimestre_anterior > 0 AND facturas_ultimo_trimestre = 0 
                     AND dias_desde_ultima_compra BETWEEN 80 AND 100 THEN 95
                     
                -- Cliente con aumento significativo en frecuencia
                WHEN facturas_ultimo_trimestre > facturas_trimestre_anterior * 1.5 THEN 90
                
                -- Cliente con patrón mensual acercándose a su ciclo
                WHEN frecuencia_promedio_dias BETWEEN 25 AND 35 
                     AND dias_desde_ultima_compra BETWEEN frecuencia_promedio_dias * 0.8 AND frecuencia_promedio_dias THEN 85
                     
                -- Cliente con ticket alto que usualmente compra mensualmente
                WHEN ticket_promedio > 1000 
                     AND EXTRACT(MONTH FROM ultima_compra) != EXTRACT(MONTH FROM CURRENT_DATE) THEN 75
                     
                ELSE 0
            END AS probabilidad_compra,
            
            -- RAZÓN DE PREDICCIÓN MÁS CORDIAL
            CASE 
                WHEN frecuencia_promedio_dias > 0 AND dias_desde_ultima_compra >= frecuencia_promedio_dias THEN
                    'Es tiempo de tu próxima compra según tu patrón habitual'
                    
                WHEN facturas_trimestre_anterior > 0 AND facturas_ultimo_trimestre = 0 THEN
                    'Sueles comprar cada trimestre y estamos en esa época'
                    
                WHEN facturas_ultimo_trimestre > facturas_trimestre_anterior * 1.5 THEN
                    'Has aumentado tus pedidos recientemente'
                    
                WHEN frecuencia_promedio_dias BETWEEN 25 AND 35 
                     AND dias_desde_ultima_compra BETWEEN frecuencia_promedio_dias * 0.8 AND frecuencia_promedio_dias THEN
                    'Se acerca la fecha de tu compra mensual habitual'
                    
                WHEN ticket_promedio > 1000 
                     AND EXTRACT(MONTH FROM ultima_compra) != EXTRACT(MONTH FROM CURRENT_DATE) THEN
                    'Cliente preferencial que suele comprar mensualmente'
                    
                ELSE 'Revisar comportamiento de compra'
            END AS razon_prediccion,
            
            -- TIPO DE CONTACTO MÁS AMIGABLE
            CASE 
                WHEN frecuencia_promedio_dias > 0 AND dias_desde_ultima_compra >= frecuencia_promedio_dias THEN
                    'Llamar hoy - Seguimiento oportuno'
                    
                WHEN facturas_trimestre_anterior > 0 AND facturas_ultimo_trimestre = 0 THEN
                    'Contactar esta semana - Cliente trimestral'
                    
                WHEN facturas_ultimo_trimestre > facturas_trimestre_anterior * 1.5 THEN
                    'Contactar pronto - Cliente en crecimiento'
                    
                ELSE 'Seguimiento preventivo'
            END AS tipo_contacto,
            
            -- MENSAJES MÁS CORDIALES Y PERSONALES
            CASE 
                WHEN frecuencia_promedio_dias > 0 AND dias_desde_ultima_compra >= frecuencia_promedio_dias THEN
                    'Hola, ¿cómo estás? Queríamos saber si necesitas renovar stock o si hay algún producto que podamos prepararte para tu próximo pedido.'
                    
                WHEN facturas_trimestre_anterior > 0 AND facturas_ultimo_trimestre = 0 THEN
                    'Hola, esperamos que todo vaya bien. Estamos en la época en que normalmente realizas tus compras trimestrales. ¿Hay algo en lo que podamos ayudarte?'
                    
                WHEN facturas_ultimo_trimestre > facturas_trimestre_anterior * 1.5 THEN
                    'Hola, notamos que has estado haciendo más pedidos recientemente. ¿Todo bien? ¿Hay algún producto que necesites en mayor cantidad o frecuencia?'
                    
                ELSE 'Hola, queríamos ponernos en contacto para saber si tienes algún proyecto próximo donde podamos apoyarte. Estamos aquí para lo que necesites.'
            END AS mensaje_sugerido,
            
            -- SUGERENCIA DE PRODUCTOS BASADA EN HISTORIAL
            CASE 
                WHEN ticket_promedio > 1000 THEN 'Ofrecer productos premium y promociones especiales'
                WHEN frecuencia_promedio_dias < 30 THEN 'Sugerir compra programada o suscripción'
                WHEN facturas_ultimo_trimestre > 3 THEN 'Proponer descuento por volumen'
                ELSE 'Conversar sobre necesidades actuales'
            END AS estrategia_ventas
    
        FROM clientes_activos
    )
    SELECT 
        ide_geper,
        uuid,
        nombre_compl_geper AS nombre_cliente,
        identificac_geper AS identificacion,
        direccion_geper AS direccion,
        telefono_geper AS telefono,
        movil_geper AS celular,
        correo_geper AS email,
        provincia,
        canton,
        nombre_vendedor_actual AS vendedor_asignado,
        
        -- INFORMACIÓN DE COMPRAS
        ultima_compra,
        primera_compra,
        total_facturas,
        ROUND(ticket_promedio, 2) AS ticket_promedio,
        ROUND(frecuencia_promedio_dias, 1) AS frecuencia_promedio_dias,
        dias_desde_ultima_compra,
        
        -- COMPORTAMIENTO RECIENTE
        facturas_ultimo_trimestre,
        facturas_trimestre_anterior,
        ROUND(monto_ultimo_trimestre, 2) AS monto_ultimo_trimestre,
        ROUND(monto_trimestre_anterior, 2) AS monto_trimestre_anterior,
        
        -- TENDENCIA
        CASE 
            WHEN facturas_ultimo_trimestre > facturas_trimestre_anterior THEN 'CRECIENTE'
            WHEN facturas_ultimo_trimestre = facturas_trimestre_anterior THEN 'ESTABLE'
            ELSE 'DECRECIENTE'
        END AS tendencia_facturas,
        
        -- PREDICCIÓN Y SEGUIMIENTO
        probabilidad_compra,
        razon_prediccion,
        tipo_contacto,
        mensaje_sugerido,
        estrategia_ventas,
        
        -- PRIORIDAD CON EMOJIS PARA MEJOR VISUALIZACIÓN
        CASE 
            WHEN probabilidad_compra >= 90 THEN '🔥 ALTA - Contactar hoy'
            WHEN probabilidad_compra >= 75 THEN '⚠️ MEDIA - Esta semana'
            ELSE '📞 BAJA - Próximos días'
        END AS prioridad_contacto,
        
        -- INDICADOR DE URGENCIA
        CASE 
            WHEN dias_desde_ultima_compra > frecuencia_promedio_dias THEN
                '🟢 En tiempo - ' || ROUND((dias_desde_ultima_compra / NULLIF(frecuencia_promedio_dias, 0)) * 100, 0) || '% de ciclo'
            WHEN dias_desde_ultima_compra > frecuencia_promedio_dias * 0.8 THEN
                '🟡 Por vencer - ' || ROUND((dias_desde_ultima_compra / NULLIF(frecuencia_promedio_dias, 0)) * 100, 0) || '% de ciclo'
            ELSE
                '🔵 En plazo - ' || ROUND((dias_desde_ultima_compra / NULLIF(frecuencia_promedio_dias, 0)) * 100, 0) || '% de ciclo'
        END AS estado_ciclo
    
    FROM prediccion_compras
    WHERE probabilidad_compra > 0
    ORDER BY 
        probabilidad_compra DESC,
        dias_desde_ultima_compra DESC,
        ticket_promedio DESC
      `,
      dtoIn,
    );

    return await this.dataSource.createQuery(query);
  }


  async getHistoricoVendedoresCliente(dtoIn: IdClienteDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
      SELECT 
          gcvh.fecha_ingre AS fecha_cambio,
          gcvh.usuario_ingre AS usuario_cambio,
          gcvh.motivo_gepvh AS motivo,
          vv_antes.nombre_vgven AS vendedor_anterior,
          vv.nombre_vgven AS vendedor_nuevo
          
      FROM gen_cliente_vendedor_his gcvh
      INNER JOIN ven_vendedor vv ON gcvh.ide_vgven = vv.ide_vgven
      LEFT JOIN ven_vendedor vv_antes ON gcvh.ide_vgven_antes = vv_antes.ide_vgven
      WHERE gcvh.ide_geper = $1
      ORDER BY gcvh.fecha_ingre DESC
      `,
      dtoIn
    );

    query.addParam(1, dtoIn.ide_geper);
    return await this.dataSource.createQuery(query);
  }

}
