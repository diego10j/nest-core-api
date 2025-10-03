import { IsDateString, IsIn, IsNumber, IsOptional, IsString } from 'class-validator';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class ProductosStockBajoDto extends QueryOptionsDto {


    @IsNumber()
    @IsOptional()
    diasAnalisis?: number = 90;


    @IsDateString()
    @IsOptional()
    fechaCorte?: string;

    @IsNumber()
    @IsOptional()
    diasAlertas?: number = 7;


    @IsIn(['true', 'false']) // Solo permite estr valor
    @IsString()
    @IsOptional()
    incluirSinConfiguracion?: string = 'false';

}
