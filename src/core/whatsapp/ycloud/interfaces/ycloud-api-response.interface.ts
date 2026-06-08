export interface YcloudSendResponse {
  id: string;
  messaging_product: 'whatsapp';
  contacts?: Array<{ input: string; wa_id: string }>;
  messages?: Array<{ id: string }>;
}

export interface YcloudUploadResponse {
  id: string;
}

export interface YcloudMediaResponse {
  id: string;
  url?: string;
  mime_type?: string;
  sha256?: string;
  file_size?: number;
}
