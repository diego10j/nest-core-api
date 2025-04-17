import { Type } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsOptional, IsString, Matches, ValidateIf } from 'class-validator';
import { ServiceDto } from 'src/common/dto/service.dto';


export class SendMediaDto extends ServiceDto {

    @IsString()
    @IsNotEmpty()
    @Matches(
        /^\d{12}$/g, {
        message: 'Número de teléfono no válido'
    })
    telefono: string;

    @IsString()
    type: 'image' | 'video' | 'document' | 'audio' | 'sticker';

    @IsString()
    @IsOptional()
    caption?: string;

    @IsString()
    @IsOptional()
    filename?: string;

    @IsDefined()
    @ValidateIf(o => {
        // Validar que sea Buffer o string base64
        if (Buffer.isBuffer(o.file)) return true;
        if (typeof o.file === 'string') {
            return o.file.startsWith('data:') ||
                /^([A-Za-z0-9+/]{4})*([A-Za-z0-9+/]{3}=|[A-Za-z0-9+/]{2}==)?$/i.test(o.file);
        }
        return false;
    })
    @Type(() => Buffer)
    file: Buffer | string;

    // dto.file = fs.readFileSync('documento.pdf');   Buffer 
    // dto.file = 'data:application/pdf;base64,JVBERi0xLjMK...';  Base64


}
