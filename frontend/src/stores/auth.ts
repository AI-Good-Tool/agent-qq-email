import { reactive } from 'vue';
import { api, tokenStore } from '@/api/client';

export const auth = reactive({
  status: 'checking' as 'checking' | 'authenticated' | 'anonymous',
  username: '',
  expiredNotice: '',
});

export async function checkSession() {
  if (!tokenStore.get()) { auth.status = 'anonymous'; return; }
  try {
    const data = await api.session();
    auth.username = data.user.username;
    auth.status = 'authenticated';
  } catch {
    auth.status = 'anonymous';
  }
}

export async function login(username: string, password: string) {
  const data = await api.login(username, password);
  tokenStore.set(data.token);
  auth.username = data.user.username;
  auth.expiredNotice = '';
  auth.status = 'authenticated';
}

export function logout(notice = '') {
  tokenStore.clear();
  auth.expiredNotice = notice;
  auth.status = 'anonymous';
}

window.addEventListener('yunyouhe:auth-expired', () => {
  if (auth.status === 'authenticated') logout('登录状态已失效，请重新登录。');
});
