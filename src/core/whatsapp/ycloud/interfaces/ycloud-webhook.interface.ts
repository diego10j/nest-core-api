import { YcloudInboundMessage, YcloudStatusData } from './ycloud-message.interface';

export type YcloudEventType =
  | 'whatsapp.inbound_message.received'
  | 'whatsapp.message.updated'
  | 'whatsapp.template.category_updated'
  | 'whatsapp.template.quality_updated'
  | 'whatsapp.template.reviewed'
  | 'contact.created'
  | 'contact.attributes_changed';

export interface YcloudWebhookPayload {
  eventType: YcloudEventType;
  data: YcloudInboundMessage | YcloudStatusData | Record<string, any>;
}
