<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { api } from '@/api/client';
import type { MailDetail, MailItem } from '@/api/types';
import { accountMap, markRead, state, toggleStar } from '@/stores/mailbox';
import { addressList, addressText, colorFor, fileSize, formatFullTime, initial } from '@/utils/format';
import LabelChip from './LabelChip.vue';
import MailBody from './MailBody.vue';

const visible = defineModel<boolean>('visible', { required: true });
const props = defineProps<{ mail: MailItem | null }>();
const emit = defineEmits<{ (e: 'reply', detail: MailDetail): void; (e: 'trash', mail: MailItem): void }>();

const loading = ref(false);
const error = ref('');
const detail = ref<MailDetail | null>(null);
const width = computed(() => (window.innerWidth < 820 ? '100%' : 760));
const account = computed(() => (props.mail ? accountMap.value.get(props.mail.accountId) : undefined));
const removed = computed(() => account.value?.status === 'removed');
let seq = 0;

async function load(mail: MailItem) {
  const current = ++seq;
  loading.value = true;
  error.value = '';
  detail.value = null;
  try {
    const data = await api.message(mail.messageId, mail.workspace);
    if (current !== seq) return;
    detail.value = data;
    markRead(mail);
  } catch (err) {
    if (current === seq) error.value = err instanceof Error ? err.message : '无法读取邮件详情。';
  } finally {
    if (current === seq) loading.value = false;
  }
}

watch(() => [visible.value, props.mail?.id], () => {
  if (visible.value && props.mail) void load(props.mail);
}, { immediate: true });
</script>

<template>
  <a-drawer v-model:visible="visible" :width="width" :footer="false" :header="false" unmount-on-close class="detail-drawer">
    <div v-if="mail" class="detail">
      <div class="toolbar">
        <button type="button" class="tb-btn" aria-label="关闭" @click="visible = false"><icon-close /></button>
        <span class="spacer" />
        <a-tooltip :content="mail.isStarred ? '取消星标' : '添加星标'" mini>
          <button type="button" class="tb-btn" :class="{ starred: mail.isStarred }" @click="toggleStar(mail)">
            <icon-star-fill v-if="mail.isStarred" /><icon-star v-else />
          </button>
        </a-tooltip>
        <a-tooltip :content="state.folder === 'trash' ? '永久删除' : '删除'" mini>
          <button type="button" class="tb-btn danger" :disabled="removed" @click="emit('trash', mail)"><icon-delete /></button>
        </a-tooltip>
        <a-button v-if="state.folder !== 'trash'" type="primary" size="small" :disabled="!detail" @click="detail && emit('reply', detail)">
          <template #icon><icon-reply /></template>回复
        </a-button>
      </div>

      <h1 class="serif subject">{{ detail?.subject || mail.subject }}</h1>

      <div class="meta">
        <span class="avatar" :style="{ background: colorFor(mail.senderAddress || mail.sender) }">{{ initial(detail?.from?.name || mail.sender) }}</span>
        <div class="meta-main">
          <div class="from"><strong>{{ detail?.from?.name || mail.sender }}</strong><span class="muted">&lt;{{ detail?.from?.email || mail.senderAddress }}&gt;</span></div>
          <div class="muted small">收件人：{{ detail ? addressList(detail.to) : addressList(mail.recipients) }}</div>
          <div v-if="detail?.cc?.length" class="muted small">抄送：{{ addressList(detail.cc) }}</div>
        </div>
        <time class="muted small">{{ formatFullTime(detail?.created_at || mail.receivedAt) }}</time>
      </div>
      <div v-if="account" class="via">
        <i :style="{ background: account.color }" />通过 {{ account.email }}
        <LabelChip v-for="name in account.labels" :key="name" :name="name" size="mini" />
        <a-tag v-if="detail?.body_format" size="small" bordered>{{ detail.body_format.toUpperCase() === 'HTML' ? 'HTML 邮件' : '纯文本' }}</a-tag>
      </div>

      <div class="content">
        <div v-if="loading" class="state"><a-spin :size="22" /><span>正在读取邮件内容…</span></div>
        <div v-else-if="error" class="state">
          <icon-exclamation-circle class="state-icon" />
          <strong>无法打开邮件</strong>
          <span class="muted">{{ error }}</span>
          <span v-if="removed" class="muted">该邮箱已删除，仅保留列表摘要：{{ mail.preview }}</span>
          <a-button v-else size="small" @click="load(mail)">重试</a-button>
        </div>
        <template v-else-if="detail">
          <MailBody :body="detail.body" :format="detail.body_format" />
          <section v-if="detail.attachments?.length" class="attachments">
            <h3>附件 · {{ detail.attachments.length }}</h3>
            <div v-for="(file, index) in detail.attachments" :key="file.attachment_id || `${file.filename}-${index}`" class="file">
              <icon-file />
              <span class="ellipsis">{{ file.filename }}</span>
              <small class="muted">{{ [file.content_type, fileSize(file.size)].filter(Boolean).join(' · ') }}</small>
            </div>
          </section>
          <p class="addr-note muted small">发件地址：{{ addressText(detail.from) }}</p>
        </template>
      </div>
    </div>
  </a-drawer>
</template>

<style scoped>
.detail { max-width: 680px; margin: 0 auto; padding: 4px 4px 40px; }
.toolbar { position: sticky; top: -12px; z-index: 2; display: flex; align-items: center; gap: 4px; padding: 6px 0 10px; background: var(--color-bg-3); }
.spacer { flex: 1; }
.tb-btn {
  width: 32px; height: 32px; display: grid; place-items: center;
  border: none; border-radius: 8px; background: transparent;
  color: var(--yy-text-3); cursor: pointer; font-size: 16px;
}
.tb-btn:hover:not(:disabled) { background: var(--yy-hover); color: var(--yy-text); }
.tb-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tb-btn.starred { color: #d4a13b; }
.tb-btn.danger:hover:not(:disabled) { color: var(--yy-danger); }
.toolbar .arco-btn { margin-left: 6px; border-radius: 8px; }
.subject { font-size: 26px; line-height: 1.3; margin: 10px 0 20px; color: var(--yy-text); }
.meta { display: flex; gap: 12px; align-items: flex-start; }
.avatar { flex: none; width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 600; }
.meta-main { flex: 1; min-width: 0; display: grid; gap: 2px; }
.from { display: flex; flex-wrap: wrap; gap: 6px; align-items: baseline; }
.from strong { font-weight: 600; }
.small { font-size: 12.5px; }
.meta time { flex: none; white-space: nowrap; }
.via { display: flex; align-items: center; gap: 6px; margin: 14px 0 0; font-size: 12.5px; color: var(--yy-text-3); }
.via i { width: 7px; height: 7px; border-radius: 50%; }
.via .arco-tag { margin-left: 4px; }
.content { margin-top: 22px; padding-top: 22px; border-top: 1px solid var(--yy-border); }
.state { display: grid; justify-items: center; gap: 10px; padding: 64px 0; color: var(--yy-text-3); text-align: center; }
.state-icon { font-size: 30px; color: var(--yy-danger); }
.attachments { margin-top: 28px; }
.attachments h3 { font-size: 13px; font-weight: 600; color: var(--yy-text-3); margin: 0 0 10px; }
.file { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid var(--yy-border); border-radius: 10px; margin-bottom: 8px; background: var(--yy-surface-2); }
.file small { margin-left: auto; flex: none; }
.addr-note { margin-top: 28px; }
@media (max-width: 640px) {
  .subject { font-size: 22px; }
  .meta time { display: none; }
}
</style>
