<script setup lang="ts">
import { computed } from 'vue';
import type { Account, View } from '@/api/types';
import { auth, logout } from '@/stores/auth';
import { changeAccount, changeView, isMailView, resetMailbox, selectLabel, state, stats } from '@/stores/mailbox';
import { themeMode, type ThemeMode } from '@/stores/theme';
import { initial, statusMeta } from '@/utils/format';
import BrandMark from './BrandMark.vue';
import LabelChip from './LabelChip.vue';

const emit = defineEmits<{
  (e: 'compose'): void;
  (e: 'add-account'): void;
  (e: 'manage'): void;
  (e: 'create-label'): void;
  (e: 'edit-labels', account: Account): void;
  (e: 'navigate'): void;
}>();

const nav = computed(() => [
  { key: 'inbox' as View, label: '收件箱', icon: 'icon-email', count: stats.value.inboxUnread },
  { key: 'starred' as View, label: '星标邮件', icon: 'icon-star', count: 0 },
  { key: 'sent' as View, label: '已发送', icon: 'icon-send', count: 0 },
  { key: 'trash' as View, label: '垃圾箱', icon: 'icon-delete', count: 0 },
  { key: 'contacts' as View, label: '联系人', icon: 'icon-user-group', count: 0 },
]);
const manageNav = computed(() => [
  { key: 'labels' as View, label: '标签管理', icon: 'icon-tags', count: state.labels.length },
  { key: 'accounts' as View, label: '账号管理', icon: 'icon-settings', count: 0 },
]);

const themeOptions: { value: ThemeMode; label: string }[] = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
];

function go(view: View) {
  void changeView(view);
  emit('navigate');
}
function pickLabel(name: string) {
  void selectLabel(name);
  emit('navigate');
}
function pickAccount(id: string) {
  void changeAccount(id);
  emit('navigate');
}
function onUserMenu(value: unknown) {
  if (value === 'manage') go('accounts');
  if (value === 'logout') { resetMailbox(); logout(); }
  if (value === 'light' || value === 'dark' || value === 'system') themeMode.value = value;
}
</script>

