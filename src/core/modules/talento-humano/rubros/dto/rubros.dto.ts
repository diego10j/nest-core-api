import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsNotEmpty } from 'class-validator';
import { SaveDto } from 'src/common/dto/save.dto';

export class GetDetalleRubrosByTipoNominaDto {
    @ApiProperty({ description: 'ID del detalle de tipo de nómina (nrh_detalle_tipo_nomina.ide_nrdtn)' })
    @IsInt()
    @Type(() => Number)
    ide_nrdtn: number;
}

export class SaveRubroDto extends SaveDto {
    @ApiProperty({ description: 'Datos de nrh_rubro (ide_nrfoc, ide_nrtir, detalle_nrrub, activo_nrrub, anticipo_nrrub, decimo_nrrub)' })
    declare data: Record<string, unknown>;
}

export class ProbarFormulaDto {
    @ApiProperty({ description: 'Texto de la fórmula a probar (ej. "=[68]*0.0945"), sin guardar todavía' })
    @IsString()
    @IsNotEmpty()
    formula: string;

    @ApiProperty({ description: 'Empleado (gen_empleados_departamento_par.ide_geedp) contra el que se prueba' })
    @IsInt()
    @Type(() => Number)
    ideGeedp: number;
}

export class SaveDetalleRubroDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de nrh_detalle_rubro: ide_nrrub, ide_nrdtn, formula_nrder (texto de fórmula, ' +
            'iniciar con "=" para que se evalúe), orden_nrder, fecha_inicial_nrder/fecha_final_nrder ' +
            '/fecha_pago_nrder en formato "MM-DD/offsetAño" (ej. "8-1/-1"), activo_nrder.',
    })
    declare data: Record<string, unknown>;
}

export class SaveCargoDto extends SaveDto {
    @ApiProperty({ description: 'Datos de gth_cargo (detalle_gtcar, activo_gtcar)' })
    declare data: Record<string, unknown>;
}

export class SaveRubroCuentaDto extends SaveDto {
    @ApiProperty({
        description:
            'Datos de nrh_rubro_cuenta: ide_nrrub (requerido) + al menos una de ide_cndpc ' +
            '(cuenta simple, usada en el asiento principal del rol), ide_cndpc_pasivo / ' +
            'ide_cndpc_gasto_venta / ide_cndpc_gasto_admin (las 3 cuentas que usa la ' +
            'provisión de décimos/fondos de reserva, ver rol-pagos.service.ts).',
    })
    declare data: Record<string, unknown>;
}

export class SaveDepartamentoTipoGastoDto {
    @ApiProperty({ description: 'ID del departamento (gen_departamento.ide_gedep)' })
    @IsInt()
    @Type(() => Number)
    ide_gedep: number;

    @ApiProperty({ description: '"venta" o "administrativo" — centro de costo para partir el gasto en la provisión de décimos/fondos de reserva' })
    tipo_gasto_gedep: 'venta' | 'administrativo';
}
