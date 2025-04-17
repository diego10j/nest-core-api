import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetChatsWebDto extends ServiceDto {



    @IsInt()
    @IsPositive()
    @IsOptional()
    limit?: number = 50;

    @IsString()
    @IsOptional()
    beforeId?: string;


}
