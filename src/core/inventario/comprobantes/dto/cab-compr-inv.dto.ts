import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class CabComprobanteInventarioDto extends ServiceDto {

    @IsInt()
    @IsPositive()
    ide_incci: number;
}
