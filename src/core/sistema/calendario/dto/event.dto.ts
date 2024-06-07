import { IsInt, IsObject, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class EventDto extends ServiceDto {


    @IsObject()
    event: any;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inarti?: number;

}
