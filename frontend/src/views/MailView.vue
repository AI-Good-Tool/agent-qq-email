<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { Account, MailDetail, MailItem } from '@/api/types';
import { auth } from '@/stores/auth';
import { allLabels, changeAccount, changeView, filteredEmails, isMailView, labelColors, loadDashboard, markAllRead, selectedAccount, state } from '@/stores/mailbox';
import { isToday, statusMeta } from '@/utils/format';
import AppSidebar from '@/components/AppSidebar.vue';
import BrandMark from '@/components/BrandMark.vue';
import ComposeModal from '@/components/ComposeModal.vue';
import ContactsPanel from '@/components/ContactsPanel.vue';
import LabelEditorModal from '@/components/LabelEditorModal.vue';
import MailDetailDrawer from '@/components/MailDetailDrawer.vue';
import MailList from '@/components/MailList.vue';
import AccountsPanel from '@/components/AccountsPanel.vue';
import LabelsPanel from '@/components/LabelsPanel.vue';
import QrAuthModal from '@/components/QrAuthModal.vue';
import TrashModal from '@/components/TrashModal.vue';

const compose = ref<InstanceType<typeof ComposeModal>>();
const labelEditor = ref<InstanceType<typeof LabelEditorModal>>();
const trash = ref<InstanceType<typeof TrashModal>>();
const qrOpen = ref(false);
const labelsPanel = ref<InstanceType<typeof LabelsPanel>>();
const markingRead = ref(false);
const menuOpen = ref(false);
const detailOpen = ref(false);
const detailMail = ref<MailItem | null>(null);

const titles = { inbox: '收件箱', starred: '星标邮件', sent: '已发送', trash: '垃圾箱', contacts: '联系人', labels: '标签管理', accounts: '账号管理' } as const;
const title = computed(() => titles[state.view]);
const greeting = computed(() => {
  const hour = new Date().getHours();
  const part = hour < 5 ? '夜深了' : hour < 11 ? '早上好' : hour < 13 ? '中午好' : hour < 18 ? '下午好' : '晚上好';
  return `${part}，${auth.username || 'admin'}`;
});
const subtitle = computed(() => {
  if (state.view === 'contacts') return `${state.contacts.length} 位往来联系人`;
  if (state.view === 'labels') return `${state.labels.length} 个标签`;
  if (state.view === 'accounts') return `${state.connectionCount} 个微信 · ${state.accounts.length} 个邮箱`;
  const list = filteredEmails.value;
  const parts = [`${list.length} 封邮件`];
  const unread = list.filter((m) => !m.isRead).length;
  const today = list.filter((m) => isToday(m.receivedAt)).length;
  if (state.view === 'inbox' && unread) parts.push(`${unread} 封未读`);
  if (state.view === 'inbox' && today) parts.push(`今日 ${today} 封`);
  return parts.join(' · ');
});
const accountOptions = computed(() => [
  ...state.accounts.map((a) => ({ value: a.id, label: a.status === 'online' ? a.email : `${a.email}（${statusMeta[a.status].text}）` })),
  { value: 'all', label: '全部邮箱' },
  ...state.archived.map((a) => ({ value: a.id, label: `${a.email}（已删除）` })),
]);
const labelOptions = computed(() => [
  { value: 'all', label: '全部标签' },
  { value: 'untagged', label: '未设置标签' },
  ...allLabels.value.map((label) => ({ value: label, label })),
]);
const showOnboarding = computed(() => isMailView(state.view) && state.loaded && !state.accounts.length && !state.archived.length);
const unreadInView = computed(() => filteredEmails.value.filter((m) => !m.isRead).length);
const canMarkRead = computed(() => state.view === 'inbox' || state.view === 'starred');

async function doMarkAllRead() {
  markingRead.value = true;
  try {
    const count = await markAllRead(filteredEmails.value);
    Message.success(`已将 ${count} 封邮件标为已读。`);
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '操作失败。');
  } finally {
    markingRead.value = false;
  }
}

function openMail(mail: MailItem) {
  detailMail.value = mail;
  detailOpen.value = true;
}

