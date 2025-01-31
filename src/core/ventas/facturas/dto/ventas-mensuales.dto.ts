import { IsInt, IsPositive } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';
import { PartialType } from '@nestjs/mapped-types';

export class VentasMensualesDto extends PartialType(ServiceDto) {

    @IsInt()
    @IsPositive()
    periodo: number;

}
