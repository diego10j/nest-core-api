import { IsInt, IsPositive, IsOptional, IsString, IsNotEmpty, IsIn } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
export class GetFilesDto extends ServiceDto {


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