<template>
  <aside class="sidebar">
    <div class="brand">
      <BrandMark :size="26" />
      <span class="serif">云邮盒</span>
    </div>

    <button type="button" class="compose" :disabled="!state.accounts.length" @click="emit('compose')">
      <span class="compose-icon"><icon-plus /></span>
      写邮件
    </button>

    <nav class="nav">
      <button
        v-for="item in nav"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ active: state.view === item.key }"
        @click="go(item.key)"
      >
        <component :is="item.icon" class="nav-icon" />
        <span class="ellipsis">{{ item.label }}</span>
        <span v-if="item.count" class="count">{{ item.count > 99 ? '99+' : item.count }}</span>
      </button>
      <div class="nav-divider" />
      <button
        v-for="item in manageNav"
        :key="item.key"
        type="button"
        class="nav-item"
        :class="{ active: state.view === item.key }"
        @click="go(item.key)"
      >
        <component :is="item.icon" class="nav-icon" />
        <span class="ellipsis">{{ item.label }}</span>
        <span v-if="item.count" class="count subtle">{{ item.count }}</span>
      </button>
    </nav>

    <div class="scroll">
    <div class="section-head">
      <span>标签</span>
      <a-tooltip content="新建标签" mini>
        <button type="button" class="icon-btn" aria-label="新建标签" @click="emit('create-label'); emit('navigate')"><icon-plus /></button>
      </a-tooltip>
    </div>
    <div class="labels">
      <button
        v-for="label in state.labels"
        :key="label.name"
        type="button"
        class="label-item"
        :class="{ active: state.label === label.name && isMailView(state.view) }"
        :title="state.label === label.name ? '再次点击取消筛选' : `查看「${label.name}」标签下的邮件`"
        @click="pickLabel(label.name)"
      >
        <i class="label-dot" :style="{ background: label.color }" />
        <span class="ellipsis">{{ label.name }}</span>
        <span class="label-count">{{ label.aliasCount }}</span>
      </button>
      <p v-if="!state.labels.length" class="labels-empty">还没有标签，点击 + 新建，用来给邮箱分组。</p>
    </div>

    <div class="section-head">
      <span>邮箱</span>
      <a-tooltip content="管理邮箱账号" mini>
        <button type="button" class="icon-btn" aria-label="管理邮箱账号" @click="go('accounts')"><icon-settings /></button>
      </a-tooltip>
    </div>

    <div class="accounts">
      <button
        type="button"
        class="account"
        :class="{ active: state.account === 'all' }"
        @click="pickAccount('all')"
      >
        <span class="avatar all"><icon-apps /></span>
        <span class="account-main">
          <span class="ellipsis">全部邮箱</span>
          <small>加载较慢</small>
        </span>
      </button>
      <div v-for="account in state.accounts" :key="account.id" class="account-row">
        <button
          type="button"
          class="account"
          :class="{ active: state.account === account.id, dim: account.status === 'expired' }"
          :title="account.statusMessage ? `${account.email}\n${account.statusMessage}` : account.email"
          @click="pickAccount(account.id)"
        >
          <span class="avatar" :style="{ background: account.color }">
            {{ initial(account.name || account.email) }}
            <i v-if="account.status !== 'online'" class="status-dot" :class="account.status" />
          </span>
          <span class="account-main">
            <span class="ellipsis">{{ account.email }}</span>
            <small v-if="account.status !== 'online' || account.labels.length" class="account-tags">
              <b v-if="account.status !== 'online'" :class="account.status">{{ statusMeta[account.status].text }}</b>
              <LabelChip v-for="name in account.labels.slice(0, 2)" :key="name" :name="name" size="mini" />
              <em v-if="account.labels.length > 2">+{{ account.labels.length - 2 }}</em>
            </small>
          </span>
          <span v-if="account.unread" class="count">{{ account.unread > 99 ? '99+' : account.unread }}</span>
        </button>
        <a-tooltip content="设置标签" mini>
          <button type="button" class="icon-btn label-btn" :aria-label="`设置 ${account.email} 的标签`" @click="emit('edit-labels', account)"><icon-tags /></button>
        </a-tooltip>
      </div>
      <button type="button" class="account add" @click="emit('add-account')">
        <span class="avatar ghost"><icon-plus /></span>
        <span class="account-main"><span>扫码添加微信</span></span>
      </button>
    </div>
    </div>

    <a-dropdown trigger="click" position="tl" @select="onUserMenu">
      <button type="button" class="user">
        <span class="user-avatar">{{ initial(auth.username || 'A') }}</span>
        <span class="account-main">
          <span class="ellipsis">{{ auth.username || 'admin' }}</span>
          <small>控制台管理员</small>
        </span>
        <icon-more-vertical class="muted" />
      </button>
      <template #content>
        <a-dsubmenu value="theme" trigger="hover">
          <template #icon><icon-moon /></template>
          外观
          <template #content>
            <a-doption v-for="opt in themeOptions" :key="opt.value" :value="opt.value">
              <template #icon><icon-check v-if="themeMode === opt.value" /><span v-else class="icon-spacer" /></template>
              {{ opt.label }}
            </a-doption>
          </template>
        </a-dsubmenu>
        <a-doption value="manage"><template #icon><icon-settings /></template>管理邮箱账号</a-doption>
        <a-divider :margin="4" />
        <a-doption value="logout"><template #icon><icon-export /></template>退出登录</a-doption>
      </template>
    </a-dropdown>
  </aside>
</template>

