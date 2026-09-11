export type NotificationChannel =
  | 'email'
  | 'sms'
  | 'push'
  | 'line'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'teams'
  | 'webhook';

export interface NotificationMessage {
  to: string | string[];
  subject?: string;
  body: string;
  channel: NotificationChannel;
  priority?: 'low' | 'normal' | 'high' | 'critical';
  attachments?: NotificationAttachment[];
  metadata?: Record<string, unknown>;
}

export interface NotificationAttachment {
  filename: string;
  contentType: string;
  data: Buffer | string;
}

export interface NotificationResult {
  messageId: string;
  channel: NotificationChannel;
  status: 'sent' | 'queued' | 'failed';
  timestamp: Date;
  error?: string;
}

export interface NotificationProvider {
  readonly name: string;
  readonly supportedChannels: NotificationChannel[];

  send(message: NotificationMessage): Promise<NotificationResult>;
  sendBatch(messages: NotificationMessage[]): Promise<NotificationResult[]>;
  isChannelAvailable(channel: NotificationChannel): Promise<boolean>;
}
