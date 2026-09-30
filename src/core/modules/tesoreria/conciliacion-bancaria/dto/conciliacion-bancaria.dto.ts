import { Transform } from 'class-transformer';
import {
    ArrayMaxSize, ArrayNotEmpty, IsArray, IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetResumenMensualDto {
    @IsInt() @Min(2000) @Max(2100)
    anio: number;

    @IsInt() @Min(1) @Max(12)
    mes: number;
}

export class GetConciliacionesDto extends QueryOptionsDto {
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

/** Un query string "false" llega como texto: la conversión implícita lo volvería true, por eso el Transform. */
const aBooleano = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class GetMovimientosErpDto extends QueryOptionsDto {
    @IsInt()
    ideTecnc: number;

    @IsOptional() @Transform(aBooleano) @IsBoolean()
    soloPendientes?: boolean;
}

/** Campos del formulario multipart de analizarArchivo / cargarArchivo (el archivo va aparte). */
export class CargarArchivoDto {
    /** Obligatorio al cargar; en analizarArchivo es opcional (se detecta por el contenido). */
    @IsOptional() @IsInt()
    ideTecba?: number;

    @IsInt() @Min(2000) @Max(2100)
    anio: number;

    @IsInt() @Min(1) @Max(12)
    mes: number;

    @IsOptional() @IsInt() @Min(0) @Max(15)
    toleranciaDias?: number;
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
