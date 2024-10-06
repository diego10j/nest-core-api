import { IsBoolean, IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class StockProductosDto extends ServiceDto {

    @IsDateString()
    @IsOptional()
    fechaCorte?: Date;

    @IsInt()
    @IsPositive()
    @IsOptional()
    ide_inbod?: number;

    @IsBoolean()
    @IsOptional()
    onlyStock?: boolean = true;

}
