import { IsNumber, IsString } from 'class-validator';

export class HeaderParamsDto {
  @IsNumber({}, { message: 'x-ide-usua must be a valid number' })
  ideUsua: number;

  @IsNumber({}, { message: 'x-ide-empr must be a valid number' })
  ideEmpr: number;

  @IsNumber({}, { message: 'x-ide-sucu must be a valid number' })
  ideSucu: number;

  @IsNumber({}, { message: 'x-ide-perf must be a valid number' })
  idePerf: number;

  @IsString({ message: 'x-login must be a string' })
  login: string;
}