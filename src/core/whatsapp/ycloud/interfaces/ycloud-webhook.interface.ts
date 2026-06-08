import { YcloudInboundMessage, YcloudStatusData } from './ycloud-message.interface';

export type YcloudEventType =
  | 'whatsapp.inbound_message'
  | 'whatsapp.message_status_updated'
  | 'whatsapp.template_message_sent';

export interface YcloudWebhookPayload {
  eventType: YcloudEventType;
  data: YcloudInboundMessage | YcloudStatusData | Record<string, any>;
}
