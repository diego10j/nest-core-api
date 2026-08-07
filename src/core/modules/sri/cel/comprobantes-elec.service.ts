import { BadRequestException, Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { SelectQuery } from 'src/core/connection/helpers';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';
import { DetalleImpuestoReembolsoDto, ReembolsoLineaDto } from '../xml/dto/reembolso-linea.dto';
import { getCodigoPorcentajeIva, CODIGO_PORCENTAJE_IVA_0, TipoImpuestoCodigo } from '../xml/tipo-impuesto-iva.util';
import { getTipoProveedorReembolso } from '../xml/tipo-proveedor-reembolso.util';

import { ClaveAccesoDto } from './dto/clave-acceso.dto';
import { ClienteDto } from './dto/cliente.dto';
import { ComprobanteDto } from './dto/comprobante.dto';
import { DestinatarioDto } from './dto/destinatario.dto';
import { DetalleComprobanteDto } from './dto/detalle-comprobante.dto';
import { DetalleImpuestoDto } from './dto/detalle-impuesto.dto';
import { TransportistaDto } from './dto/transportista.dto';
import { TipoComprobanteEnum } from './enum/tipo-comprobante.enum';

type HeaderQueryDto = QueryOptionsDto & HeaderParamsDto;

/** Columnas de sri_comprobante + joins necesarias para armar el XML de cualquiera de los 5 tipos de comprobante. */
const SRI_COMPROBANTE_COLUMNS = `
    a.ide_srcom,
    a.sri_ide_srcom,
    a.tipoemision_srcom,
    a.claveacceso_srcom,
    a.coddoc_srcom,
    a.estab_srcom,
    a.ptoemi_srcom,
    a.secuencial_srcom,
    a.fechaemision_srcom,
    a.num_guia_srcom,
    a.subtotal_srcom,
    a.subtotal0_srcom,
    a.base_grabada_srcom,
    a.iva_srcom,
    a.placa_srcom,
    a.descuento_srcom,
    a.total_srcom,
    a.periodo_fiscal_srcom,
    a.codigo_docu_mod_srcom,
    a.num_doc_mod_srcom,
    a.fecha_emision_mod_srcom,
    a.valor_mod_srcom,
    a.autorizacion_srcomn,
    a.correo_srcom,
    a.dias_credito_srcom,
    a.orden_compra_srcom,
    a.infoadicional1_srcom,
    a.infoadicional2_srcom,
    a.infoadicional3_srcom,
    a.en_nube_srcom,
    a.ide_sucu,
    a.motivo_srcom,
    a.ide_srfid,
    a.ide_sresc,
    a.forma_cobro_srcom,
    a.fechaautoriza_srcom,
    a.fecha_ini_trans_srcom,
    a.fecha_fin_trans_srcom,
    a.direcion_partida_srcom,
    a.ide_geper,
    a.ide_cntdo,
    b.identicicacion_sucu,
    b.telefonos_sucu,
    b.correo_sucu,
    b.agente_ret_sucu,
    c.identificac_geper,
    c.nom_geper,
    c.direccion_geper,
    c.telefono_geper,
    c.movil_geper,
    c.correo_geper,
    d.alterno2_getid`;

const SRI_COMPROBANTE_JOINS = `
    FROM sri_comprobante a
    INNER JOIN sis_sucursal b ON a.ide_sucu = b.ide_sucu
    INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
    INNER JOIN gen_tipo_identifi d ON c.ide_getid = d.ide_getid`;

@Injectable()
export class ComprobantesElecService extends BaseService {
  constructor(
    private readonly dataSource: DataSourceService,
  ) {
    super();
  }

  async getComprobantePorClaveAcceso(dtoIn: ClaveAccesoDto & HeaderParamsDto) {
    const query = new SelectQuery(
      `
        SELECT ${SRI_COMPROBANTE_COLUMNS}
        ${SRI_COMPROBANTE_JOINS}
        WHERE a.claveacceso_srcom = $1
        `,
      dtoIn,
    );
    query.addStringParam(1, dtoIn.claveAcceso);
    const data = await this.dataSource.createSingleQuery(query);
    if (!data) {
      throw new BadRequestException(`No existe el comprobante ${dtoIn.claveAcceso}`);
    }
    return this.dataToComprobante(data);
  }

  async getComprobantePorId(ideSrcom: number, dtoIn: HeaderQueryDto) {
    const query = new SelectQuery(
      `
        SELECT ${SRI_COMPROBANTE_COLUMNS}
        ${SRI_COMPROBANTE_JOINS}
        WHERE a.ide_srcom = $1
        `,
      dtoIn,
    );
    query.addIntParam(1, ideSrcom);
    const data = await this.dataSource.createSingleQuery(query);
    if (!data) {
      throw new BadRequestException(`No existe el comprobante ${ideSrcom}`);
    }
    return this.dataToComprobante(data);
  }

  /**
   * Comprobantes en un estado determinado, con su empresa/sucursal (usado por el cron de
   * envío/autorización para reconstruir el contexto multi-tenant fila por fila).
   */
  async getComprobantesPorEstado(estado: number): Promise<{ ideSrcom: number; claveAcceso: string; ideEmpr: number; ideSucu: number }[]> {
    const query = new SelectQuery(`
        SELECT ide_srcom AS "ideSrcom", claveacceso_srcom AS "claveAcceso", ide_empr AS "ideEmpr", ide_sucu AS "ideSucu"
        FROM sri_comprobante
        WHERE ide_sresc = ${estado}
        ORDER BY ide_srcom
        `);
    return this.dataSource.createSelectQuery(query);
  }

  /** Puerto fiel de Comprobante.java (constructor ResultSet) para los 5 tipos de comprobante electrónico. */
  private async dataToComprobante(data: Record<string, unknown>): Promise<ComprobanteDto> {
    const comprobante = new ComprobanteDto();
    comprobante.codigocomprobante = data.ide_srcom as number;
    comprobante.codigoComprobanteFactura = data.sri_ide_srcom as number | undefined;
    comprobante.tipoemision = data.tipoemision_srcom as string;
    comprobante.claveacceso = data.claveacceso_srcom as string;
    comprobante.coddoc = data.coddoc_srcom as string;
    comprobante.estab = data.estab_srcom as string;
    comprobante.ptoemi = data.ptoemi_srcom as string;
    comprobante.secuencial = data.secuencial_srcom as string;
    comprobante.fechaemision = data.fechaemision_srcom as string;
    comprobante.guiaremision = data.num_guia_srcom as string | undefined;
    comprobante.totalsinimpuestos = Number(data.subtotal_srcom ?? 0);
    comprobante.totaldescuento = Number(data.descuento_srcom ?? 0);
    comprobante.propina = 0;
    comprobante.importetotal = Number(data.total_srcom ?? 0);
    comprobante.moneda = 'DOLAR';
    comprobante.periodofiscal = data.periodo_fiscal_srcom as string | undefined;
    comprobante.coddocmodificado = data.codigo_docu_mod_srcom as string | undefined;
    comprobante.numdocmodificado = data.num_doc_mod_srcom as string | undefined;
    comprobante.fechaemisiondocsustento = data.fecha_emision_mod_srcom as string | undefined;
    comprobante.valormodificacion = Number(data.valor_mod_srcom ?? 0);
    comprobante.numAutorizacion = data.autorizacion_srcomn as string;
    comprobante.correo = data.correo_srcom as string | undefined;
    comprobante.diasCredito = Number(data.dias_credito_srcom ?? 0);
    comprobante.numOrdenCompra = data.orden_compra_srcom as string | undefined;
    comprobante.infoAdicional1 = data.infoadicional1_srcom as string | undefined;
    comprobante.infoAdicional2 = data.infoadicional2_srcom as string | undefined;
    comprobante.infoAdicional3 = data.infoadicional3_srcom as string | undefined;
    comprobante.agenteRetencion = (data.agente_ret_sucu as string) ?? undefined;
    comprobante.rucEmpresa = data.identicicacion_sucu as string;
    comprobante.telefonos = data.telefonos_sucu as string | undefined;
    comprobante.correoEmpresa = data.correo_sucu as string | undefined;
    comprobante.oficina = String(data.ide_sucu);
    comprobante.codigoestado = Number(data.ide_sresc ?? 0);
    comprobante.subtotal0 = Number(data.subtotal0_srcom ?? 0);
    comprobante.subtotal = Number(data.base_grabada_srcom ?? 0);
    comprobante.iva = Number(data.iva_srcom ?? 0);
    comprobante.formaCobro = (data.forma_cobro_srcom as string) ?? '01';
    comprobante.motivo = data.motivo_srcom as string | undefined;
    comprobante.fechaautoriza = data.fechaautoriza_srcom as string | undefined;
    comprobante.fechaIniTransporte = data.fecha_ini_trans_srcom as string | undefined;
    comprobante.fechaFinTransporte = data.fecha_fin_trans_srcom as string | undefined;
    comprobante.dirPartida = data.direcion_partida_srcom as string | undefined;
    comprobante.placa = data.placa_srcom as string | undefined;

    const cliente = new ClienteDto();
    cliente.identificacion = (data.identificac_geper as string)?.trim();
    cliente.tipoIdentificacion = (data.alterno2_getid as string)?.trim();
    cliente.nombreCliente = (data.nom_geper as string)?.trim();
    cliente.direccion = data.direccion_geper as string;
    cliente.telefono = data.telefono_geper as string;
    cliente.celular = data.movil_geper as string;
    cliente.correo = data.correo_geper as string;
    // Para Factura / Guía toma dirección y teléfono propios de la factura (no del maestro de persona)
    if (
      comprobante.coddoc === TipoComprobanteEnum.FACTURA.codigo ||
      comprobante.coddoc === TipoComprobanteEnum.GUIA_DE_REMISION.codigo
    ) {
      cliente.correo = comprobante.correo;
      const query = new SelectQuery(`
                SELECT telefono_cccfa, direccion_cccfa
                FROM cxc_cabece_factura
                WHERE ide_srcom = ${comprobante.codigocomprobante}
            `);
      const res = await this.dataSource.createSingleQuery(query);
      if (res) {
        cliente.direccion = res.direccion_cccfa;
        cliente.telefono = res.telefono_cccfa;
      }
    }
    comprobante.cliente = cliente;

    if (comprobante.coddoc === TipoComprobanteEnum.FACTURA.codigo) {
      comprobante.detalle = await this.getDetalleFactura(comprobante.codigocomprobante);
    } else if (comprobante.coddoc === TipoComprobanteEnum.NOTA_DE_CREDITO.codigo) {
      comprobante.detalle = await this.getDetalleNotaCredito(comprobante.codigocomprobante);
    } else if (comprobante.coddoc === TipoComprobanteEnum.GUIA_DE_REMISION.codigo) {
      comprobante.destinatario = await this.getDestinatarioGuia(comprobante.codigocomprobante);
      comprobante.detalle = await this.getDetalleGuia(comprobante.codigoComprobanteFactura);
      comprobante.transportista = await this.getTransportistaGuia(comprobante.codigocomprobante);

      // El SRI rechaza el XML de la guía si falta cualquiera de estos - validar antes de
      // construir/enviar el XML da un error claro y accionable en vez del ERROR.35/ERROR.69
      // genérico del SRI después de que ya se intentó el envío.
      if (!comprobante.transportista?.razonSocial) {
        throw new BadRequestException(
          `La guía de remisión ${comprobante.claveacceso} no tiene transportista/chofer asignado ` +
          `(o su registro de persona no tiene nombre). Complete esos datos antes de generarla/reenviarla.`,
        );
      }
      if (comprobante.destinatario?.identificacionDestinatario === '9999999999999') {
        throw new BadRequestException(
          `La guía de remisión ${comprobante.claveacceso} tiene como destinatario a Consumidor Final. ` +
          `El SRI no permite emitir guías de remisión para Consumidor Final; ` +
          `asigne la identificación real del destinatario.`,
        );
      }
    } else if (comprobante.coddoc === TipoComprobanteEnum.COMPROBANTE_DE_RETENCION.codigo) {
      comprobante.impuesto = await this.getImpuestosRetencion(comprobante.codigocomprobante);
    } else if (comprobante.coddoc === TipoComprobanteEnum.LIQUIDACION_DE_COMPRAS.codigo) {
      comprobante.detalle = await this.getDetalleLiquidacionCompra(comprobante.codigocomprobante);
      comprobante.reembolsos = await this.getReembolsosLiquidacion(comprobante.codigocomprobante);
    }

    return comprobante;
  }

  private async getDetalleFactura(ideSrcom: number): Promise<DetalleComprobanteDto[]> {
    const query = new SelectQuery(`
            SELECT f.ide_inarti, codigo_inarti,
                COALESCE(nombre_inuni,'') || ' ' || observacion_ccdfa AS nombre_inarti,
                cantidad_ccdfa, precio_ccdfa, iva_inarti_ccdfa, total_ccdfa, tarifa_iva_cccfa
            FROM cxc_cabece_factura a
            INNER JOIN cxc_deta_factura c ON a.ide_cccfa = c.ide_cccfa
            INNER JOIN inv_articulo f ON c.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad g ON c.ide_inuni = g.ide_inuni
            WHERE a.ide_srcom = ${ideSrcom}
            ORDER BY observacion_ccdfa
        `);
    const res = await this.dataSource.createSelectQuery(query);
    return res.map((obj) => this.toDetalle(obj, 'precio_ccdfa', 'total_ccdfa', 'iva_inarti_ccdfa', 'tarifa_iva_cccfa'));
  }

  private async getDetalleNotaCredito(ideSrcom: number): Promise<DetalleComprobanteDto[]> {
    const query = new SelectQuery(`
            SELECT f.ide_inarti, codigo_inarti,
                COALESCE(nombre_inuni,'') || ' ' || nombre_inarti AS nombre_arti_desc,
                cantidad_cpdno, precio_cpdno, iva_inarti_cpdno, valor_cpdno, tarifa_iva_cpcno
            FROM cxp_cabecera_nota a
            INNER JOIN cxp_detalle_nota c ON a.ide_cpcno = c.ide_cpcno
            INNER JOIN inv_articulo f ON c.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad g ON c.ide_inuni = g.ide_inuni
            WHERE a.ide_srcom = ${ideSrcom}
            ORDER BY 3
        `);
    const res = await this.dataSource.createSelectQuery(query);
    return res.map((obj) =>
      this.toDetalle(
        { ...obj, nombre_inarti: obj.nombre_arti_desc },
        'precio_cpdno',
        'valor_cpdno',
        'iva_inarti_cpdno',
        'tarifa_iva_cpcno',
      ),
    );
  }

  private async getDetalleLiquidacionCompra(ideSrcom: number): Promise<DetalleComprobanteDto[]> {
    const query = new SelectQuery(`
            SELECT f.ide_inarti, codigo_inarti,
                COALESCE(nombre_inuni,'') || ' ' || observacion_cpdfa AS nombre_inarti,
                cantidad_cpdfa, precio_cpdfa, iva_inarti_cpdfa, valor_cpdfa, tarifa_iva_cpcfa
            FROM cxp_cabece_factur a
            INNER JOIN cxp_detall_factur c ON a.ide_cpcfa = c.ide_cpcfa
            INNER JOIN inv_articulo f ON c.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad g ON c.ide_inuni = g.ide_inuni
            WHERE a.ide_srcom = ${ideSrcom}
        `);
    const res = await this.dataSource.createSelectQuery(query);
    return res.map((obj) => this.toDetalle(obj, 'precio_cpdfa', 'valor_cpdfa', 'iva_inarti_cpdfa', 'tarifa_iva_cpcfa'));
  }

  /**
   * Líneas de reembolso de gastos de una Liquidación de Compra (Anexo 17 SRI):
   * cxp_datos_com_reembolso (tabla ya existente en el core, usada por
   * pkg_cuentas_x_pagar/pre_factura_cxp.java del legacy), ya listas para el XML
   * (proveedor, documento sustento e impuestos).
   */
  private async getReembolsosLiquidacion(ideSrcom: number): Promise<ReembolsoLineaDto[]> {
    const query = new SelectQuery(`
            SELECT
                r.identificacion_cpdcr,
                r.serie_cpdcr,
                r.secuencial_cpdcr,
                r.autorizacion_cpdcr,
                r.fecha_cpdcr,
                r.base_no_objeto_cpdcr,
                r.base_tarifa0_cpdcr,
                r.base_imponible_cpdcr,
                r.valor_iva_cpdcr,
                r.cod_pais_pago_cpdcr,
                ct.alter_tribu_cntdo,
                ti.alterno2_getid
            FROM cxp_datos_com_reembolso r
            INNER JOIN cxp_cabece_factur padre ON r.ide_cpcfa = padre.ide_cpcfa
            INNER JOIN con_tipo_document ct ON ct.ide_cntdo = r.ide_cntdo
            INNER JOIN gen_tipo_identifi ti ON ti.ide_getid = r.ide_getid
            WHERE padre.ide_srcom = ${ideSrcom}
            ORDER BY r.ide_cpdcr
        `);
    const rows = await this.dataSource.createSelectQuery(query);
    return rows.map((r) => this.toReembolsoLinea(r));
  }

  private toReembolsoLinea(r: Record<string, unknown>): ReembolsoLineaDto {
    const baseImponible = Number(r.base_imponible_cpdcr ?? 0);
    const baseTarifa0 = Number(r.base_tarifa0_cpdcr ?? 0);
    const valorIva = Number(r.valor_iva_cpdcr ?? 0);
    const serie = String(r.serie_cpdcr ?? '');
    const estab = serie.slice(0, 3);
    const ptoEmi = serie.slice(3, 6);
    const tipoIdentificacion = String(r.alterno2_getid ?? '').trim();
    const identificacion = String(r.identificacion_cpdcr ?? '').trim();

    const detalleImpuestos: DetalleImpuestoReembolsoDto[] = [];
    if (baseImponible > 0) {
      const tarifa = baseImponible > 0 ? (valorIva * 100) / baseImponible : 0;
      detalleImpuestos.push({
        codigo: TipoImpuestoCodigo.IVA,
        codigoPorcentaje: getCodigoPorcentajeIva(tarifa),
        tarifa,
        baseImponibleReembolso: baseImponible,
        impuestoReembolso: valorIva,
      });
    }
    if (baseTarifa0 > 0) {
      detalleImpuestos.push({
        codigo: TipoImpuestoCodigo.IVA,
        codigoPorcentaje: CODIGO_PORCENTAJE_IVA_0,
        tarifa: 0,
        baseImponibleReembolso: baseTarifa0,
        impuestoReembolso: 0,
      });
    }

    return {
      tipoIdentificacionProveedorReembolso: tipoIdentificacion,
      identificacionProveedorReembolso: identificacion,
      codPaisPagoProveedorReembolso: Number(r.cod_pais_pago_cpdcr ?? 593),
      tipoProveedorReembolso: getTipoProveedorReembolso(tipoIdentificacion, identificacion),
      codDocReembolso: String(r.alter_tribu_cntdo ?? ''),
      estabDocReembolso: estab,
      ptoEmiDocReembolso: ptoEmi,
      secuencialDocReembolso: String(r.secuencial_cpdcr ?? ''),
      fechaEmisionDocReembolso: String(r.fecha_cpdcr ?? ''),
      numeroautorizacionDocReemb: String(r.autorizacion_cpdcr ?? ''),
      detalleImpuestos,
    };
  }

  /**
   * Detalle de la guía: solo artículos que hacen kardex (hace_kardex_inarti = true), ya que
   * la guía de remisión declara al SRI el traslado físico de bienes — servicios u otros
   * ítems que no afectan inventario no se transportan y no deben figurar aquí. Debe
   * mantenerse en paridad con el filtro del RIDE (guias-remision-rep.service.ts) para que el
   * documento impreso represente fielmente el XML autorizado.
   */
  private async getDetalleGuia(ideSrcomFactura: number | undefined): Promise<DetalleComprobanteDto[]> {
    if (!ideSrcomFactura) return [];
    const query = new SelectQuery(`
            SELECT f.ide_inarti, codigo_inarti,
                COALESCE(nombre_inuni,'') || ' ' || observacion_ccdfa AS nombre_inarti,
                cantidad_ccdfa, precio_ccdfa, iva_inarti_ccdfa, total_ccdfa, (tarifa_iva_cccfa * 100) AS tarifa_iva_cccfa
            FROM cxc_cabece_factura a
            INNER JOIN cxc_deta_factura c ON a.ide_cccfa = c.ide_cccfa
            INNER JOIN inv_articulo f ON c.ide_inarti = f.ide_inarti
            LEFT JOIN inv_unidad g ON c.ide_inuni = g.ide_inuni
            WHERE a.ide_srcom = ${ideSrcomFactura}
              AND f.hace_kardex_inarti = true
            ORDER BY observacion_ccdfa
        `);
    const res = await this.dataSource.createSelectQuery(query);
    return res.map((obj) => this.toDetalle(obj, 'precio_ccdfa', 'total_ccdfa', 'iva_inarti_ccdfa', 'tarifa_iva_cccfa'));
  }

  private toDetalle(
    obj: Record<string, unknown>,
    precioCol: string,
    totalCol: string,
    ivaFlagCol: string,
    tarifaIvaCol: string,
  ): DetalleComprobanteDto {
    const ivaFlag = String(obj[ivaFlagCol]);
    return {
      codigoprincipal: obj.codigo_inarti as string,
      codigoauxiliar: String(obj.ide_inarti),
      descripciondet: ((obj.nombre_inarti as string) ?? 'SIN DESCRIPCION').trim(),
      cantidad: Number(obj.cantidad_ccdfa ?? obj.cantidad_cpdno ?? obj.cantidad_cpdfa ?? 0),
      preciounitario: Number(obj[precioCol] ?? 0),
      descuento: 0,
      preciototalsinimpuesto: Number(obj[totalCol] ?? 0),
      porcentajeiva: ivaFlag === '1' ? Number(obj[tarifaIvaCol] ?? 0) : 0,
    };
  }

  private async getImpuestosRetencion(ideSrcom: number): Promise<DetalleImpuestoDto[]> {
    const query = new SelectQuery(`
            SELECT codigo_fe_cnimp,
                COALESCE(codigo_fe_retencion_cncim, casillero_cncim) AS codigo_fe_retencion_cncim,
                base_cndre, porcentaje_cndre, valor_cndre,
                alter_tribu_cntdo, numero_cpcfa, fecha_emisi_cpcfa
            FROM con_detall_retenc a
            INNER JOIN con_cabece_impues b ON a.ide_cncim = b.ide_cncim
            INNER JOIN con_impuesto c ON b.ide_cnimp = c.ide_cnimp
            INNER JOIN con_cabece_retenc d ON a.ide_cncre = d.ide_cncre
            INNER JOIN cxp_cabece_factur e ON d.ide_cncre = e.ide_cncre
            INNER JOIN con_tipo_document g ON e.ide_cntdo = g.ide_cntdo
            WHERE d.ide_srcom = ${ideSrcom}
        `);
    const res = await this.dataSource.createSelectQuery(query);
    return res.map((obj) => ({
      codigo: obj.codigo_fe_cnimp,
      codigoRetencion: obj.codigo_fe_retencion_cncim,
      baseImponible: Number(obj.base_cndre ?? 0),
      porcentajeRetener: Number(obj.porcentaje_cndre ?? 0),
      valorRetenido: Number(obj.valor_cndre ?? 0),
      codDocSustento: obj.alter_tribu_cntdo,
      numDocSustento: obj.numero_cpcfa,
      fechaEmisionDocSustento: obj.fecha_emisi_cpcfa,
    }));
  }

  /**
   * Datos del transportista para <infoGuiaRemision> (razonSocialTransportista/rucTransportista):
   * si el traslado es en vehículo propio, el "transportista" es el chofer (gen_persona vía
   * cxc_transporte_factura.ide_geper); si es tercerizado, es la empresa de ven_transporte
   * (identificación real vía su gen_persona, no el cliente/destinatario de la factura).
   */
  private async getTransportistaGuia(ideSrcom: number): Promise<TransportistaDto | undefined> {
    const query = new SelectQuery(`
            SELECT
                t.es_transporte_propio_cctfa,
                tr.nombre_vgtra,
                trp.identificac_geper AS transportista_identificacion,
                trtid.alterno2_getid AS transportista_tipo_identificacion,
                ch.nom_geper AS chofer,
                ch.identificac_geper AS chofer_identificacion,
                chtid.alterno2_getid AS chofer_tipo_identificacion
            FROM cxc_guia a
            INNER JOIN cxc_transporte_factura t ON t.ide_cccfa = a.ide_cccfa
            LEFT JOIN ven_transporte tr ON t.ide_vgtra = tr.ide_vgtra
            LEFT JOIN gen_persona trp ON tr.ide_geper = trp.ide_geper
            LEFT JOIN gen_tipo_identifi trtid ON trp.ide_getid = trtid.ide_getid
            LEFT JOIN gen_persona ch ON t.ide_geper = ch.ide_geper
            LEFT JOIN gen_tipo_identifi chtid ON ch.ide_getid = chtid.ide_getid
            WHERE a.ide_srcom = ${ideSrcom}
        `);
    const res = await this.dataSource.createSingleQuery(query);
    if (!res) return undefined;

    const esPropio = res.es_transporte_propio_cctfa as boolean;
    return {
      razonSocial: ((esPropio ? res.chofer : res.nombre_vgtra) as string | undefined)?.trim(),
      tipoIdentificacion: (esPropio ? res.chofer_tipo_identificacion : res.transportista_tipo_identificacion) as string | undefined,
      identificacion: ((esPropio ? res.chofer_identificacion : res.transportista_identificacion) as string | undefined)?.trim(),
    };
  }

  private async getDestinatarioGuia(ideSrcom: number): Promise<DestinatarioDto | undefined> {
    const query = new SelectQuery(`
            SELECT c.identificac_geper, c.nom_geper, c.direccion_geper, nombre_cctgi,
                c.telefono_geper, c.correo_geper,
                h.coddoc_srcom, h.estab_srcom, h.ptoemi_srcom, h.secuencial_srcom, h.claveacceso_srcom, h.fechaemision_srcom
            FROM cxc_guia a
            INNER JOIN gen_persona c ON a.ide_geper = c.ide_geper
            INNER JOIN cxc_tipo_guia e ON a.ide_cctgi = e.ide_cctgi
            INNER JOIN sri_comprobante f ON a.ide_srcom = f.ide_srcom
            INNER JOIN sri_comprobante h ON f.sri_ide_srcom = h.ide_srcom
            WHERE a.ide_srcom = ${ideSrcom}
        `);
    const res = await this.dataSource.createSingleQuery(query);
    if (!res) return undefined;
    return {
      identificacionDestinatario: res.identificac_geper?.trim(),
      razonSocialDestinatario: res.nom_geper?.trim(),
      dirDestinatario: res.direccion_geper?.trim(),
      motivoTraslado: res.nombre_cctgi,
      docAduaneroUnico: '000',
      codEstabDestino: res.estab_srcom,
      ruta: 'RUTA',
      codDocSustento: res.coddoc_srcom,
      numDocSustento: `${res.estab_srcom}-${res.ptoemi_srcom}-${res.secuencial_srcom}`,
      numAutDocSustento: res.claveacceso_srcom,
      fechaEmisionDocSustento: res.fechaemision_srcom,
      correo: res.correo_geper,
      telefono: res.telefono_geper,
    };
  }
}
