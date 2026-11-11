<script setup lang="ts">
import { reactive } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { Account } from '@/api/types';
import { refreshLabels, state } from '@/stores/mailbox';

const form = reactive({ visible: false, account: null as Account | null, labels: [] as string[], input: '', saving: false, error: '' });

function open(account: Account) {
  Object.assign(form, { visible: true, account, labels: [...account.labels], input: '', saving: false, error: '' });
}

function toggle(name: string) {
  form.error = '';
  form.labels = form.labels.includes(name) ? form.labels.filter((l) => l !== name) : [...form.labels, name];
}

function addNew() {
  const name = form.input.trim();
  if (!name) return;
  if (name.length > 16) { form.error = '标签名称不能超过 16 个字符。'; return; }
  if (/[/\\,，]/.test(name)) { form.error = '标签名称不能包含斜杠或逗号。'; return; }
  if (!form.labels.includes(name)) form.labels.push(name);
  form.input = '';
}

const isNew = (name: string) => !state.labels.some((l) => l.name === name);

async function save() {
  if (!form.account) return false;
  addNew();
  if (form.labels.length > 8) { form.error = '每个邮箱最多设置 8 个标签。'; return false; }
  form.saving = true;
  form.error = '';
  try {
    const data = await api.labels(form.account.aliasId, form.account.workspace, form.labels);
    form.account.labels = data.labels || form.labels;
    await refreshLabels();
    Message.success('邮箱标签已保存。');
    form.visible = false;
  } catch (error) {
    form.error = error instanceof Error ? error.message : '标签保存失败。';
  } finally {
    form.saving = false;
  }
  return false;
}

defineExpose({ open });
</script>

<template>
  <a-modal v-model:visible="form.visible" title="邮箱标签" ok-text="保存" :ok-loading="form.saving" :on-before-ok="save" :width="480" title-align="start" unmount-on-close>
    <p class="muted target">{{ form.account?.email }}</p>
    <div v-if="state.labels.length || form.labels.length" class="chips">
      <button
        v-for="label in state.labels"
        :key="label.name"
        type="button"
        class="chip"
        :class="{ on: form.labels.includes(label.name) }"
        :style="{ '--c': label.color }"
        @click="toggle(label.name)"
      >
        <icon-check v-if="form.labels.includes(label.name)" /><i v-else />{{ label.name }}
      </button>
      <button v-for="name in form.labels.filter(isNew)" :key="name" type="button" class="chip on" :style="{ '--c': '#6b6a65' }" @click="toggle(name)">
        <icon-check />{{ name }}<small>新</small>
      </button>
    </div>
    <div class="new">
      <a-input v-model="form.input" :max-length="16" placeholder="输入新标签名称，回车添加" allow-clear @press-enter="addNew" @input="form.error = ''" />
      <a-button :disabled="!form.input.trim()" @click="addNew">添加</a-button>
    </div>
    <p class="yy-note">点击标签可选中或取消；每个邮箱最多 8 个标签。新标签会自动出现在左侧「标签」列表中。</p>
    <div v-if="form.error" class="yy-error">{{ form.error }}</div>
  </a-modal>
</template>

<style scoped>
.target { margin: -6px 0 14px; font-size: 13px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 14px; }
.chip {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 4px 11px; border-radius: 8px; cursor: pointer; font-size: 13px;
  border: 1px solid var(--yy-border-strong); background: var(--yy-surface); color: var(--yy-text-2);
}
.chip i { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
.chip:hover { border-color: var(--c); }
.chip.on { border-color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); color: color-mix(in srgb, var(--c) 80%, var(--yy-text)); font-weight: 600; }
.chip small { font-size: 10.5px; font-weight: 500; opacity: 0.75; }
.new { display: flex; gap: 8px; margin-bottom: 10px; }
</style>
