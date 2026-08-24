import { Module } from '@nestjs/common';
import { CoreService } from 'src/core/core.service';
import { ContabilidadModule } from 'src/core/modules/contabilidad/contabilidad.module';
import { TesoreriaModule } from 'src/core/modules/tesoreria/tesoreria.module';

import { DevolucionCobroTarjetaSaveService } from './devolucion-cobro-tarjeta-save.service';
import { DevolucionCobroTarjetaController } from './devolucion-cobro-tarjeta.controller';
import { DevolucionCobroTarjetaService } from './devolucion-cobro-tarjeta.service';

/**
 * Módulo independiente (no anidado dentro de TesoreriaModule) para mantener la dirección de
 * dependencias simple: solo depende de TesoreriaModule y ContabilidadModule. La factura de
 * comisión (CxP) y la retención (Ventas) se guardan desde el frontend con los diálogos ya
 * existentes de esos módulos ANTES de llamar a finalizar() - este módulo solo recibe sus IDs, no
 * necesita importar CuentasPorPagarModule ni VentasModule.
 */
@Module({
    imports: [TesoreriaModule, ContabilidadModule],
    controllers: [DevolucionCobroTarjetaController],
    providers: [
        DevolucionCobroTarjetaService,
        DevolucionCobroTarjetaSaveService,
        CoreService,
    ],
})
export class DevolucionCobroTarjetaModule { }
