<script setup lang="ts">
import { computed, reactive, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { Account } from '@/api/types';
import { loadDashboard, state } from '@/stores/mailbox';
import { formatFullTime, initial, statusMeta } from '@/utils/format';
import LabelChip from './LabelChip.vue';

const emit = defineEmits<{ (e: 'add'): void; (e: 'edit-labels', account: Account): void }>();

const selected = ref<string[]>([]);
const checking = ref(false);
const remove = reactive({ visible: false, accounts: [] as Account[], mode: 'account' as 'account' | 'all', removing: false, error: '' });

const expiredCount = computed(() => state.accounts.filter((a) => a.status === 'expired').length);
const removeOnlyArchived = computed(() => remove.accounts.every((a) => a.status === 'removed'));
const sharedWorkspace = computed(() => new Set(remove.accounts.map((a) => a.workspace)).size < remove.accounts.length);

async function check() {
  checking.value = true;
  try {
    const data = await api.checkWorkspaces();
    const bad = data.workspaces.filter((w) => w.status !== 'online').length;
    if (bad) Message.warning(`有 ${bad} 个授权异常，请重新扫码。`);
    else Message.success('所有邮箱授权正常。');
    await loadDashboard();
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '状态检测失败。');
  } finally {
    checking.value = false;
  }
}

function openRemove(accounts: Account[], mode: 'account' | 'all' = 'account') {
  // 同一次扫码授权下的邮箱共享凭据，只能一起删除
  const workspaces = new Set(accounts.map((a) => a.workspace));
  Object.assign(remove, {
    visible: true,
    accounts: [...state.accounts, ...state.archived].filter((a) => workspaces.has(a.workspace)),
    mode,
    removing: false,
    error: '',
  });
}

async function submitRemove() {
  const workspaces = Array.from(new Set(remove.accounts.map((a) => a.workspace)));
  remove.removing = true;
  remove.error = '';
  try {
    await api.removeWorkspaces(workspaces, removeOnlyArchived.value ? 'all' : remove.mode);
    Message.success(remove.mode === 'all' || removeOnlyArchived.value ? '邮箱账号和本地邮件记录已删除。' : '邮箱账号已删除，本地邮件记录已保留。');
    remove.visible = false;
    selected.value = [];
    const reset = workspaces.some((w) => state.account.startsWith(`${w}:`));
    await loadDashboard(state.folder, reset ? 'default' : state.account);
  } catch (error) {
    remove.error = error instanceof Error ? error.message : '删除邮箱账号失败。';
  } finally {
    remove.removing = false;
  }
  return false;
}

function toggle(id: string, checked: boolean | (string | number | boolean)[]) {
  selected.value = checked ? [...selected.value, id] : selected.value.filter((x) => x !== id);
}
</script>

