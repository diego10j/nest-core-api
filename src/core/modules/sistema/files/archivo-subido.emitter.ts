import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

export interface ArchivoSubidoEvent {
  /** uuid del archivo (sis_archivo.uuid). */
  uuid: string;
  ideEmpr: number;
  /** SUBIDO: archivo nuevo · MOVIDO: se movió a otra carpeta (ej. a la carpeta de un producto). */
  accion: 'SUBIDO' | 'MOVIDO';
}

/**
 * Avisa cuando se sube o mueve un archivo, sin acoplar FilesModule a quien reaccione (ej. la base
 * técnica, que extrae automáticamente los documentos de los productos). Mismo patrón que
 * ComprobanteAutorizadoEmitter: la subida responde igual de rápido y los oyentes trabajan aparte.
 */
@Injectable()
export class ArchivoSubidoEmitter extends EventEmitter {
  emitir(evento: ArchivoSubidoEvent): void {
    this.emit('archivo', evento);
  }
}