function replyWith(detail: MailDetail) {
  detailOpen.value = false;
  compose.value?.open({
    action: 'reply',
    workspace: detail.workspace,
    to: detail.from?.email,
    subject: /^re:/i.test(detail.subject || '') ? detail.subject : `Re: ${detail.subject || '(无主题)'}`,
    messageId: detail.message_id,
  });
}

async function replyTo(mail: MailItem) {
  const close = Message.loading({ content: '正在读取邮件…', duration: 0 });
  try {
    replyWith(await api.message(mail.messageId, mail.workspace));
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '无法读取邮件详情。');
  } finally {
    close.close();
  }
}

function onTrashed(mail: MailItem) {
  if (detailMail.value?.id === mail.id) detailOpen.value = false;
}

function openQr() {
  menuOpen.value = false;
  qrOpen.value = true;
}
function openManage() {
  menuOpen.value = false;
  void changeView('accounts');
}
async function createLabel() {
  menuOpen.value = false;
  await changeView('labels');
  await nextTick();
  labelsPanel.value?.create();
}
function editLabels(account: Account) {
  menuOpen.value = false;
  labelEditor.value?.open(account);
}
function newMail(to = '') {
  menuOpen.value = false;
  compose.value?.open({ to });
}

onMounted(() => { void loadDashboard('inbox', state.account); });
</script>

