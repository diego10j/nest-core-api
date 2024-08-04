import { IsInt, IsPositive, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class PerfilDto extends ServiceDto {

    @IsInt()
    @IsPositive()
    ide_sist: number;

}