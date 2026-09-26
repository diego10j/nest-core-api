import { ArrayMaxSize, IsArray, IsBoolean, IsInt } from 'class-validator';

export class SaveTelegramPlantillaDto {
  @IsBoolean()
  telegramActivo: boolean;

  /** Números autorizados (tlg_usuario) que reciben la notificación. */
  @IsArray()
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  idesTlusu: number[];
}
