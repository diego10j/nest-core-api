import { IsUUID, } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class UuidDto extends PartialType(ServiceDto) {

    @IsUUID(4, { each: true })
    uuid: string;

}
