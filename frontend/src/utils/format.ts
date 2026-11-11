import type { AccountStatus, MailAddress } from '@/api/types';

const pad = (n: number) => String(n).padStart(2, '0');

export function formatListTime(value: number): string {
  if (!value) return '';
  const date = new Date(value);
  const now = new Date();
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}`;
  if (date.toDateString() === now.toDateString()) return clock;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return `昨天 ${clock}`;
  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

export function formatFullTime(value: number | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function isToday(value: number): boolean {
  return Boolean(value) && new Date(value).toDateString() === new Date().toDateString();
}

export const addressText = (a?: MailAddress) => (a ? [a.name, a.email && `<${a.email}>`].filter(Boolean).join(' ') : '—');
export const addressList = (list?: MailAddress[]) => (list?.length ? list.map(addressText).join('、') : '—');

export function fileSize(value?: number): string {
  if (!value) return '';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export const initial = (text: string) => (text || '?').trim().slice(0, 1).toUpperCase();

const AVATAR_COLORS = ['#c96442', '#5a7ea8', '#7f8f4e', '#a8677f', '#c08a3e', '#4f8f88', '#8a6fb0'];
export function colorFor(text: string): string {
  let hash = 0;
  for (const ch of text || '') hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export const statusMeta: Record<AccountStatus, { text: string; color: string }> = {
  online: { text: '正常', color: 'green' },
  expired: { text: '已失效', color: 'red' },
  error: { text: '同步失败', color: 'orangered' },
  removed: { text: '已删除', color: 'gray' },
};