<template>
  <div class="shell">
    <div class="side-fixed">
      <AppSidebar @compose="newMail()" @add-account="openQr" @manage="openManage" @create-label="createLabel" @edit-labels="editLabels" />
    </div>
    <a-drawer v-model:visible="menuOpen" placement="left" :width="288" :header="false" :footer="false" class="side-drawer">
      <AppSidebar @compose="newMail()" @add-account="openQr" @manage="openManage" @create-label="createLabel" @edit-labels="editLabels" @navigate="menuOpen = false" />
    </a-drawer>

    <main class="main">
      <div class="mobile-bar">
        <button type="button" class="bar-btn" aria-label="打开菜单" @click="menuOpen = true"><icon-menu /></button>
        <BrandMark :size="22" />
        <span class="serif">云邮盒</span>
        <button type="button" class="bar-btn compose-btn" aria-label="写邮件" :disabled="!state.accounts.length" @click="newMail()"><icon-edit /></button>
      </div>

      <div class="container">
        <header class="page-head">
          <div class="head-text">
            <p class="greeting">{{ greeting }}</p>
            <h1 class="serif">{{ title }}</h1>
            <p class="muted sub">
              {{ subtitle }}
              <button v-if="isMailView(state.view) && state.label !== 'all'" type="button" class="label-filter" :style="{ '--c': labelColors.get(state.label) || '#6b6a65' }"
                title="清除标签筛选" @click="state.label = 'all'">
                <i />{{ state.label === 'untagged' ? '未设置标签' : state.label }}<icon-close />
              </button>
            </p>
          </div>
          <a-tooltip content="同步最新邮件" mini>
            <button type="button" class="refresh" :class="{ spinning: state.loading }" :disabled="state.loading" aria-label="同步最新邮件" @click="loadDashboard()">
              <icon-refresh />
            </button>
          </a-tooltip>
        </header>

        <div v-if="!showOnboarding && (isMailView(state.view) || state.view === 'contacts')" class="composer" :class="{ compact: state.view === 'contacts' }">
          <div class="search">
            <icon-search class="search-icon" />
            <input v-model="state.search" type="search" :placeholder="state.view === 'contacts' ? '搜索联系人' : '搜索发件人、主题或摘要…'" />
            <button v-if="state.search" type="button" class="clear" aria-label="清除搜索" @click="state.search = ''"><icon-close /></button>
          </div>
          <div v-if="isMailView(state.view)" class="filters">
            <a-select :model-value="state.account" :options="accountOptions" size="small" class="pill pill-account" :bordered="false"
              :trigger-props="{ autoFitPopupMinWidth: true }" @change="(v) => changeAccount(String(v))">
              <template #prefix><icon-email /></template>
            </a-select>
            <a-select v-model="state.label" :options="labelOptions" size="small" class="pill" :bordered="false" :trigger-props="{ autoFitPopupMinWidth: true }">
              <template #prefix><icon-tag /></template>
            </a-select>
            <a-popconfirm v-if="canMarkRead" :content="`将当前列表中的 ${unreadInView} 封未读邮件标为已读？`" ok-text="全部已读" @ok="doMarkAllRead">
              <button type="button" class="mark-read" :disabled="!unreadInView || markingRead">
                <icon-loading v-if="markingRead" /><icon-check-circle v-else />全部已读<b v-if="unreadInView">{{ unreadInView }}</b>
              </button>
            </a-popconfirm>
            <div class="seg" role="tablist">
              <button v-for="opt in [{ v: 'all', l: '全部' }, { v: 'unread', l: '未读' }, { v: 'starred', l: '星标' }]" :key="opt.v" type="button" role="tab"
                :class="{ on: state.status === opt.v }" :aria-selected="state.status === opt.v" @click="state.status = opt.v as typeof state.status">{{ opt.l }}</button>
            </div>
          </div>
        </div>

        <div v-if="isMailView(state.view) && selectedAccount && selectedAccount.status !== 'online'" class="notice" :class="selectedAccount.status">
          <icon-exclamation-circle-fill class="notice-icon" />
          <div>
            <strong>{{ selectedAccount.email }} {{ statusMeta[selectedAccount.status].text }}</strong>
            <span v-if="selectedAccount.status === 'removed'">该邮箱已删除，下面是保留的本地邮件记录，无法查看正文或回复。</span>
            <span v-else-if="selectedAccount.status === 'expired'">授权已失效，下面显示的是本地缓存，重新扫码后会自动替换原账号。</span>
            <span v-else>{{ selectedAccount.statusMessage || '最近一次同步失败' }}，下面显示的是本地缓存。</span>
          </div>
          <a-button v-if="selectedAccount.status !== 'removed'" size="small" type="primary" @click="openQr">重新扫码</a-button>
        </div>
        <div v-else-if="state.loaded && state.source === 'sqlite-cache' && state.accounts.length && isMailView(state.view)" class="notice soft">
          <icon-history class="notice-icon" />
          <div><span>暂时无法连接 Agent Mail，当前显示本地缓存的邮件。</span></div>
        </div>

        <section v-if="showOnboarding" class="onboard">
          <div class="onboard-art"><icon-wechat /></div>
          <h2 class="serif">连接你的第一个邮箱</h2>
          <p class="muted">使用微信扫码授权 Agent Mail，授权后邮件会自动同步到这里。可以连接多个微信，每个微信下的邮箱都会独立显示。</p>
          <a-button type="primary" size="large" @click="openQr"><template #icon><icon-qrcode /></template>扫码添加微信</a-button>
        </section>

        <section v-else class="card">
          <ContactsPanel v-if="state.view === 'contacts'" @compose="newMail" />
          <LabelsPanel v-else-if="state.view === 'labels'" ref="labelsPanel" />
          <AccountsPanel v-else-if="state.view === 'accounts'" @add="openQr" @edit-labels="editLabels" />
          <template v-else>
            <div v-if="!state.loaded" class="skeleton">
              <div v-for="i in 6" :key="i" class="sk-row"><span class="sk-avatar" /><span class="sk-lines"><i /><i /></span></div>
            </div>
            <MailList v-else-if="filteredEmails.length" :items="filteredEmails" :active-id="detailOpen ? detailMail?.id : undefined"
              @open="openMail" @reply="replyTo" @trash="(m) => trash?.open(m)" />
            <div v-else class="empty">
              <p class="serif">{{ state.search || state.status !== 'all' || state.label !== 'all' ? '没有符合条件的邮件' : state.view === 'trash' ? '垃圾箱是空的' : state.view === 'starred' ? '还没有星标邮件' : '这里还没有邮件' }}</p>
              <span class="muted">{{ state.search || state.status !== 'all' || state.label !== 'all' ? '试试调整搜索词或筛选条件。' : '点击右上角的同步按钮获取最新邮件。' }}</span>
            </div>
          </template>
        </section>
      </div>
    </main>

    <MailDetailDrawer v-model:visible="detailOpen" :mail="detailMail" @reply="replyWith" @trash="(m) => trash?.open(m)" />
    <ComposeModal ref="compose" />
    <LabelEditorModal ref="labelEditor" />
    <TrashModal ref="trash" @done="onTrashed" />
    <QrAuthModal v-model:visible="qrOpen" />
  </div>
