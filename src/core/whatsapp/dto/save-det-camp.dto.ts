import { IsArray, ArrayMaxSize, IsString, IsNotEmpty, Matches,Validate, IsInt  } from 'class-validator';
import { Type } from 'class-transformer';
import { ServiceDto } from 'src/common/dto/service.dto';
import { UniqueArrayValidator } from 'src/common/decorators/unique-array.validator.decorator';


export class SaveDetallesCampaniaDto extends ServiceDto {

    @IsArray({ message: 'Debe ser un array de números telefónicos' })
    @ArrayMaxSize(100, { message: 'El array no puede contener más de 100 elementos' })
    @IsString({ each: true, message: 'Cada elemento debe ser una cadena de texto' })
    @IsNotEmpty({ each: true, message: 'Los números telefónicos no pueden estar vacíos' })
    @Matches(
      /^\d{12}$/,
      {
        each: true,
        message: 'Cada número telefónico debe tener exactamente 12 dígitos'
      }
    )
    @Validate(UniqueArrayValidator) // Validador personalizado para elementos únicos
    @Type(() => String)
    telefonos: string[];

    
    @IsInt()
    ide_whcenv: number ;
}
