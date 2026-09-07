import { IsArray, IsDateString, IsNumber, IsString } from 'class-validator';

/**
 * Payload para "Detectar diferencias con IA" en Diferencias Contable vs CxC. Los arrays
 * ya vienen calculados/truncados por el frontend (asientos contables y transacciones CxC
 * de un cliente en el rango consultado, con saldo inicial y saldo acumulado) - este endpoint
 * no vuelve a consultar la base de datos, solo arma el prompt y llama a GPT.
 */
export class DetectCxcDifferencesDto {
  @IsNumber()
  ide_geper: number;

  @IsString()
  nom_geper: string;

  @IsDateString()
  fechaInicio: string;

  @IsDateString()
  fechaFin: string;

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
