import { ApiProperty } from '@nestjs/swagger';

export class ResultadoOcrTransferenciaDto {
  @ApiProperty({
    description: 'Tipo de transferencia detectado: "recibida" o "enviada"',
    example: 'recibida',
    required: false,
  })
  tipoTransferencia?: string;

  @ApiProperty({
    description: 'Valor de la transferencia como número',
    example: 1255.0,
    required: false,
  })
  valor?: number;

  @ApiProperty({
    description: 'Número de comprobante, transacción u operación',
    example: '11111111',
    required: false,
  })
  numeroComprobante?: string;

  @ApiProperty({
    description: 'Fecha de la transferencia en formato YYYY-MM-DD',
    example: '2026-05-30',
    required: false,
  })
  fecha?: string;

  @ApiProperty({
    description: 'Nombre del ordenante (quien envía el dinero). En transferencias recibidas es el tercero que pagó. En enviadas es la empresa.',
    example: 'Juan Pérez',
    required: false,
  })
  ordenante?: string;

  @ApiProperty({
    description: 'Cuenta de origen desde donde se realizó la transferencia',
    example: '12345678',
    required: false,
  })
  cuentaOrigen?: string;

  @ApiProperty({
    description: 'Nombre del banco de origen desde donde se envió la transferencia',
    example: 'Banco Pichincha',
    required: false,
  })
  bancoOrigen?: string;

  @ApiProperty({
    description: 'Nombre del beneficiario (quien recibe). En recibidas es la empresa. En enviadas es el tercero.',
    example: 'Diquimec S.A.S.',
    required: false,
  })
  beneficiario?: string;

  @ApiProperty({
    description: 'Cuenta de destino a la que se realizó la transferencia',
    example: '****8109',
    required: false,
  })
  cuentaDestino?: string;

  @ApiProperty({
    description: 'Nombre del banco de destino o banco beneficiario',
    example: 'Banco de Guayaquil',
    required: false,
  })
  bancoDestino?: string;

  @ApiProperty({
    description: 'Texto original extraído por OCR (solo cuando origen=ocr)',
    required: false,
  })
  textoOriginal?: string;

  @ApiProperty({
    description: 'Origen de los datos: ocr, vision_direct, vision_fallback',
    example: 'ocr',
  })
  origen?: string;
}
