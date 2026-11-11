import type { AuthSession, ConfirmationData, Dashboard, Folder, LabelDef, MailDetail } from './types';

const TOKEN_KEY = 'yunyouhe.dashboard.token';

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
  }
}

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (value: string) => { try { localStorage.setItem(TOKEN_KEY, value); } catch { /* 隐私模式下忽略 */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

async function request<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('content-type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let response: Response;
  try {
    response = await fetch(path, { ...init, headers, body, cache: 'no-store' });
  } catch {
    throw new ApiError('无法连接云邮盒服务，请检查网络。', 0);
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 && path !== '/api/login') window.dispatchEvent(new Event('yunyouhe:auth-expired'));
  if (!response.ok) throw new ApiError(data.message || `请求失败（${response.status}）`, response.status, data.code);
  return data as T;
}

type ActionResult = { ok?: boolean; data?: ConfirmationData };

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: { username: string } }>('/api/login', { method: 'POST', json: { username, password } }),
  session: () => request<{ user: { username: string } }>('/api/session'),
  dashboard: (folder: Folder, account: string, label = '') =>
    request<Dashboard>(`/api/dashboard?folder=${folder}&account=${encodeURIComponent(account)}&label=${encodeURIComponent(label)}`),
  markRead: (messages: { workspace: string; messageId: string }[]) =>
    request<{ marked: number }>('/api/mail/mark-read', { method: 'POST', json: { messages } }),
  listLabels: () => request<{ labels: LabelDef[] }>('/api/labels'),
  createLabel: (name: string, color?: string) => request<LabelDef>('/api/labels', { method: 'POST', json: { name, color } }),
  updateLabel: (name: string, patch: { name?: string; color?: string; aliases?: { workspace: string; aliasId: string }[] }) =>
    request<LabelDef>(`/api/labels/${encodeURIComponent(name)}`, { method: 'PUT', json: patch }),
  deleteLabel: (name: string) => request<{ ok: boolean }>(`/api/labels/${encodeURIComponent(name)}`, { method: 'DELETE' }),
  message: (id: string, workspace: string) =>
    request<MailDetail>(`/api/messages/${encodeURIComponent(id)}?workspace=${encodeURIComponent(workspace)}`),
  star: (id: string, workspace: string, starred: boolean) =>
    request<{ starred: boolean }>(`/api/messages/${encodeURIComponent(id)}/star`, { method: 'POST', json: { workspace, starred } }),
  labels: (aliasId: string, workspace: string, labels: string[]) =>
    request<{ labels: string[] }>(`/api/aliases/${encodeURIComponent(aliasId)}/labels`, { method: 'PUT', json: { workspace, labels } }),
  mailAction: (payload: Record<string, unknown>) => request<ActionResult>('/api/mail/action', { method: 'POST', json: payload }),
  removeWorkspaces: (workspaces: string[], mode: 'account' | 'all') =>
    request<{ removed: number }>('/api/workspaces/remove', { method: 'POST', json: { workspaces, mode } }),
  checkWorkspaces: () =>
    request<{ workspaces: { workspace: string; status: string; statusMessage: string | null }[] }>('/api/workspaces/check', { method: 'POST' }),
  startAuth: (connectionId?: string) => request<AuthSession>('/api/auth/start', { method: 'POST', json: { connectionId } }),
  authStatus: (sessionId: string) => request<AuthSession>(`/api/auth/status?sessionId=${encodeURIComponent(sessionId)}`),
};