<style scoped>
.sidebar {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 14px 10px 10px;
  background: var(--yy-sidebar);
  border-right: 1px solid var(--yy-border);
  overflow: hidden;
}
.brand { display: flex; align-items: center; gap: 10px; padding: 4px 8px 16px; font-size: 18px; }
.compose {
  display: flex; align-items: center; gap: 10px;
  margin: 0 0 10px; padding: 8px 10px;
  border: none; border-radius: 10px; background: transparent;
  color: var(--yy-text); font-weight: 600; cursor: pointer; text-align: left;
}
.compose:hover:not(:disabled) { background: var(--yy-hover); }
.compose:disabled { opacity: 0.5; cursor: not-allowed; }
.compose-icon {
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  background: var(--yy-accent); color: #fff; font-size: 14px;
  box-shadow: 0 1px 3px rgba(120, 50, 25, 0.25);
}
.nav { display: grid; gap: 1px; }
.nav-item, .account, .user {
  width: 100%;
  display: flex; align-items: center; gap: 10px;
  padding: 7px 10px; min-height: 36px;
  border: none; border-radius: 8px; background: transparent;
  color: var(--yy-text-2); cursor: pointer; text-align: left;
  transition: background 0.12s ease;
}
.nav-item:hover, .account:hover, .user:hover { background: var(--yy-hover); color: var(--yy-text); }
.nav-item.active, .account.active { background: var(--yy-active); color: var(--yy-text); font-weight: 600; }
.nav-icon { font-size: 16px; flex: none; color: var(--yy-text-3); }
.nav-item.active .nav-icon { color: var(--yy-accent); }
.count {
  margin-left: auto; flex: none;
  font-size: 11.5px; font-weight: 600; line-height: 18px;
  padding: 0 7px; border-radius: 9px;
  color: var(--yy-accent-text); background: var(--yy-accent-soft);
}
.section-head {
  display: flex; align-items: center; justify-content: space-between;
  margin: 14px 0 4px; padding: 0 6px 0 10px;
  font-size: 12px; font-weight: 600; color: var(--yy-text-4); letter-spacing: 0.02em;
}
.icon-btn {
  width: 26px; height: 26px; flex: none;
  display: grid; place-items: center;
  border: none; border-radius: 6px; background: transparent;
  color: var(--yy-text-3); cursor: pointer;
}
.icon-btn:hover { background: var(--yy-active); color: var(--yy-text); }
.scroll { flex: 1; min-height: 0; overflow-y: auto; margin: 0 -4px; padding: 0 4px; }
.accounts { display: grid; align-content: start; gap: 1px; }
.nav-divider { height: 1px; background: var(--yy-border); margin: 6px 10px; }
.count.subtle { color: var(--yy-text-3); background: var(--yy-active); }
.labels { display: grid; gap: 1px; }
.label-item {
  width: 100%; display: flex; align-items: center; gap: 10px;
  padding: 5px 10px; min-height: 32px; border: none; border-radius: 8px; background: transparent;
  color: var(--yy-text-2); cursor: pointer; text-align: left; font-size: 13px;
}
.label-item:hover { background: var(--yy-hover); color: var(--yy-text); }
.label-item.active { background: var(--yy-active); color: var(--yy-text); font-weight: 600; }
.label-dot { width: 10px; height: 10px; border-radius: 3px; flex: none; margin: 0 8px 0 8px; }
.label-count { margin-left: auto; font-size: 11.5px; color: var(--yy-text-4); }
.labels-empty { margin: 2px 10px 4px; font-size: 12px; color: var(--yy-text-4); line-height: 1.5; }
.account-tags { display: flex; align-items: center; gap: 4px; margin-top: 2px; overflow: hidden; }
.account-tags em { font-style: normal; font-size: 11px; color: var(--yy-text-4); }
.account-row { position: relative; }
.account-row .account { padding-right: 34px; }
.account-row .count { margin-right: 0; }
.label-btn { position: absolute; right: 4px; top: 50%; transform: translateY(-50%); opacity: 0; }
.account-row:hover .label-btn, .label-btn:focus-visible { opacity: 1; }
.account-row:hover .count { visibility: hidden; }
.account.dim .avatar { opacity: 0.55; }
.avatar, .user-avatar {
  position: relative; flex: none;
  width: 26px; height: 26px; border-radius: 50%;
  display: grid; place-items: center;
  color: #fff; font-size: 12px; font-weight: 600;
}
.avatar.all { background: var(--yy-surface); color: var(--yy-text-3); border: 1px solid var(--yy-border-strong); }
.avatar.ghost { background: transparent; color: var(--yy-text-3); border: 1px dashed var(--yy-border-strong); }
.status-dot { position: absolute; right: -2px; bottom: -2px; width: 10px; height: 10px; border-radius: 50%; border: 2px solid var(--yy-sidebar); }
.status-dot.expired { background: var(--yy-danger); }
.status-dot.error { background: var(--yy-warning); }
.account-main { display: grid; min-width: 0; line-height: 1.3; font-size: 13px; }
.account-main small { font-size: 11.5px; color: var(--yy-text-4); font-weight: 400; }
.account-main small b { font-weight: 600; margin-right: 4px; }
.account-main small b.expired { color: var(--yy-danger); }
.account-main small b.error { color: var(--yy-warning); }
.account.add { color: var(--yy-text-3); }
.user { margin-top: 8px; border-top: 1px solid var(--yy-border); border-radius: 0 0 8px 8px; padding-top: 12px; min-height: 52px; }
.user-avatar { width: 30px; height: 30px; background: var(--yy-text); color: var(--yy-bg); font-size: 13px; }
.icon-spacer { display: inline-block; width: 14px; }
</style>
