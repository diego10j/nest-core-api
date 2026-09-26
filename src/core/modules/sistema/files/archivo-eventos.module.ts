import { Global, Module } from '@nestjs/common';

import { ArchivoSubidoEmitter } from './archivo-subido.emitter';

/**
 * Emisor de "archivo subido/movido" GLOBAL y con una sola instancia: FilesService se declara en
 * varios módulos (FilesModule, InventarioModule…) y todos deben avisar al mismo emisor que escucha la
 * base técnica (extracción automática).
 */
@Global()
@Module({
  providers: [ArchivoSubidoEmitter],
  exports: [ArchivoSubidoEmitter],
})
export class ArchivoEventosModule {}