<template>
  <div class="panel">
    <div class="head">
      <span class="muted">
        共 {{ state.accounts.length }} 个邮箱<template v-if="expiredCount">，<b class="warn">{{ expiredCount }} 个授权已失效</b></template>
      </span>
      <div class="head-actions">
        <a-button size="small" :loading="checking" :disabled="!state.accounts.length" @click="check"><template #icon><icon-sync /></template>检测授权</a-button>
        <a-button size="small" @click="emit('add')"><template #icon><icon-qrcode /></template>扫码添加</a-button>
        <a-button size="small" status="danger" :disabled="!selected.length" @click="openRemove(state.accounts.filter((a) => selected.includes(a.id)))">
          删除所选<template v-if="selected.length">（{{ selected.length }}）</template>
        </a-button>
      </div>
    </div>

    <div class="table">
      <div v-if="!state.accounts.length" class="empty muted">还没有邮箱账号，点击「扫码添加」连接第一个微信邮箱。</div>
      <div v-for="account in state.accounts" :key="account.id" class="row">
        <a-checkbox :model-value="selected.includes(account.id)" @change="(v) => toggle(account.id, v)" />
        <span class="avatar" :style="{ background: account.color }">{{ initial(account.name || account.email) }}</span>
        <div class="who">
          <strong class="ellipsis">{{ account.email }}</strong>
          <span class="muted ellipsis">
            {{ account.messageCount }} 封本地邮件 · 同步于 {{ account.lastSyncedAt ? formatFullTime(account.lastSyncedAt) : '—' }}
          </span>
        </div>
        <div class="labels">
          <LabelChip v-for="label in account.labels.slice(0, 3)" :key="label" :name="label" />
          <em v-if="account.labels.length > 3" class="more">+{{ account.labels.length - 3 }}</em>
        </div>
        <a-tooltip :content="account.statusMessage || statusMeta[account.status].text" mini>
          <a-tag :color="statusMeta[account.status].color" size="small">{{ statusMeta[account.status].text }}</a-tag>
        </a-tooltip>
        <div class="ops">
          <a-button v-if="account.status !== 'online'" type="text" size="mini" @click="emit('add')">重新扫码</a-button>
          <a-button type="text" size="mini" @click="emit('edit-labels', account)">标签</a-button>
          <a-button type="text" size="mini" status="danger" @click="openRemove([account])">删除</a-button>
        </div>
      </div>
    </div>

    <template v-if="state.archived.length">
      <div class="section">已删除的邮箱（仅保留本地邮件记录）</div>
      <div class="table">
        <div v-for="account in state.archived" :key="account.id" class="row archived">
          <span class="avatar" :style="{ background: account.color }">{{ initial(account.email) }}</span>
          <div class="who">
            <strong class="ellipsis">{{ account.email }}</strong>
            <span class="muted">{{ account.messageCount }} 封本地邮件</span>
          </div>
          <div class="ops">
            <a-button type="text" size="mini" status="danger" @click="openRemove([account], 'all')">清除记录</a-button>
          </div>
        </div>
      </div>
    </template>

    <a-modal
      v-model:visible="remove.visible"
      :title="removeOnlyArchived ? '清除保留的邮件记录？' : `删除 ${remove.accounts.length} 个邮箱账号？`"
      :ok-text="removeOnlyArchived || remove.mode === 'all' ? '删除全部' : '仅删除账号'"
      :ok-loading="remove.removing"
      :ok-button-props="{ status: 'danger' }"
      :on-before-ok="submitRemove"
      :width="520"
      title-align="start"
      unmount-on-close
    >
      <div class="remove-list"><a-tag v-for="a in remove.accounts" :key="a.id">{{ a.email }}</a-tag></div>
      <a-radio-group v-if="!removeOnlyArchived" v-model="remove.mode" direction="vertical" class="modes">
        <a-radio value="account">
          <b>仅删除邮箱账号</b>
          <span class="muted">退出授权并从列表移除，本地邮件记录保留，仍可在「全部邮箱」中查看。</span>
        </a-radio>
        <a-radio value="all">
          <b>删除全部</b>
          <span class="muted">同时删除本地邮件记录、标签与星标，无法恢复。</span>
        </a-radio>
      </a-radio-group>
      <p class="yy-note">只删除本系统中的数据并退出授权，不会删除 Agent Mail 服务器上的邮件。<template v-if="sharedWorkspace">同一次扫码授权下的邮箱会一起删除。</template></p>
      <div v-if="remove.error" class="yy-error">{{ remove.error }}</div>
    </a-modal>
  </div>
</template>

<style scoped>
.head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 16px; border-bottom: 1px solid var(--yy-border); font-size: 13px; }
.head-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.warn { color: var(--yy-danger); font-weight: 600; }
.table { overflow: hidden; }
.more { font-style: normal; font-size: 11.5px; color: var(--yy-text-4); align-self: center; }
.row { display: flex; align-items: center; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--yy-border); }
.row:last-child { border-bottom: none; }
.row.archived { opacity: 0.8; }
.avatar { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-size: 12.5px; font-weight: 600; }
.who { flex: 1; min-width: 0; display: grid; font-size: 12.5px; }
.who strong { font-size: 13.5px; font-weight: 600; }
.labels { display: flex; gap: 4px; flex: none; }
.ops { display: flex; flex: none; }
.empty { padding: 40px 16px; text-align: center; }
.section { padding: 14px 16px 8px; font-size: 12.5px; font-weight: 600; color: var(--yy-text-3); border-top: 1px solid var(--yy-border); background: var(--yy-surface-2); }
.remove-list { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
.modes { width: 100%; gap: 10px; margin-bottom: 12px; }
.modes :deep(.arco-radio) { align-items: flex-start; padding: 10px 12px; border: 1px solid var(--yy-border); border-radius: 10px; width: 100%; margin: 0; }
.modes :deep(.arco-radio-label) { display: grid; gap: 2px; white-space: normal; }
@media (max-width: 720px) {
  .labels { display: none; }
  .row { flex-wrap: wrap; }
  .ops { width: 100%; justify-content: flex-end; }
}
</style>
