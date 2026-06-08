export interface YcloudTextPayload {
  to: string;
  type: 'text';
  text: { preview_url?: boolean; body: string };
}

export interface YcloudTemplatePayload {
  to: string;
  type: 'template';
  template: {
    name: string;
    language: { code: string };
    components?: YcloudTemplateComponent[];
  };
}

export interface YcloudImagePayload {
  to: string;
  type: 'image';
  image: { id: string; caption?: string };
}

export interface YcloudAudioPayload {
  to: string;
  type: 'audio';
  audio: { id: string };
}

export interface YcloudVideoPayload {
  to: string;
  type: 'video';
  video: { id: string; caption?: string };
}

export interface YcloudDocumentPayload {
  to: string;
  type: 'document';
  document: { id: string; filename?: string; caption?: string };
}

export type YcloudMessagePayload =
  | YcloudTextPayload
  | YcloudTemplatePayload
  | YcloudImagePayload
  | YcloudAudioPayload
  | YcloudVideoPayload
  | YcloudDocumentPayload;

export interface YcloudInboundMessage {
  id: string;
  from: string;
  to: string;
  type: string;
  timestamp: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
  sticker?: { id: string; mime_type: string; sha256: string; animated?: boolean };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  reaction?: { message_id: string; emoji: string };
  context?: { from: string; id: string };
  button?: { payload: string; text: string };
  interactive?: Record<string, any>;
}

export interface YcloudStatusData {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  timestamp: string;
  recipient_id: string;
  conversation?: { id: string; expiration_timestamp?: string; origin?: { type: string } };
  pricing?: { category: string; pricing_model: string };
  errors?: Array<{ code: number; title: string; message: string; error_data: { details: string } }>;
}

export interface YcloudTemplateComponent {
  type: 'header' | 'body' | 'button';
  sub_type?: string;
  index?: string;
  parameters: YcloudTemplateParameter[];
}

export interface YcloudTemplateParameter {
  type: 'text' | 'currency' | 'date_time' | 'image' | 'video' | 'document';
  text?: string;
  currency?: { fallback_value: string; code: string; amount_1000: number };
  date_time?: { fallback_value: string };
  image?: { id: string };
  video?: { id: string };
  document?: { id: string; filename?: string };
}
