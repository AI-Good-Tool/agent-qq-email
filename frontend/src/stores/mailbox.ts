import { computed, reactive } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { Account, Contact, Folder, LabelDef, MailItem, View } from '@/api/types';
import { isToday } from '@/utils/format';

const ACCOUNT_KEY = 'yunyouhe.dashboard.account';
const readAccount = () => { try { return localStorage.getItem(ACCOUNT_KEY) || 'default'; } catch { return 'default'; } };
const saveAccount = (value: string) => { try { localStorage.setItem(ACCOUNT_KEY, value); } catch { /* ignore */ } };

export const state = reactive({
  view: 'inbox' as View,
  folder: 'inbox' as Folder,
  account: readAccount(),
  label: 'all',
  status: 'all' as 'all' | 'unread' | 'starred',
  search: '',
  loading: false,
  loaded: false,
  source: '' as '' | 'agently-cli' | 'sqlite-cache',
  accounts: [] as Account[],
  archived: [] as Account[],
  emails: [] as MailItem[],
  contacts: [] as Contact[],
  labels: [] as LabelDef[],
  connectionCount: 0,
  lastLoadedAt: 0,
});

let loadSeq = 0;

export async function loadDashboard(folder: Folder = state.folder, account: string = state.account) {
  const seq = ++loadSeq;
  state.loading = true;
  try {
    const data = await api.dashboard(folder, account, account === 'all' ? state.label : '');
    if (seq !== loadSeq) return;
    state.accounts = data.accounts;
    state.archived = data.archivedAccounts || [];
    state.emails = [...data.emails].sort((a, b) => b.receivedAt - a.receivedAt);
    state.contacts = data.contacts || [];
    state.labels = data.labels || [];
    state.connectionCount = data.stats?.accounts ?? 0;
    state.source = data.source;
    state.folder = folder;
    state.account = data.selectedAccountId || account;
    state.loaded = true;
    state.lastLoadedAt = Date.now();
    saveAccount(state.account);
  } catch (error) {
    if (seq === loadSeq) Message.error(error instanceof Error ? error.message : '无法读取邮箱数据，请稍后重试。');
  } finally {
    if (seq === loadSeq) state.loading = false;
  }
}

export function resetMailbox() {
  Object.assign(state, { accounts: [], archived: [], emails: [], contacts: [], labels: [], loaded: false, source: '' });
}

export const isMailView = (view: View) => view === 'inbox' || view === 'starred' || view === 'sent' || view === 'trash';

export async function changeView(view: View) {
  state.view = view;
  state.status = 'all';
  const folder: Folder = view === 'sent' ? 'sent' : view === 'trash' ? 'trash' : view === 'labels' || view === 'accounts' ? state.folder : 'inbox';
  if (folder !== state.folder || !state.loaded) await loadDashboard(folder, state.account);
}

export async function changeAccount(account: string) {
  state.account = account;
  saveAccount(account);
  if (!isMailView(state.view)) state.view = 'inbox';
  await loadDashboard(state.folder, account);
}

export const accountMap = computed(() => new Map([...state.accounts, ...state.archived].map((a) => [a.id, a])));
export const selectedAccount = computed(() => accountMap.value.get(state.account));
export const labelColors = computed(() => new Map(state.labels.map((l) => [l.name, l.color])));
export const allLabels = computed(() => {
  const names = state.labels.map((l) => l.name);
  for (const name of state.accounts.flatMap((a) => a.labels)) if (!names.includes(name)) names.push(name);
  return names;
});

export async function refreshLabels() {
  try { state.labels = (await api.listLabels()).labels; } catch { /* 下次加载时再刷新 */ }
}

/** 侧边栏点击标签：跨邮箱查看带该标签的邮件；再次点击取消筛选 */
export async function selectLabel(name: string) {
  const next = state.label === name ? 'all' : name;
  state.label = next;
  if (!isMailView(state.view)) state.view = 'inbox';
  if (next !== 'all' && state.account !== 'all') await changeAccount('all');
  else if (state.folder !== 'inbox' && state.view === 'inbox') await loadDashboard('inbox');
}
// 发信按授权工作区区分，官方 CLI 使用该授权的主邮箱发信（列表中主邮箱排在最前）
export const senderOptions = computed(() => {
  const options = new Map<string, { value: string; label: string }>();
  for (const a of state.accounts) {
    if (a.status === 'expired' || options.has(a.workspace)) continue;
    options.set(a.workspace, { value: a.workspace, label: a.email });
  }
  return Array.from(options.values());
});

export const filteredEmails = computed(() => {
  const q = state.search.trim().toLowerCase();
  return state.emails.filter((mail) => {
    const account = accountMap.value.get(mail.accountId);
    if (state.account !== 'all' && mail.accountId !== state.account) return false;
    if (state.label !== 'all' && (state.label === 'untagged' ? account?.labels.length : !account?.labels.includes(state.label))) return false;
    if (state.view === 'starred' && !mail.isStarred) return false;
    if (state.status === 'unread' && mail.isRead) return false;
    if (state.status === 'starred' && !mail.isStarred) return false;
    if (q && !`${mail.sender} ${mail.senderAddress} ${mail.subject} ${mail.preview}`.toLowerCase().includes(q)) return false;
    return true;
  });
});

export const stats = computed(() => ({
  total: state.emails.length,
  unread: state.emails.filter((m) => !m.isRead).length,
  today: state.emails.filter((m) => isToday(m.receivedAt)).length,
  inboxUnread: state.accounts.reduce((sum, a) => sum + a.unread, 0),
  starred: state.emails.filter((m) => m.isStarred).length,
}));

export async function toggleStar(mail: MailItem) {
  const starred = !mail.isStarred;
  mail.isStarred = starred;
  try {
    await api.star(mail.messageId, mail.workspace, starred);
  } catch (error) {
    mail.isStarred = !starred;
    Message.error(error instanceof Error ? error.message : '星标保存失败。');
  }
}

export async function markAllRead(items: MailItem[]) {
  const unread = items.filter((m) => !m.isRead);
  if (!unread.length) return 0;
  await api.markRead(unread.map((m) => ({ workspace: m.workspace, messageId: m.messageId })));
  for (const mail of unread) markRead(mail);
  return unread.length;
}

export function markRead(mail: MailItem) {
  if (mail.isRead) return;
  mail.isRead = true;
  const account = accountMap.value.get(mail.accountId);
  if (account && account.unread > 0 && state.folder === 'inbox') account.unread -= 1;
}
