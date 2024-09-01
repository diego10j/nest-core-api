import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class CantonesDto extends ServiceDto {


    @IsInt()
    ide_geprov: number;

}
