import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';



export class TableQueryDto extends ServiceDto {

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



}