import { ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark' | 'system';
const KEY = 'yunyouhe.theme';
const media = window.matchMedia('(prefers-color-scheme: dark)');

function read(): ThemeMode {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

export const themeMode = ref<ThemeMode>(read());
export const isDark = ref(false);

function apply() {
  isDark.value = themeMode.value === 'dark' || (themeMode.value === 'system' && media.matches);
  if (isDark.value) document.documentElement.setAttribute('data-theme', 'dark');
  else document.documentElement.removeAttribute('data-theme');
  // Arco 组件库的暗色模式开关
  if (isDark.value) document.body.setAttribute('arco-theme', 'dark');
  else document.body.removeAttribute('arco-theme');
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark.value ? '#262624' : '#faf9f5');
}

watch(themeMode, (value) => {
  try { localStorage.setItem(KEY, value); } catch { /* ignore */ }
  apply();
});
media.addEventListener('change', apply);
apply();
