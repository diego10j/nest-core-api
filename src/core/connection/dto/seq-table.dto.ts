import { IsString, IsNotEmpty, IsPositive, IsInt, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class SeqTableDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsInt()
    @IsPositive()
    numberRowsAdded: number

}
