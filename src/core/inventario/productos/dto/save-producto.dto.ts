import { 
  Type, 
  Transform 
} from "class-transformer";
import { 
  ValidateNested, 
  IsBoolean, 
  IsNumber, 
  IsString, 
  IsOptional, 
  IsNotEmpty, 
  IsUUID, 
  IsUrl, 
  IsObject, 
  IsArray, 
  IsDateString,
  IsPositive,
  IsInt
} from "class-validator";

export class InvArticulo {
  @IsOptional()
  @IsInt()
  @IsPositive()
  ide_inarti?: number;

  @IsOptional()
  @IsInt()
  inv_ide_inarti?: number | null;

  @IsOptional()
  @IsInt()
  ide_empr?: number | null;

  @IsOptional()
  @IsInt()
  ide_infab?: number | null;

  @IsOptional()
  @IsInt()
  ide_inepr?: number | null;

  @IsOptional()
  @IsInt()
  ide_sucu?: number | null;

  @IsOptional()
  @IsInt()
  ide_inmar?: number | null;

  @IsOptional()
  @IsInt()
  ide_inuni?: number | null;

  @IsOptional()
  @IsInt()
  ide_intpr?: number | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  codigo_inarti?: string | null;

  @IsNotEmpty()
  @IsString()
  nombre_inarti: string;

  @IsOptional()
  @IsNumber()
  iva_inarti?: number | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  observacion_inarti?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  nivel_inarti?: string | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  ice_inarti?: boolean | null;

  @IsOptional()
  @IsInt()
  ide_georg?: number | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  hace_kardex_inarti?: boolean | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  es_combo_inarti?: boolean | null;

  @IsOptional()
  @IsInt()
  ide_cndpc?: number | null;

  @IsOptional()
  @IsUUID()
  @Transform(({ value }) => value || null)
  uuid?: string | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  activo_inarti?: boolean | null;

  @IsOptional()
  @IsUrl()
  @Transform(({ value }) => value || null)
  foto_inarti?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  publicacion_inarti?: string | null;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => value || null)
  tags_inarti?: any | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  cant_stock1_inarti?: number | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 3 })
  cant_stock2_inarti?: number | null;


  @IsOptional()
  @IsInt()
  ide_incate?: number | null;

  @IsOptional()
  @IsUrl()
  @Transform(({ value }) => value || null)
  url_inarti?: string | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  se_vende_inarti?: boolean | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  se_compra_inarti?: boolean | null;

  @IsOptional()
  @IsInt()
  ide_inbod?: number | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  cod_barras_inarti?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  notas_inarti?: string | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  otro_nombre_inarti?: string | null;

  @IsOptional()
  @IsInt()
  total_vistas_inarti?: number | null;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => value || null)
  fotos_inarti?: any | null;

  @IsOptional()
  @IsObject()
  @Transform(({ value }) => value || null)
  ratings_inaerti?: any | null;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  total_ratings_inarti?: number | null;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value ?? null)
  publicado_inarti?: boolean | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  desc_corta_inarti?: string | null;

  @IsOptional()
  @IsInt()
  decim_stock_inarti?: number | null;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => value || null)
  cod_auto_inarti?: string | null;
}

export class SaveProductoDto {
  @ValidateNested()
  @Type(() => InvArticulo)
  data!: InvArticulo;
  
  @IsBoolean()
  isUpdate!: boolean;
}

