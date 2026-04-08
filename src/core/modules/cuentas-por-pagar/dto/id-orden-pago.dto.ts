import { IsArray, IsInt, ArrayNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';
import { QueryOptionsDto } from 'src/common/dto/query-options.dto';

export class IdOrdenPagoDto extends QueryOptionsDto {
    @IsInt()
    ide_cpcop: number;
}

export class IdsDetalleOrdenPagoDto extends QueryOptionsDto {
    @IsArray()
    @ArrayNotEmpty()
    @IsInt({ each: true })
    @Type(() => Number)
    ids: number[];
}
