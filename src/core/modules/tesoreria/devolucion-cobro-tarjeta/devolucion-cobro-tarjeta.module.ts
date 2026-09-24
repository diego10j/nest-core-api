import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { TesoreriaModule } from 'src/core/modules/tesoreria/tesoreria.module';
import { VentasModule } from 'src/core/modules/ventas/ventas.module';

import { CorteTarjetaSaveService } from './corte-tarjeta-save.service';
import { DevolucionCobroTarjetaSaveService } from './devolucion-cobro-tarjeta-save.service';
import { DevolucionCobroTarjetaController } from './devolucion-cobro-tarjeta.controller';
import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';

/**
 * Módulo independiente (no anidado dentro de TesoreriaModule): depende de Tesorería y Contabilidad
 * (movimientos y asientos) y de Ventas, cuyo RetencionVentaSaveService registra el comprobante de
 * retención de un corte. La factura de comisión (CxP) la guarda el frontend con el flujo de
 * Compras ANTES de registrar el corte y aquí solo se recibe su ID.
 */
@Module({
    imports: [TesoreriaModule, ContabilidadModule, VentasModule],
    controllers: [DevolucionCobroTarjetaController],
    providers: [
        DevolucionCobroTarjetaService,
        DevolucionCobroTarjetaSaveService,
        CorteTarjetaSaveService,
        CoreService,
    ],
})
export class DevolucionCobroTarjetaModule { }