</template>

<style scoped>
.shell { height: 100%; display: flex; }
.side-fixed { width: 272px; flex: none; height: 100%; }
.main { flex: 1; min-width: 0; height: 100%; overflow-y: auto; background: var(--yy-bg); }
.container { max-width: 1040px; margin: 0 auto; padding: 44px 40px 64px; }
.mobile-bar { display: none; }

.page-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; margin-bottom: 22px; }
.greeting { margin: 0 0 4px; font-size: 13px; color: var(--yy-text-4); }
.page-head h1 { margin: 0; font-size: 34px; line-height: 1.15; color: var(--yy-text); }
.sub { margin: 8px 0 0; font-size: 13.5px; }
.refresh {
  width: 38px; height: 38px; flex: none; display: grid; place-items: center;
  border: 1px solid var(--yy-border-strong); border-radius: 50%;
  background: var(--yy-surface); color: var(--yy-text-2); cursor: pointer; font-size: 16px;
  transition: background 0.12s ease;
}
.refresh:hover:not(:disabled) { background: var(--yy-surface-2); }
.refresh.spinning :deep(svg) { animation: spin 0.9s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.composer {
  background: var(--yy-surface);
  border: 1px solid var(--yy-border-strong);
  border-radius: 18px;
  box-shadow: var(--yy-shadow);
  padding: 6px 8px 8px;
  margin-bottom: 16px;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.composer:focus-within { border-color: color-mix(in srgb, var(--yy-accent) 45%, var(--yy-border-strong)); }
.composer.compact { padding-bottom: 6px; }
.search { display: flex; align-items: center; gap: 10px; padding: 8px 10px 6px; }
.search-icon { color: var(--yy-text-4); font-size: 17px; flex: none; }
.search input {
  flex: 1; min-width: 0; border: none; outline: none; background: transparent;
  font-size: 15.5px; color: var(--yy-text); font-family: inherit;
}
.search input::placeholder { color: var(--yy-text-4); }
.search input::-webkit-search-cancel-button { display: none; }
.clear { border: none; background: var(--yy-active); color: var(--yy-text-3); width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; cursor: pointer; font-size: 11px; }
.filters { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; padding: 4px 2px 0; }
.filters :deep(.pill) { width: 150px; flex: none; background: var(--yy-surface-2); border: 1px solid var(--yy-border); border-radius: 9px; }
.filters :deep(.pill:hover) { background: var(--yy-active); }
.filters :deep(.pill-account) { width: 260px; }
.mark-read {
  margin-left: auto; display: inline-flex; align-items: center; gap: 6px;
  height: 28px; padding: 0 11px; border-radius: 9px; cursor: pointer; font-size: 12.5px;
  border: 1px solid var(--yy-border); background: var(--yy-surface-2); color: var(--yy-text-2);
}
.mark-read:hover:not(:disabled) { background: var(--yy-active); color: var(--yy-text); }
.mark-read:disabled { opacity: 0.5; cursor: not-allowed; }
.mark-read b { font-weight: 600; font-size: 11px; padding: 0 6px; border-radius: 8px; color: var(--yy-accent-text); background: var(--yy-accent-soft); }
.label-filter {
  display: inline-flex; align-items: center; gap: 5px; margin-left: 8px; vertical-align: 1px;
  padding: 0 8px; border-radius: 6px; border: none; cursor: pointer; font-size: 12px; line-height: 20px;
  color: color-mix(in srgb, var(--c) 82%, var(--yy-text)); background: color-mix(in srgb, var(--c) 14%, transparent);
}
.label-filter i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); }
.label-filter :deep(svg) { font-size: 10px; opacity: 0.7; }
.seg { display: inline-flex; padding: 2px; border-radius: 9px; background: var(--yy-surface-2); border: 1px solid var(--yy-border); }
.seg button { border: none; background: transparent; color: var(--yy-text-3); padding: 2px 12px; border-radius: 7px; cursor: pointer; font-size: 12.5px; line-height: 22px; }
.seg button.on { background: var(--yy-surface); color: var(--yy-text); font-weight: 600; box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08); }

