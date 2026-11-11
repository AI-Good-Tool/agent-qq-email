<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { AuthSession } from '@/api/types';
import { loadDashboard } from '@/stores/mailbox';

const visible = defineModel<boolean>('visible', { required: true });
const phase = ref<'loading' | 'ready' | 'syncing' | 'success' | 'error'>('loading');
const session = ref<AuthSession | null>(null);
const error = ref('');
const now = ref(Date.now());
let pollTimer = 0;
let clockTimer = 0;

const remaining = computed(() => {
  if (!session.value) return '';
  const seconds = Math.max(0, Math.round((session.value.expiresAt - now.value) / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
});

function stop() {
  window.clearInterval(pollTimer);
  window.clearInterval(clockTimer);
}

function apply(data: AuthSession) {
  session.value = data;
  if (data.status === 'pending') phase.value = 'ready';
  else if (data.status === 'syncing') phase.value = 'syncing';
  else if (data.status === 'confirmed') {
    phase.value = 'success';
    stop();
    void loadDashboard();
    window.setTimeout(() => { if (phase.value === 'success') visible.value = false; }, 1600);
  } else {
    phase.value = 'error';
    error.value = data.status === 'expired' ? '授权二维码已过期，请重新开始。' : data.message || '官方登录程序已退出，请重新尝试。';
    stop();
  }
}

async function start() {
  stop();
  phase.value = 'loading';
  now.value = Date.now();
  error.value = '';
  session.value = null;
  let created: AuthSession;
  try {
    created = await api.startAuth();
  } catch (err) {
    phase.value = 'error';
    error.value = err instanceof Error ? err.message : '无法创建授权会话。';
    return;
  }
  apply(created);
  if (created.status !== 'pending' && created.status !== 'syncing') return;
  clockTimer = window.setInterval(() => { now.value = Date.now(); }, 1000);
  pollTimer = window.setInterval(async () => {
    if (!session.value) return;
    try { apply(await api.authStatus(session.value.sessionId)); } catch { /* 网络抖动时继续轮询 */ }
  }, 1500);
}

watch(visible, (open) => { if (open) void start(); else stop(); }, { immediate: true });
onBeforeUnmount(stop);
</script>

<template>
  <a-modal v-model:visible="visible" :footer="false" :width="440" title-align="start" unmount-on-close>
    <template #title>连接微信邮箱</template>
    <div class="qr">
      <template v-if="phase === 'loading'">
        <div class="hero"><a-spin :size="26" /></div>
        <p class="muted">正在启动 Agent Mail 官方授权…</p>
      </template>

      <template v-else-if="phase === 'ready'">
        <div class="hero wechat"><icon-wechat /></div>
        <ol class="steps">
          <li>点击下方按钮打开 Agent Mail 官方授权页</li>
          <li>用<strong>另一台设备上的微信</strong>扫描页面中的二维码</li>
          <li>在手机上选择要连接的邮箱并确认</li>
        </ol>
        <a-button type="primary" long size="large" :href="session?.authUrl || undefined" target="_blank" rel="noreferrer">
          <template #icon><icon-launch /></template>打开官方授权页
        </a-button>
        <div class="waiting"><span class="pulse" />等待扫码确认 · {{ remaining }} 后过期</div>
        <p class="yy-note">重新扫码已添加过的邮箱会覆盖原账号，标签和星标会保留。</p>
      </template>

      <template v-else-if="phase === 'syncing'">
        <div class="hero"><a-spin :size="26" /></div>
        <p><strong>授权成功</strong></p>
        <p class="muted">正在同步邮箱与邮件…</p>
      </template>

      <template v-else-if="phase === 'success'">
        <div class="hero ok"><icon-check /></div>
        <p><strong>邮箱连接成功</strong></p>
        <p class="muted">正在刷新邮箱列表…</p>
      </template>

      <template v-else>
        <div class="hero bad"><icon-exclamation /></div>
        <p><strong>无法完成连接</strong></p>
        <p class="muted">{{ error }}</p>
        <a-button @click="start">重新开始</a-button>
      </template>
    </div>
  </a-modal>
</template>

<style scoped>
.qr { display: grid; justify-items: center; text-align: center; gap: 8px; padding: 4px 0 6px; }
.qr p { margin: 0; }
.hero { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; font-size: 30px; margin: 6px 0 8px; background: var(--yy-surface-2); color: var(--yy-text-3); }
.hero.wechat { background: #07c160; color: #fff; }
.hero.ok { background: color-mix(in srgb, var(--yy-success) 16%, transparent); color: var(--yy-success); }
.hero.bad { background: color-mix(in srgb, var(--yy-danger) 14%, transparent); color: var(--yy-danger); }
.steps { text-align: left; margin: 4px 0 12px; padding-left: 20px; color: var(--yy-text-2); line-height: 1.9; font-size: 13.5px; justify-self: stretch; }
.waiting { display: flex; align-items: center; gap: 8px; margin-top: 10px; font-size: 13px; color: var(--yy-text-3); font-variant-numeric: tabular-nums; }
.pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--yy-accent); animation: pulse 1.4s ease-in-out infinite; }
@keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
.yy-note { margin-top: 6px; }
</style>
