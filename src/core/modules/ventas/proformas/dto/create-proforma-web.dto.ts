import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsEmail, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { UniqueArrayField } from 'src/common/decorators/unique-array.validator.decorator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';


class SolicitanteDto {

    @IsDateString()
    fecha: string;

    @IsString()
    nombres: string;

    @IsEmail()
    correo: string;

    @IsString()
    telefono: string;

    @IsString()
    provincia: string;

    @IsString()
    @IsOptional()
    direccion?: string;

    @IsString()
    formaPago: string;

    @IsString()
    formaEntrega: string;

    @IsString()
    @IsOptional()
    observacion?: string;

    @IsNumber()
    ideEmpr: number;


}

class DetalleItemDto {
    @IsString()
    producto: string;


    @IsNumber()
    cantidad: number;

    @IsString()
    @IsOptional()
    unidad?: string;

}

export class CreateProformaWebDto extends QueryOptionsDto {
    @IsArray({ message: 'Debe ser un array de objetos con productos' })
    @ArrayMaxSize(100, { message: 'El array no puede contener más de 100 elementos' })
    @ValidateNested({ each: true }) // Valida cada objeto en el array
    @Type(() => DetalleItemDto)   // Convierte cada elemento a DetalleItemDto
    @UniqueArrayField('producto') // <-- Valida unicidad en el campo 'producto'
    detalles: DetalleItemDto[];  // Ahora es un array de objetos
  
    @ValidateNested()
    @Type(() => SolicitanteDto)
    solicitante: SolicitanteDto;

}
