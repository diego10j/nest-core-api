import { IsInt} from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';

export class GetDetalleCampaniaDto extends ServiceDto {

    @IsInt()
    ide_whcenv: number ;

}
