import { IsInt } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class IdProductoDto extends ServiceDto {


    @IsInt()
    ide_inarti: number;

}
