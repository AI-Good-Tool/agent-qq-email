<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { MailItem } from '@/api/types';
import { accountMap, state, toggleStar } from '@/stores/mailbox';
import { colorFor, formatFullTime, formatListTime, initial } from '@/utils/format';
import LabelChip from './LabelChip.vue';

const props = defineProps<{ items: MailItem[]; activeId?: string }>();
const emit = defineEmits<{
  (e: 'open', mail: MailItem): void;
  (e: 'reply', mail: MailItem): void;
  (e: 'trash', mail: MailItem): void;
}>();

const PAGE_SIZE = 25;
const page = ref(1);
watch(() => [props.items.length, state.view, state.account, state.search, state.label, state.status], () => { page.value = 1; });
const visible = computed(() => props.items.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE));
const showAccount = computed(() => state.account === 'all');
const isSent = computed(() => state.folder === 'sent');

function who(mail: MailItem) {
  if (!isSent.value) return mail.sender;
  const first = mail.recipients?.[0];
  return first ? `至 ${first.name || first.email}${mail.recipients.length > 1 ? ` 等 ${mail.recipients.length} 人` : ''}` : mail.sender;
}
</script>

<template>
  <div class="list" :class="{ loading: state.loading && state.loaded }">
    <article
      v-for="mail in visible"
      :key="mail.id"
      class="row"
      :class="{ unread: !mail.isRead, active: activeId === mail.id }"
      tabindex="0"
      @click="emit('open', mail)"
      @keydown.enter="emit('open', mail)"
    >
      <span class="dot" aria-hidden="true" />
      <span class="avatar" :style="{ background: colorFor(mail.senderAddress || mail.sender) }">{{ initial(who(mail).replace(/^至 /, '')) }}</span>
      <div class="main">
        <div class="line1">
          <span class="who ellipsis">{{ who(mail) }}</span>
          <span v-if="showAccount && accountMap.get(mail.accountId)" class="acct ellipsis">
            <i :style="{ background: accountMap.get(mail.accountId)!.color }" />{{ accountMap.get(mail.accountId)!.email }}
          </span>
          <span v-if="accountMap.get(mail.accountId)?.labels.length" class="tags">
            <LabelChip v-for="name in accountMap.get(mail.accountId)!.labels.slice(0, 2)" :key="name" :name="name" size="mini" />
          </span>
          <icon-attachment v-if="mail.hasAttachments" class="clip" />
          <time :title="formatFullTime(mail.receivedAt)">{{ formatListTime(mail.receivedAt) }}</time>
        </div>
        <div class="line2 ellipsis">
          <span class="subject">{{ mail.subject }}</span>
          <span v-if="mail.preview" class="preview"> — {{ mail.preview }}</span>
        </div>
      </div>
      <div class="actions" @click.stop>
        <a-tooltip :content="mail.isStarred ? '取消星标' : '添加星标'" mini>
          <button type="button" class="act" :class="{ starred: mail.isStarred }" :aria-label="mail.isStarred ? '取消星标' : '添加星标'" @click="toggleStar(mail)">
            <icon-star-fill v-if="mail.isStarred" /><icon-star v-else />
          </button>
        </a-tooltip>
        <a-tooltip v-if="state.folder !== 'trash'" content="回复" mini>
          <button type="button" class="act hover-only" aria-label="回复" @click="emit('reply', mail)"><icon-reply /></button>
        </a-tooltip>
        <a-tooltip :content="state.folder === 'trash' ? '永久删除' : '删除'" mini>
          <button type="button" class="act hover-only danger" aria-label="删除" @click="emit('trash', mail)"><icon-delete /></button>
        </a-tooltip>
      </div>
    </article>

    <div v-if="items.length > PAGE_SIZE" class="pager">
      <span class="muted">第 {{ (page - 1) * PAGE_SIZE + 1 }}–{{ Math.min(page * PAGE_SIZE, items.length) }} 封，共 {{ items.length }} 封</span>
      <a-pagination v-model:current="page" :total="items.length" :page-size="PAGE_SIZE" size="small" simple />
    </div>
  </div>
</template>

<style scoped>
.list { transition: opacity 0.15s ease; }
.list.loading { opacity: 0.55; }
.row {
  position: relative;
  display: flex; align-items: center; gap: 12px;
  padding: 12px 14px 12px 18px;
  border-bottom: 1px solid var(--yy-border);
  cursor: pointer;
  outline: none;
  transition: background 0.12s ease;
}
.row:last-of-type { border-bottom: none; }
.row:hover, .row:focus-visible { background: var(--yy-hover); }
.row.active { background: var(--yy-accent-soft); }
.dot { position: absolute; left: 6px; top: 50%; width: 6px; height: 6px; margin-top: -3px; border-radius: 50%; background: transparent; }
.row.unread .dot { background: var(--yy-accent); }
.avatar {
  flex: none; width: 34px; height: 34px; border-radius: 50%;
  display: grid; place-items: center;
  color: #fff; font-size: 13.5px; font-weight: 600;
}
.main { flex: 1; min-width: 0; display: grid; gap: 2px; }
.line1 { display: flex; align-items: center; gap: 8px; min-width: 0; }
.who { font-size: 14px; color: var(--yy-text-2); }
.row.unread .who { color: var(--yy-text); font-weight: 650; }
.acct {
  flex: 0 1 auto; display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; color: var(--yy-text-3);
  padding: 0 7px; border-radius: 6px; background: var(--yy-surface-2); border: 1px solid var(--yy-border);
  max-width: 220px;
}
.acct i { width: 6px; height: 6px; border-radius: 50%; flex: none; }
.clip { color: var(--yy-text-4); flex: none; }
.tags { display: inline-flex; gap: 4px; flex: none; }
time { margin-left: auto; flex: none; font-size: 12px; color: var(--yy-text-4); font-variant-numeric: tabular-nums; }
.row.unread time { color: var(--yy-accent-text); font-weight: 600; }
.line2 { font-size: 13.5px; color: var(--yy-text-3); }
.subject { color: var(--yy-text-2); }
.row.unread .subject { color: var(--yy-text); font-weight: 600; }
.actions { display: flex; align-items: center; gap: 2px; flex: none; }
.act {
  width: 30px; height: 30px; display: grid; place-items: center;
  border: none; border-radius: 7px; background: transparent;
  color: var(--yy-text-4); cursor: pointer; font-size: 15px;
}
.act:hover { background: var(--yy-active); color: var(--yy-text); }
.act.starred { color: #d4a13b; }
.act.danger:hover { color: var(--yy-danger); }
.hover-only { display: none; }
.row:hover .hover-only, .row:focus-within .hover-only { display: grid; }
.pager { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-top: 1px solid var(--yy-border); font-size: 12.5px; }
@media (max-width: 720px) {
  .row { padding: 12px 10px 12px 16px; gap: 10px; }
  .acct, .tags { display: none; }
  .hover-only { display: none !important; }
}
</style>
