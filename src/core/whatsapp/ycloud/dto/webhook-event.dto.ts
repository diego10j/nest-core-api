import { IsNotEmpty, IsString, ValidateNested } from 'class-validator';

export class WebhookEventDto {
  @IsString()
  @IsNotEmpty()
  eventType: string;

  @ValidateNested()
  data: Record<string, any>;
}
