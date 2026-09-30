import { Transform } from 'class-transformer';
import {
    ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

/** Un query string "false" llega como texto: la conversión implícita lo volvería true, por eso el Transform. */
const aBooleano = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class GetResumenMensualDto {
    @IsInt() @Min(2000) @Max(2100)
    anio: number;

    @IsInt() @Min(1) @Max(12)
    mes: number;

    /** true = solo las cuentas con movimientos en el ERP ese mes o con conciliación ya creada. */
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    soloConMovimientos?: boolean;
}

export class GetConciliacionesDto extends QueryOptionsDto {
    /** Incluye las conciliaciones anuladas (historial de lo revertido). */
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    incluirAnuladas?: boolean;

    @IsOptional() @IsInt() @Min(2000) @Max(2100)
    anio?: number;

    @IsOptional() @IsInt() @Min(1) @Max(12)
    mes?: number;

    @IsOptional() @IsInt()
    ideTecba?: number;
}

export class IdConciliacionDto {
    @IsInt()
    ideTecnc: number;
}

/** Listado paginado por el motor genérico de tablas (rows/columns/pagination), como el resto de Tesorería. */
export class GetMovimientosBancoDto extends QueryOptionsDto {
    @IsInt()
    ideTecnc: number;

    /** SIN_CRUZAR = todo lo que no está CONCILIADO (pendientes, faltantes e ignorados). */
    @IsOptional() @IsIn(['PENDIENTE', 'CONCILIADO', 'FALTANTE', 'IGNORADO', 'SIN_CRUZAR'])
    estado?: string;
}

export class GetMovimientosErpDto extends QueryOptionsDto {
    @IsInt()
    ideTecnc: number;

    @IsOptional() @Transform(aBooleano) @IsBoolean()
    soloPendientes?: boolean;

    /** true = solo los movimientos DENTRO del mes (sin los de los días vecinos que entran por la tolerancia). */
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    soloPeriodo?: boolean;
}

/** Crea la conciliación (cuenta + mes) que después recibe los archivos del banco. */
export class CrearConciliacionDto {
    @IsInt()
    ideTecba: number;

    @IsInt() @Min(2000) @Max(2100)
    anio: number;

    @IsInt() @Min(1) @Max(12)
    mes: number;

    @IsOptional() @IsInt() @Min(0) @Max(15)
    toleranciaDias?: number;
}

/** Corrige la cuenta/mes/año de una conciliación creada por error (mientras no tenga archivos). */
export class EditarConciliacionDto extends IdConciliacionDto {
    @IsInt()
    ideTecba: number;

    @IsInt() @Min(2000) @Max(2100)
    anio: number;

    @IsInt() @Min(1) @Max(12)
    mes: number;
}

/**
 * Campos del formulario multipart de analizarArchivo / cargarArchivo (el archivo va aparte). La
 * conciliación ya existe: la cuenta y el mes salen de ella y contra ellos se valida el archivo.
 */
export class CargarArchivoDto {
    @IsInt()
    ideTecnc: number;

    /**
     * true = además de cargar, corre el cruce automático. La pantalla de "Carga de estados de cuenta" no lo
     * manda (solo sube el archivo); el cruce lo hace después quien concilia.
     */
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    procesar?: boolean;

    /** En analizarArchivo: consultar a la IA si el archivo corresponde a la cuenta/mes (por defecto sí). */
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    validarConIa?: boolean;
}

export class AnularConciliacionDto extends IdConciliacionDto {
    /** Motivo de la anulación: queda en la observación de la conciliación. */
    @IsString() @MinLength(5) @MaxLength(300)
    motivo: string;
}

/** Historial de archivos cargados (pantalla de carga), paginado por el motor genérico de tablas. */
export class GetArchivosCargadosDto extends QueryOptionsDto {
    @IsOptional() @IsInt() @Min(2000) @Max(2100)
    anio?: number;

    @IsOptional() @IsInt() @Min(1) @Max(12)
    mes?: number;

    @IsOptional() @IsInt()
    ideTecba?: number;
}

export class ConciliarManualDto extends IdConciliacionDto {
    @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @IsInt({ each: true })
    idsBanco: number[];

    @IsArray() @ArrayNotEmpty() @ArrayMaxSize(50) @IsInt({ each: true })
    idsErp: number[];

    /** MANUAL (por defecto) o IA cuando se acepta una sugerencia de la IA. */
    @IsOptional() @IsIn(['MANUAL', 'IA', 'AUTO'])
    tipo?: string;

    @IsOptional() @IsString() @MaxLength(40)
    regla?: string;

    @IsOptional() @IsInt() @Min(0) @Max(100)
    confianza?: number;

    /** Si la suma del banco y la del ERP no coinciden, hay que confirmarlo explícitamente + observación. */
    @IsOptional() @IsBoolean()
    permitirDiferencia?: boolean;

    @IsOptional() @IsString() @MaxLength(400)
    observacion?: string;
}

export class DesconciliarDto extends IdConciliacionDto {
    /** Cualquier movimiento del cruce: se deshace el grupo completo. */
    @IsInt()
    ideTecmv: number;
}

export class MarcarMovimientosDto extends IdConciliacionDto {
    @IsArray() @ArrayNotEmpty() @ArrayMaxSize(500) @IsInt({ each: true })
    idsBanco: number[];

    @IsIn(['PENDIENTE', 'FALTANTE', 'IGNORADO'])
    estado: string;

    @IsOptional() @IsString() @MaxLength(400)
    nota?: string;
}

export class SugerirDto extends IdConciliacionDto {
    @IsOptional() @Transform(aBooleano) @IsBoolean()
    usarIa?: boolean;
}

export class CerrarConciliacionDto extends IdConciliacionDto {
    @IsOptional() @IsString() @MaxLength(500)
    observacion?: string;
}

export class ActualizarToleranciaDto extends IdConciliacionDto {
    @IsNumber() @Min(0) @Max(15)
    toleranciaDias: number;
}
