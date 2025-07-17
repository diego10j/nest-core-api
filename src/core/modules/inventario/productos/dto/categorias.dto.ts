import { IsInt, IsOptional } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';



export class CategoriasDto extends QueryOptionsDto {
    @IsInt()
    @IsOptional()
    inv_ide_incate?: number;

}