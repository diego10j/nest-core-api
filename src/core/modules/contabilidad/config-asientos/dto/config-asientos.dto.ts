import { IsArray, IsBoolean, IsInt, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';

/**
 * Identificadores de `con_cab_conf_asie.nombre_cncca` que el motor de asientos automáticos
 * (`AsientosAutomaticosService`) y otros servicios (proveedor.service.ts, retenciones-cxp.service.ts)
 * resuelven por COINCIDENCIA EXACTA DE TEXTO (`UPPER(nombre_cncca) = UPPER($1)`). Renombrar o
 * eliminar cualquiera de estos registros rompe en silencio la generación de asientos de
 * compras/ventas/tesorería/retenciones (el motor solo agrega una advertencia a `advertencias[]`,
 * no lanza error). Confirmado con grep sobre asientos-automaticos.service.ts,
 * proveedor.service.ts, proveedor-save.service.ts y retenciones-cxp.service.ts.
 *
 * Mantener esta lista sincronizada si se agregan nuevos `buscarCuentaConfig(...)` /
 * `getCuentaPersona(...)` con un identificador nuevo en cualquiera de esos archivos.
 */
export const IDENTIFICADORES_PROTEGIDOS_CONF_ASIE: readonly string[] = [
    'CUENTA POR PAGAR',
    'CUENTA POR COBRAR',
    'RETENCION IVA POR PAGAR',
    'RETENCION RENTA POR PAGAR',
    'RETENCION IVA POR COBRAR',
    'RETENCION RENTA POR COBRAR',
    'IVA CREDITO TRIBUTARIO',
    'IVA EN VENTAS',
    'VENTAS',
    'NOTAS DE CREDITO VENTAS',
    'TRANSPORTE EN VENTAS',
    'GASTO COMISION CHEQUE DEVUELTO',
    'INGRESO COMISION COBRADA A CLIENTE',
    'IVA COMPRAS COMISION CHEQUE DEVUELTO',
];

export function esIdentificadorProtegido(nombreCncca: string | null | undefined): boolean {
    if (!nombreCncca) return false;
    return IDENTIFICADORES_PROTEGIDOS_CONF_ASIE.includes(nombreCncca.trim().toUpperCase());
}

export class SaveCabConfAsieDto {
    @IsBoolean()
    @IsNotEmpty()
    isUpdate: boolean;

    @IsObject()
    @IsNotEmpty()
    data: {
        ide_cncca?: number;
        nombre_cncca: string;
        observacion_cncca?: string;
    };

    /** Debe enviarse en true para editar un registro cuyo nombre está en la lista protegida */
    @IsBoolean()
    @IsOptional()
    confirmar_protegido?: boolean;
}

export class DeleteCabConfAsieDto {
    @IsArray()
    @IsInt({ each: true })
    @IsNotEmpty()
    ide: number[];

    /** Debe enviarse en true para eliminar un registro cuyo nombre está en la lista protegida */
    @IsBoolean()
    @IsOptional()
    confirmar_protegido?: boolean;
}

export class GetCabConfAsieDto {
    @IsString()
    @IsOptional()
    value?: string;
}
