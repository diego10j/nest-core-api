import { EventEmitter } from 'node:events';

import { Injectable } from '@nestjs/common';

export interface ArchivoSubidoEvent {
  /** uuid del archivo (sis_archivo.uuid). */
  uuid: string;
  ideEmpr: number;
  /**
   * SUBIDO: archivo nuevo · MOVIDO: se movió a otra carpeta (ej. a la carpeta de un producto) ·
   * MARCA_AGUA / REEMPLAZADO: el contenido cambió en el mismo archivo (hashAnterior → hashNuevo); la base
   * técnica actualiza su hash para no volver a extraerlo.
   */
  accion: 'SUBIDO' | 'MOVIDO' | 'MARCA_AGUA' | 'REEMPLAZADO' | 'DESVINCULADO';
  /** DESVINCULADO: quién quitó el documento del producto (historial de la base técnica). */
  login?: string;
  hashAnterior?: string;
  hashNuevo?: string;
  /** Tamaño y versión (fechas) antes del cambio: la base técnica mantiene al día la huella del producto. */
  pesoAnterior?: number;
  versionAnterior?: string;
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
