import { Injectable } from '@nestjs/common';
import { InsertQuery, SelectQuery } from 'src/core/connection/helpers';
import { toPgTimestampNow } from 'src/util/helpers/date-util';

import { BaseService } from '../../../../common/base-service';
import { DataSourceService } from '../../../connection/datasource.service';

import { generarClaveAcceso } from './clave-acceso.util';
import { EmisorDto } from './dto/emisor.dto';

export interface SriComprobantePendienteData {
  ideEmpr: number;
  ideSucu: number;
  login: string;
  ip?: string;
  ideSresc: number; // estado inicial (PENDIENTE), viene de p_sri_estado_comprobante_creado
  ideCntdo: number;
  ideGeper: number;
  coddoc: string; // '01' factura, '04' NC, '06' guía, '07' retención, '03' liquidación
  fechaEmision: string;
  estab: string;
  ptoEmi: string;
  subtotal0: number;
  baseGrabada: number;
  iva: number;
  descuento?: number;
  total: number;
  identificacion: string;
  formaCobro?: string;
  diasCredito?: number;
  correo?: string;
  ordenCompra?: string;
  infoAdicional1?: string;
  infoAdicional2?: string;
  infoAdicional3?: string;
  motivo?: string;
  coddocModificado?: string;
  numDocModificado?: string;
  fechaEmisionDocSustento?: string;
  valorModificacion?: number;
  periodoFiscal?: string;
  sriIdeSrcom?: number; // factura asociada (guía) o cabecera reutilizada (NC)
}

/**
 * Reserva de secuencial + clave de acceso + INSERT de cabecera "sri_comprobante" en estado PENDIENTE.
 * Puerto genérico de la lógica ya usada por facturas-save.service.ts (buildSriFullInsert) y del legacy
 * ServicioComprobanteElectronico.generarXXXElectronica, para que otros módulos (retención CxP,
 * liquidación de compra) puedan generar su propio comprobante electrónico sin duplicar la lógica.
 *
 * A diferencia de facturas-save.service.ts (que usa pg_advisory_xact_lock dentro de su propia
 * transacción), aquí el secuencial se reserva con un simple MAX+1 — igual que el legacy Java
 * (ServicioComprobanteElectronico.getSecuencialComprobante), que tampoco usaba locking para estos
 * tipos de documento. Los métodos de este servicio devuelven Query listas para insertar en el mismo
 * listQuery/transacción del módulo llamante (no ejecutan nada por sí mismos).
 */
@Injectable()
export class SriComprobanteCabeceraService extends BaseService {
  constructor(private readonly dataSource: DataSourceService) {
    super();
  }

  /** Siguiente secuencial de 9 dígitos para (ide_empr, coddoc, estab, ptoEmi). Sin locking (paridad legacy). */
  async getSiguienteSecuencial(coddoc: string, estab: string, ptoEmi: string, ideEmpr: number): Promise<string> {
    const query = new SelectQuery(`
            SELECT COALESCE(MAX(secuencial_srcom::integer), 0) + 1 AS next_seq
            FROM sri_comprobante
            WHERE estab_srcom = '${estab}' AND ptoemi_srcom = '${ptoEmi}' AND coddoc_srcom = '${coddoc}'
              AND ide_empr = ${ideEmpr}
        `);
    const res = await this.dataSource.createSingleQuery(query);
    const nextSeq = Number(res?.next_seq ?? 1);
    return String(nextSeq).padStart(9, '0');
  }

  /**
   * Arma el INSERT de sri_comprobante en estado pendiente, reservando ide_srcom + secuencial + clave de
   * acceso. No ejecuta el INSERT: se agrega al listQuery/transacción del módulo llamante.
   */
  async buildInsertPendiente(
    data: SriComprobantePendienteData,
    emisor: EmisorDto,
  ): Promise<{ query: InsertQuery; ideSrcom: number; secuencial: string; claveAcceso: string }> {
    const ideSrcom = await this.dataSource.getSeqTable('sri_comprobante', 'ide_srcom', 1, data.login);
    const secuencial = await this.getSiguienteSecuencial(data.coddoc, data.estab, data.ptoEmi, data.ideEmpr);
    const claveAcceso = generarClaveAcceso({
      fechaEmision: data.fechaEmision,
      codDoc: data.coddoc,
      rucEmisor: emisor.ruc,
      ambiente: String(emisor.ambiente),
      estab: data.estab,
      ptoEmi: data.ptoEmi,
      secuencial,
      tipoEmision: '1',
    });

    const q = new InsertQuery('sri_comprobante', 'ide_srcom');
    q.values.set('ide_srcom', ideSrcom);
    q.values.set('coddoc_srcom', data.coddoc);
    q.values.set('tipoemision_srcom', '1');
    q.values.set('fechaemision_srcom', data.fechaEmision);
    q.values.set('estab_srcom', data.estab);
    q.values.set('ptoemi_srcom', data.ptoEmi);
    q.values.set('secuencial_srcom', secuencial);
    q.values.set('claveacceso_srcom', claveAcceso);
    q.values.set('ide_sresc', data.ideSresc);
    q.values.set('subtotal0_srcom', data.subtotal0);
    q.values.set('base_grabada_srcom', data.baseGrabada);
    q.values.set('subtotal_srcom', data.baseGrabada + data.subtotal0);
    q.values.set('iva_srcom', data.iva);
    q.values.set('descuento_srcom', data.descuento ?? 0);
    q.values.set('total_srcom', data.total);
    q.values.set('identificacion_srcom', data.identificacion);
    q.values.set('forma_cobro_srcom', data.formaCobro ?? null);
    q.values.set('dias_credito_srcom', data.diasCredito ?? 0);
    q.values.set('correo_srcom', data.correo ?? null);
    q.values.set('ide_geper', data.ideGeper);
    q.values.set('ide_cntdo', data.ideCntdo);
    q.values.set('ide_empr', data.ideEmpr);
    q.values.set('ide_sucu', data.ideSucu);
    q.values.set('orden_compra_srcom', data.ordenCompra ?? null);
    q.values.set('reutiliza_srcom', false);
    q.values.set('en_nube_srcom', false);
    q.values.set('usuario_ingre', data.login);
    q.values.set('fecha_sistema_srcom', toPgTimestampNow());
    q.values.set('ip_genera_srcom', data.ip ?? 'localhost');
    q.values.set('infoadicional1_srcom', data.infoAdicional1 ?? null);
    q.values.set('infoadicional2_srcom', data.infoAdicional2 ?? null);
    q.values.set('infoadicional3_srcom', data.infoAdicional3 ?? null);
    q.values.set('motivo_srcom', data.motivo ?? null);
    q.values.set('codigo_docu_mod_srcom', data.coddocModificado ?? null);
    q.values.set('num_doc_mod_srcom', data.numDocModificado ?? null);
    q.values.set('fecha_emision_mod_srcom', data.fechaEmisionDocSustento ?? null);
    q.values.set('valor_mod_srcom', data.valorModificacion ?? null);
    q.values.set('periodo_fiscal_srcom', data.periodoFiscal ?? null);
    q.values.set('sri_ide_srcom', data.sriIdeSrcom ?? null);

    return { query: q, ideSrcom, secuencial, claveAcceso };
  }
}