.notice {
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px; margin-bottom: 16px;
  border-radius: 14px; border: 1px solid; font-size: 13px;
}
.notice > div { flex: 1; display: grid; gap: 1px; }
.notice-icon { font-size: 18px; flex: none; }
.notice.expired { background: color-mix(in srgb, var(--yy-danger) 8%, transparent); border-color: color-mix(in srgb, var(--yy-danger) 25%, transparent); }
.notice.expired .notice-icon { color: var(--yy-danger); }
.notice.error { background: color-mix(in srgb, var(--yy-warning) 9%, transparent); border-color: color-mix(in srgb, var(--yy-warning) 28%, transparent); }
.notice.error .notice-icon { color: var(--yy-warning); }
.notice.removed, .notice.soft { background: var(--yy-surface-2); border-color: var(--yy-border); color: var(--yy-text-2); }
.notice.removed .notice-icon, .notice.soft .notice-icon { color: var(--yy-text-4); }

.card { background: var(--yy-surface); border: 1px solid var(--yy-border); border-radius: 16px; overflow: hidden; }
.empty { display: grid; justify-items: center; gap: 6px; padding: 72px 16px; text-align: center; }
.empty p { margin: 0; font-size: 20px; color: var(--yy-text-2); }

.onboard {
  display: grid; justify-items: center; text-align: center; gap: 10px;
  padding: 56px 24px; border-radius: 20px;
  border: 1px dashed var(--yy-border-strong); background: var(--yy-surface);
}
.onboard-art { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; font-size: 32px; color: #fff; background: #07c160; margin-bottom: 6px; }
.onboard h2 { margin: 0; font-size: 26px; }
.onboard p { max-width: 440px; margin: 0 0 12px; }

.skeleton { padding: 6px 0; }
.sk-row { display: flex; align-items: center; gap: 12px; padding: 14px 18px; }
.sk-avatar { width: 34px; height: 34px; border-radius: 50%; background: var(--yy-surface-2); }
.sk-lines { flex: 1; display: grid; gap: 8px; }
.sk-lines i { display: block; height: 10px; border-radius: 5px; background: var(--yy-surface-2); width: 38%; animation: shimmer 1.4s ease-in-out infinite; }
.sk-lines i + i { width: 72%; }
@keyframes shimmer { 50% { opacity: 0.5; } }

@media (max-width: 960px) {
  .side-fixed { display: none; }
  .mobile-bar {
    position: sticky; top: 0; z-index: 10;
    display: flex; align-items: center; gap: 8px;
    padding: 10px 12px; font-size: 16px;
    background: color-mix(in srgb, var(--yy-bg) 88%, transparent);
    backdrop-filter: blur(10px);
    border-bottom: 1px solid var(--yy-border);
  }
  .bar-btn { width: 36px; height: 36px; display: grid; place-items: center; border: none; background: transparent; border-radius: 8px; color: var(--yy-text-2); font-size: 18px; cursor: pointer; }
  .bar-btn:hover { background: var(--yy-hover); }
  .compose-btn { margin-left: auto; color: var(--yy-accent); }
  .container { padding: 24px 16px 48px; }
  .page-head h1 { font-size: 28px; }
}
@media (max-width: 560px) {
  .mark-read { margin-left: 0; }
  .filters :deep(.pill), .filters :deep(.pill-account) { width: calc(50% - 3px); }
  .seg { width: 100%; justify-content: space-between; }
  .seg button { flex: 1; }
}
</style>
<style>
.side-drawer .arco-drawer-body { padding: 0; }
</style>
