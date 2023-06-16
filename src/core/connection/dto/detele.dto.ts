import { IsString, IsNotEmpty, IsDefined } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class DeleteDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsDefined()
    value: any

}
