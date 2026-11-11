<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { ConfirmationData } from '@/api/types';
import { loadDashboard, senderOptions, state } from '@/stores/mailbox';

type Options = { action?: 'send' | 'reply'; workspace?: string; to?: string; subject?: string; messageId?: string };

const form = reactive({
  visible: false,
  action: 'send' as 'send' | 'reply',
  workspace: '',
  to: '',
  subject: '',
  body: '',
  messageId: '',
  sending: false,
  error: '',
  confirmationToken: '',
  summary: null as ConfirmationData['summary'] | null,
});

const summary = computed(() => (typeof form.summary === 'object' && form.summary ? form.summary : null));

function open(options: Options = {}) {
  Object.assign(form, {
    visible: true,
    action: options.action || 'send',
    workspace: options.workspace || senderOptions.value[0]?.value || '',
    to: options.to || '',
    subject: options.subject || '',
    body: '',
    messageId: options.messageId || '',
    sending: false,
    error: '',
    confirmationToken: '',
    summary: null,
  });
}

async function submit(confirm = false) {
  if (!form.workspace) { form.error = '请选择发件邮箱。'; return; }
  if (form.action === 'send' && (!form.to.trim() || !form.subject.trim())) { form.error = '请填写收件人和主题。'; return; }
  if (!form.body.trim()) { form.error = '邮件正文不能为空。'; return; }
  form.sending = true;
  form.error = '';
  try {
    const result = await api.mailAction({
      action: form.action,
      workspace: form.workspace,
      to: form.to,
      subject: form.subject,
      body: form.body,
      messageId: form.messageId || undefined,
      confirmationToken: confirm ? form.confirmationToken : undefined,
    });
    if (result.data?.confirmation_required) {
      form.confirmationToken = result.data.confirmation_token || '';
      form.summary = result.data.summary || null;
      return;
    }
    Message.success(form.action === 'reply' ? '回复已进入发送队列。' : '邮件已进入发送队列。');
    form.visible = false;
    if (state.folder === 'sent') void loadDashboard('sent');
  } catch (error) {
    form.error = error instanceof Error ? error.message : '邮件操作失败。';
  } finally {
    form.sending = false;
  }
}

defineExpose({ open });
</script>

<template>
  <a-modal v-model:visible="form.visible" :title="form.action === 'reply' ? '回复邮件' : '写邮件'" :footer="false" :width="600" title-align="start" :mask-closable="false" unmount-on-close>
    <template v-if="form.confirmationToken">
      <div class="confirm">
        <p class="muted">Agent Mail 官方服务要求再次确认，请核对后发送：</p>
        <dl>
          <dt>发件邮箱</dt><dd>{{ summary?.from || senderOptions.find((o) => o.value === form.workspace)?.label || '当前邮箱' }}</dd>
          <dt>收件人</dt><dd>{{ summary?.to?.join('、') || form.to || '原邮件发件人' }}</dd>
          <dt>主题</dt><dd>{{ summary?.subject || form.subject }}</dd>
        </dl>
        <div v-if="form.error" class="yy-error">{{ form.error }}</div>
        <div class="actions">
          <a-button @click="form.confirmationToken = ''">返回修改</a-button>
          <a-button type="primary" :loading="form.sending" @click="submit(true)"><template #icon><icon-send /></template>确认发送</a-button>
        </div>
      </div>
    </template>
    <template v-else>
      <!-- 下拉框不能放在 <label> 里：点击会被转发给内部输入框，下拉刚打开就被关掉 -->
      <div class="yy-field">
        <span>发件邮箱</span>
        <a-select v-model="form.workspace" :options="senderOptions" placeholder="选择发件邮箱" />
      </div>
      <template v-if="form.action === 'send'">
        <label class="yy-field">
          <span>收件人</span>
          <a-input v-model="form.to" placeholder="多个地址用逗号分隔" allow-clear />
        </label>
        <label class="yy-field">
          <span>主题</span>
          <a-input v-model="form.subject" placeholder="邮件主题" allow-clear />
        </label>
      </template>
      <p v-else class="reply-to muted">回复：{{ form.subject }}<template v-if="form.to"> · {{ form.to }}</template></p>
      <label class="yy-field">
        <span>正文</span>
        <a-textarea v-model="form.body" :auto-size="{ minRows: 8, maxRows: 16 }" placeholder="写点什么…" class="body-input" />
      </label>
      <div v-if="form.error" class="yy-error">{{ form.error }}</div>
      <div class="actions">
        <span class="muted hint">以纯文本发送</span>
        <a-button @click="form.visible = false">取消</a-button>
        <a-button type="primary" :loading="form.sending" @click="submit(false)"><template #icon><icon-send /></template>检查并发送</a-button>
      </div>
    </template>
  </a-modal>
</template>

<style scoped>
.actions { display: flex; align-items: center; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.hint { margin-right: auto; font-size: 12px; }
.reply-to { margin: -4px 0 14px; font-size: 13px; }
.body-input :deep(textarea) { font-family: var(--yy-serif); font-size: 15px; line-height: 1.7; }
.confirm dl { display: grid; grid-template-columns: 76px 1fr; gap: 8px 12px; margin: 14px 0 18px; padding: 14px 16px; border-radius: 12px; background: var(--yy-surface-2); border: 1px solid var(--yy-border); }
.confirm dt { color: var(--yy-text-3); }
.confirm dd { margin: 0; word-break: break-all; }
</style>
