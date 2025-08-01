import { IsArray, ArrayMaxSize, IsString, IsInt, IsBoolean, IsOptional, ValidateNested, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';
import { UniqueArrayField } from 'src/common/decorators/unique-array.validator.decorator';
import { TelefonoWebDto } from '../web/dto/telefono-web.dto';

class TelefonoItemDto extends TelefonoWebDto {

  @IsString()
  @IsOptional()
  observacion: string = ""; // Valor por defecto: cadena vacía
}

class CabeceraCampaniaDto {

  @IsInt()
  @IsOptional()
  ide_whtice?: number; // Tipo campania

  @IsInt()
  ide_whcue: number;  // Cuenta WahtsApp Web

  @IsString()
  descripcion_whcenv: string;

  @IsString()
  mensaje_whcenv: string;

  @IsString()
  @IsOptional()
  media_whcenv?: string;

  @IsInt()
  @IsOptional()
  ide_whcenv?: number;   //pk undefined === create / valor = update

  @IsBoolean()
  @IsOptional()
  programado_whcenv?: boolean = false;

  @IsDateString()
  @IsOptional()
  hora_progra_whcenv?: string;

  @IsInt()
  ide_whesce: number;

  @IsBoolean()
  @IsOptional()
  activo_whcenv?: boolean = true;

}

export class SaveCampaniaDto {
  @IsArray({ message: 'Debe ser un array de objetos con teléfonos' })
  @ArrayMaxSize(300, { message: 'El array no puede contener más de 300 elementos' })
  @ValidateNested({ each: true }) // Valida cada objeto en el array
  @Type(() => TelefonoItemDto)   // Convierte cada elemento a TelefonoItemDto
  @UniqueArrayField('telefono') // <-- Valida unicidad en el campo 'telefono'
  detalles: TelefonoItemDto[];  // Ahora es un array de objetos

  @ValidateNested()
  @Type(() => CabeceraCampaniaDto)
  cabecera: CabeceraCampaniaDto;


}