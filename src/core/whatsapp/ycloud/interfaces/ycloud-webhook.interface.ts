import { YcloudInboundMessage, YcloudStatusData } from './ycloud-message.interface';

export interface YcloudWebhookPayload {
  id: string;
  type: string;
  apiVersion: string;
  createTime: string;
  whatsappInboundMessage?: YcloudInboundMessage;
  whatsappMessage?: YcloudStatusData;
  contact?: Record<string, any>;
}
