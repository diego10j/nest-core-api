import { IsDateString, IsInt, IsOptional, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class IVentasMensualesDto extends PartialType(ServiceDto) {


    @IsInt()
    @IsPositive()
    ide_inarti: number;

    @IsInt()
    @IsPositive()
    periodo: number;

}
