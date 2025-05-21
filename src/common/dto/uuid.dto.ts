import { IsUUID, } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';
import { PartialType } from '@nestjs/mapped-types';


export class UuidDto extends PartialType(QueryOptionsDto) {

    @IsUUID(4, { each: true })
    uuid: string;

}
