import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class GetEmpleadosDto extends QueryOptionsDto {
    @IsIn(['true', 'false'])
    @IsOptional()
    activo?: 'true' | 'false';
}

export class GetEmpleadoByIdDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp)' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;
}

export class VincularUsuarioDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp) a vincular' })
    @IsInt()
    @Type(() => Number)
    ide_gtemp: number;

    @ApiProperty({ description: 'ID del usuario de acceso (sis_usuario.ide_usua); null para desvincular', required: false })
    @IsInt()
    @IsOptional()
    @Type(() => Number)
    ide_usua?: number | null;
}

export class SaveEmpleadoDto {
    @ApiProperty({ description: 'ID del empleado (gth_empleado.ide_gtemp) — presente solo al actualizar' })
    @IsInt()
    @IsOptional()
    ideGtemp?: number;

    @ApiProperty({
        description:
            'ID de la persona (gen_persona.ide_geper) ya existente elegida vía SearchPersona — ' +
            'gth_empleado nunca crea una gen_persona nueva. Al crear, el backend marca ' +
            'es_empleado_geper=true sobre esa persona; falla si no existe en la empresa o si ya ' +
            'tiene un empleado asociado.',
    })
    @IsInt()
    @IsNotEmpty()
    ideGeper: number;

    @IsString()
    @IsNotEmpty()
    primerNombreGtemp: string;

    @IsString()
    @IsOptional()
    segundoNombreGtemp?: string;

    @IsString()
    @IsNotEmpty()
    apellidoPaternoGtemp: string;

    @IsString()
    @IsOptional()
    apellidoMaternoGtemp?: string;

    @IsString()
    @IsNotEmpty()
    documentoIdentidadGtemp: string;

    @IsString()
    @IsNotEmpty()
    fechaNacimientoGtemp: string;

    @IsString()
    @IsOptional()
    fechaIngresoGtemp?: string;

    @IsString()
    @IsOptional()
    tarjetaMarcacionGtemp?: string;

    @IsInt()
    @IsNotEmpty()
    ideGtgen: number;

    @IsInt()
    @IsNotEmpty()
    ideGttdi: number;

    @IsInt()
    @IsNotEmpty()
    ideGtesc: number;

    @IsInt()
    @IsNotEmpty()
    ideGttis: number;

    @IsInt()
    @IsNotEmpty()
    ideGtnac: number;

    @ApiProperty({ description: 'Provincia de nacimiento (gen_provincia.ide_geprov)' })
    @IsInt()
    @IsNotEmpty()
    ideGeprov: number;

    @ApiProperty({ description: 'Cantón de nacimiento (gen_canton.ide_gecant)' })
    @IsInt()
    @IsOptional()
    ideGecant?: number;

    @IsBoolean()
    @IsOptional()
    acumulaDecimoGtemp?: boolean;

    @IsBoolean()
    @IsOptional()
    activoGtemp?: boolean;

    @ApiProperty({ description: 'Nombre de archivo de la foto (subida antes vía /api/sistema/files/upload)' })
    @IsString()
    @IsOptional()
    fotoGtemp?: string;

    @ApiProperty({ description: 'Nombre de archivo de la firma (subida antes vía /api/sistema/files/upload)' })
    @IsString()
    @IsOptional()
    firmaGtemp?: string;

    // ── Contacto (gen_persona) — se actualiza sobre la persona asociada ────────
    @IsString()
    @IsOptional()
    correoGeper?: string;

    @IsString()
    @IsOptional()
    telefonoGeper?: string;

    @IsString()
    @IsOptional()
    movilGeper?: string;

    @IsString()
    @IsOptional()
    direccionGeper?: string;
}
