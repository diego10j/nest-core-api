import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class IVentasMensualesClienteDto extends PartialType(ServiceDto) {


    @IsInt()
    @IsPositive()
    ide_geper: number;

    @IsInt()
    @IsPositive()
    periodo: number;

}
