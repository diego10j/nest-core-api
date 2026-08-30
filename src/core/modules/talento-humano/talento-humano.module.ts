import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { CoreService } from '../../core.service';
import { IntegrationModule } from '../../integration/integration.module';
import { AuditService } from '../audit/audit.service';
import { ContabilidadModule } from '../contabilidad/contabilidad.module';

import { AsistenciaController } from './asistencia/asistencia.controller';
import { AsistenciaService } from './asistencia/asistencia.service';
import { CalculoLegalService } from './calculo-legal/calculo-legal.service';
import { EmpleadosController } from './empleados/empleados.controller';
import { EmpleadosService } from './empleados/empleados.service';
import { FichaEmpleadoController } from './ficha-empleado/ficha-empleado.controller';
import { FichaEmpleadoService } from './ficha-empleado/ficha-empleado.service';
import { FormulaEngineService } from './formula-engine/formula-engine.service';
import { HorasExtraController } from './horas-extra/horas-extra.controller';
import { HorasExtraService } from './horas-extra/horas-extra.service';
import { MensualizacionController } from './mensualizacion/mensualizacion.controller';
import { MensualizacionService } from './mensualizacion/mensualizacion.service';
import { PuestosSalariosController } from './puestos-salarios/puestos-salarios.controller';
import { PuestosSalariosService } from './puestos-salarios/puestos-salarios.service';
import { RolPagosController } from './rol-pagos/rol-pagos.controller';
import { RolPagosService } from './rol-pagos/rol-pagos.service';
import { RubrosController } from './rubros/rubros.controller';
import { RubrosService } from './rubros/rubros.service';
import { VacacionesPermisosController } from './vacaciones-permisos/vacaciones-permisos.controller';
import { VacacionesPermisosService } from './vacaciones-permisos/vacaciones-permisos.service';

@Module({
    imports: [ConfigModule, ContabilidadModule, IntegrationModule],
    controllers: [
        EmpleadosController,
        PuestosSalariosController,
        RubrosController,
        RolPagosController,
        HorasExtraController,
        VacacionesPermisosController,
        MensualizacionController,
        FichaEmpleadoController,
        AsistenciaController,
    ],
    providers: [
        AuditService,
        CoreService,
        EmpleadosService,
        PuestosSalariosService,
        RubrosService,
        FormulaEngineService,
        RolPagosService,
        HorasExtraService,
        VacacionesPermisosService,
        MensualizacionService,
        FichaEmpleadoService,
        CalculoLegalService,
        AsistenciaService,
    ],
    exports: [EmpleadosService, PuestosSalariosService, RolPagosService],
})
export class TalentoHumanoModule { }
