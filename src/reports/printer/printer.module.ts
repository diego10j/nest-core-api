import { Global, Module } from '@nestjs/common';
import { PrinterService } from './printer.service';


@Global() //  Hace que este módulo y sus exports sean globales
@Module({
  providers: [PrinterService],
  exports: [PrinterService],
})
export class PrinterModule {}
