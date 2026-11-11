<script setup lang="ts">
import { reactive } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { MailItem } from '@/api/types';
import { loadDashboard, state } from '@/stores/mailbox';

const emit = defineEmits<{ (e: 'done', mail: MailItem): void }>();
const form = reactive({
  visible: false,
  mail: null as MailItem | null,
  mode: 'trash' as 'trash' | 'delete',
  deleting: false,
  error: '',
  confirmationToken: '',
  summary: null as unknown,
});

function open(mail: MailItem) {
  Object.assign(form, { visible: true, mail, mode: state.folder === 'trash' ? 'delete' : 'trash', deleting: false, error: '', confirmationToken: '', summary: null });
}

async function submit() {
  const mail = form.mail;
  if (!mail) return;
  form.deleting = true;
  form.error = '';
  try {
    const result = await api.mailAction({ action: form.mode, workspace: mail.workspace, messageId: mail.messageId, confirmationToken: form.confirmationToken || undefined });
    if (result.data?.confirmation_required) {
      form.confirmationToken = result.data.confirmation_token || '';
      form.summary = result.data.summary ?? null;
      return;
    }
    state.emails = state.emails.filter((item) => item.id !== mail.id);
    Message.success(form.mode === 'delete' ? '邮件已永久删除。' : '邮件已移入垃圾箱，将保留 30 天。');
    form.visible = false;
    emit('done', mail);
    void loadDashboard();
  } catch (error) {
    form.error = error instanceof Error ? error.message : '删除邮件失败。';
  } finally {
    form.deleting = false;
  }
}

const onOk = async () => { await submit(); return false; };

defineExpose({ open });
</script>

<template>
  <a-modal
    v-model:visible="form.visible"
    :title="form.mode === 'delete' ? '永久删除这封邮件？' : '删除这封邮件？'"
    :ok-text="form.confirmationToken ? '确认删除' : form.mode === 'delete' ? '永久删除' : '移入垃圾箱'"
    :ok-loading="form.deleting"
    :ok-button-props="{ status: 'danger' }"
    :mask-closable="!form.deleting"
    :width="480"
    title-align="start"
    unmount-on-close
    :on-before-ok="onOk"
  >
    <div class="mail-card">
      <strong class="ellipsis">{{ form.mail?.subject || '(无主题)' }}</strong>
      <span class="muted ellipsis">{{ form.mail?.sender }} · {{ form.mail?.senderAddress }}</span>
    </div>
    <p class="yy-note">
      {{ form.mode === 'delete' ? '邮件将从 Agent Mail 垃圾箱永久删除，无法恢复。' : '邮件将移入 Agent Mail 垃圾箱并保留 30 天，不会立即永久删除。' }}
    </p>
    <div v-if="form.confirmationToken" class="server-confirm">
      <b>官方服务要求再次确认</b>
      <pre v-if="form.summary">{{ typeof form.summary === 'string' ? form.summary : JSON.stringify(form.summary, null, 2) }}</pre>
    </div>
    <div v-if="form.error" class="yy-error">{{ form.error }}</div>
  </a-modal>
</template>

<style scoped>
.mail-card { display: grid; gap: 2px; padding: 12px 14px; border-radius: 12px; background: var(--yy-surface-2); border: 1px solid var(--yy-border); margin-bottom: 12px; }
.server-confirm { margin-top: 12px; padding: 10px 12px; border-radius: 10px; background: color-mix(in srgb, var(--yy-warning) 12%, transparent); font-size: 13px; }
.server-confirm pre { margin: 6px 0 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; }
</style>
