export interface YcloudDbConfig {
  id_cuenta_whcue: string;
  business_id_whcue?: string;
  id_telefono_whcue: string;
  webhook_url_whcue?: string;
}

export interface YcloudCacheConfig {
  apiKey: string;
  phoneNumberId: string;
  businessId?: string;
  displayPhoneNumber: string;
}
