import { IsInt } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class IdProductoDto extends PartialType(ServiceDto) {


    @IsInt()
    ide_inarti: number;

}
