export type DeliveryMode = 'wordpress_rest' | 'static_sftp';
export interface WordPressEvent { event_id:string; event_type:string; content_hash:string; correlation_id:string; site:string; fetch_url:string; post:{id:number;type:string;status:string;title:string;slug:string;url:string;modified_gmt:string}; software:{id:string;version:string}; }
export interface InboundBatch { site:string; events:WordPressEvent[]; }
export interface TargetRecord { target_key:string; owner_user_id:string; site_origin:string; site_url:string; delivery_mode:DeliveryMode; credential_ref:string; hmac_secret_ref:string; active:boolean; config:Record<string,unknown>; }
export interface CredentialRecord { apiKey?:string; hmacSecret?:string; indexNowKey?:string; host?:string; port?:number; username?:string; privateKey?:string; password?:string; zoneId?:string; apiToken?:string; }
export type ContentJob = {kind:'event';targetKey:string;event:WordPressEvent}|{kind:'reconcile';targetKey:string;date:string};
export interface ArticlePayload { id:number; type:string; status:string; title:string; content:string; excerpt:string; slug:string; link:string; modified_gmt:string; content_hash:string; schema_json?:unknown; featured_image_url?:string|false; }
