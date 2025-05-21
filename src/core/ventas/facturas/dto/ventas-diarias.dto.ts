import { IsDateString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';

export class VentasDiariasDto extends PartialType(QueryOptionsDto) {

    @IsDateString()
    fecha: string;

}
