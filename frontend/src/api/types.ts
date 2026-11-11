export type Folder = 'inbox' | 'sent' | 'trash';
export type View = 'inbox' | 'starred' | 'sent' | 'trash' | 'contacts' | 'labels' | 'accounts';
export type AccountStatus = 'online' | 'expired' | 'error' | 'removed';

export interface Account {
  id: string;
  aliasId: string;
  workspace: string;
  connectionId: string;
  name: string;
  email: string;
  unread: number;
  messageCount: number;
  color: string;
  status: AccountStatus;
  statusMessage: string;
  lastSyncedAt: number | null;
  labels: string[];
}

export interface MailAddress { name?: string; email: string }

export interface MailItem {
  id: string;
  messageId: string;
  workspace: string;
  connectionId: string;
  sender: string;
  senderAddress: string;
  recipients: MailAddress[];
  subject: string;
  preview: string;
  accountId: string;
  category: string;
  receivedAt: number;
  isRead: boolean;
  isStarred: boolean;
  hasAttachments: boolean;
}

export interface Contact { name: string; email: string }

export interface LabelDef { name: string; color: string; createdAt: number; aliasCount: number }

export interface Dashboard {
  accounts: Account[];
  archivedAccounts: Account[];
  emails: MailItem[];
  contacts: Contact[];
  labels: LabelDef[];
  connections: { id: string; name: string; aliasCount: number; unread: number; status: string }[];
  stats: { total: number; unread: number; accounts: number; aliases: number };
  source: 'agently-cli' | 'sqlite-cache';
  folder: Folder;
  selectedAccountId: string;
}

export interface MailAttachment { attachment_id?: string; filename: string; content_type?: string; size?: number }

export interface MailDetail {
  message_id: string;
  workspace: string;
  subject: string;
  body: string;
  body_format?: string;
  created_at: string;
  from?: MailAddress;
  to?: MailAddress[];
  cc?: MailAddress[];
  attachments?: MailAttachment[];
}

export interface ConfirmationData {
  confirmation_required?: boolean;
  confirmation_token?: string;
  summary?: { from?: string; to?: string[]; subject?: string } | string;
}

export interface AuthSession {
  sessionId: string;
  status: 'pending' | 'syncing' | 'confirmed' | 'failed' | 'expired';
  authUrl: string | null;
  expiresAt: number;
  message: string | null;
}
