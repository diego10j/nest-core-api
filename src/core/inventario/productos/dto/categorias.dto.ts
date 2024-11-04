import { IsInt, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class CategoriasDto extends ServiceDto {
    @IsInt()
    @IsOptional()
    inv_ide_incate?: number;

}