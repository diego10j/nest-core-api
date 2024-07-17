import { IsInt, IsPositive, IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class GetFilesDto extends PartialType(ServiceDto) {


    @IsString()
    @IsIn(["files", "favorites", "trash"])
    @IsNotEmpty()
    mode: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_archi?: number;


    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inarti?: number;  // para filtrar contenido del producto

}
