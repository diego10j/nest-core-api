import { IsArray, IsDateString, IsNumber, IsString } from 'class-validator';

/**
 * Payload para "Detectar diferencias con IA" en Diferencias Contable vs CxC. Los arrays
 * ya vienen calculados/truncados por el frontend (asientos contables y transacciones CxC
 * de un cliente hasta la fecha de corte, con saldo acumulado) - este endpoint no vuelve a
 * consultar la base de datos, solo arma el prompt y llama a GPT.
 */
export class DetectCxcDifferencesDto {
  @IsNumber()
  ide_geper: number;

  @IsString()
  nom_geper: string;

  @IsDateString()
  fechaCorte: string;

  @IsNumber()
  saldoContable: number;

  @IsNumber()
  saldoCxc: number;

  @IsNumber()
  diferencia: number;

  @IsArray()
  asientos: Record<string, unknown>[];

  @IsArray()
  transacciones: Record<string, unknown>[];
}
