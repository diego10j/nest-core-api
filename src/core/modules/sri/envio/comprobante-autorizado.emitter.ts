import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';
import { HeaderParamsDto } from 'src/common/dto/common-params.dto';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export interface ComprobanteAutorizadoEvent {
  ideSrcom: number;
  claveAcceso: string;
  coddoc: string;
  xmlAutorizado?: string;
  dtoIn: QueryOptionsDto & HeaderParamsDto;
}

/**
 * Notifica cuando un comprobante fue AUTORIZADO por el SRI, sin acoplar SriModule a quien
 * reaccione a ese evento (ej. envío de correo con PDF+XML). Evita el ciclo de módulos
 * SriModule -> VentasModule/CuentasPorPagarModule -> SriModule que se daría si SriModule
 * importara directamente los servicios de reportes/correo: en su lugar, el módulo que sí
 * puede importar todo eso sin ciclos (ComprobanteEmailModule) se suscribe a esta emisora.
 */
@Injectable()
export class ComprobanteAutorizadoEmitter extends EventEmitter {
  emitAutorizado(evento: ComprobanteAutorizadoEvent): void {
    this.emit('autorizado', evento);
  }
}
