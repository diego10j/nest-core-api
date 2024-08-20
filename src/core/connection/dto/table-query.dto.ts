import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class TableQueryDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'tableName no debe contener espacios' })
    tableName: string;

    @IsString()
    @IsNotEmpty()
    @Matches(/^\S*$/, { message: 'primaryKey no debe contener espacios' })
    primaryKey: string;

    @IsString()
    @IsOptional()
    columns?: string;

    @IsString()
    @IsOptional()
    orderBy?: string;

    @IsString()
    @IsOptional()
    condition?: string;



}