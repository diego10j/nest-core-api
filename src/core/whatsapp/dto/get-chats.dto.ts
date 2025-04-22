import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetChatsDto extends ServiceDto {


    // WEB
    @IsInt()
    @IsPositive()
    @IsOptional()
    limit?: number = 25;

    @IsString()
    @IsOptional()
    beforeId?: string;


}
