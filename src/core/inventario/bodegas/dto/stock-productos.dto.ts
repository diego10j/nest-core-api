import { IsBoolean, IsDateString, ArrayNotEmpty, IsOptional, IsNotEmpty, IsArray } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class StockProductosDto extends ServiceDto {

    @IsDateString()
    @IsOptional()
    fechaCorte?: Date;


    @IsOptional()
    @ArrayNotEmpty()
    @IsNotEmpty({ each: true })
    @IsArray()
    ide_inbod?: number[];

    @IsBoolean()
    @IsOptional()
    onlyStock?: boolean = true;

}
