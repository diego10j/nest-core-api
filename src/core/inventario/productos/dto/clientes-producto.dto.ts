import { IsInt } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class ClientesProductoDto extends ServiceDto {

    @IsInt()
    ide_inarti: number;

}
