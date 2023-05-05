import { IsString, IsNotEmpty, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';


export class TableQueryDto extends PartialType(ServiceDto) {

    @IsString()
    @IsNotEmpty()
    tableName: string;

    @IsString()
    @IsNotEmpty()
    primaryKey: string;

    @IsString()
    @IsOptional()
    columns?: string;

    @IsString()
    @IsOptional()
    orderBy?: string;

    @IsString()
    @IsOptional()
    where?: string;

    @IsInt()
    @IsPositive()
    @IsOptional()
    limit?: number;

}