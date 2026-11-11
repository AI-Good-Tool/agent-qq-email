<script setup lang="ts">
import { ref } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { LabelDef } from '@/api/types';
import { loadDashboard, selectLabel, state } from '@/stores/mailbox';
import LabelFormModal from './LabelFormModal.vue';

const formRef = ref<InstanceType<typeof LabelFormModal>>();
const deleting = ref('');

const mailboxes = (name: string) => state.accounts.filter((a) => a.labels.includes(name));

async function remove(label: LabelDef) {
  deleting.value = label.name;
  try {
    await api.deleteLabel(label.name);
    if (state.label === label.name) state.label = 'all';
    Message.success(`已删除标签「${label.name}」。`);
    await loadDashboard();
  } catch (error) {
    Message.error(error instanceof Error ? error.message : '删除失败。');
  } finally {
    deleting.value = '';
  }
}

defineExpose({ create: () => formRef.value?.open() });
</script>

<template>
  <div class="panel">
    <div class="bar">
      <span class="muted">标签用于给邮箱分组，点击左侧标签即可查看该组邮箱的邮件。</span>
      <a-button type="primary" size="small" @click="formRef?.open()"><template #icon><icon-plus /></template>新建标签</a-button>
    </div>
    <div v-if="state.labels.length" class="list">
      <div v-for="label in state.labels" :key="label.name" class="row">
        <i class="swatch" :style="{ background: label.color }" />
        <div class="main">
          <strong class="ellipsis">{{ label.name }}</strong>
          <div class="boxes">
            <span v-for="a in mailboxes(label.name)" :key="a.id" class="box"><i :style="{ background: a.color }" />{{ a.email }}</span>
            <span v-if="!mailboxes(label.name).length" class="muted small">还没有邮箱使用这个标签</span>
          </div>
        </div>
        <div class="ops">
          <a-button type="text" size="mini" :disabled="!label.aliasCount" @click="selectLabel(label.name)">查看邮件</a-button>
          <a-button type="text" size="mini" @click="formRef?.open(label)">编辑</a-button>
          <a-popconfirm :content="`删除标签「${label.name}」？邮箱本身不受影响。`" type="warning" ok-text="删除" @ok="remove(label)">
            <a-button type="text" size="mini" status="danger" :loading="deleting === label.name">删除</a-button>
          </a-popconfirm>
        </div>
      </div>
    </div>
    <div v-else class="empty">
      <icon-tags class="empty-icon" />
      <p class="serif">还没有标签</p>
      <span class="muted">例如按「工作」「个人」「订阅」给邮箱分组，之后可以一键查看某一组的邮件。</span>
      <a-button type="primary" @click="formRef?.open()"><template #icon><icon-plus /></template>新建标签</a-button>
    </div>
    <LabelFormModal ref="formRef" />
  </div>
</template>

<style scoped>
.bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--yy-border); font-size: 13px; }
.row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-bottom: 1px solid var(--yy-border); }
.row:last-child { border-bottom: none; }
.swatch { width: 14px; height: 14px; border-radius: 4px; flex: none; }
.main { flex: 1; min-width: 0; display: grid; gap: 6px; }
.main strong { font-size: 14.5px; font-weight: 600; }
.boxes { display: flex; flex-wrap: wrap; gap: 6px; }
.box { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--yy-text-3); padding: 1px 8px; border-radius: 6px; background: var(--yy-surface-2); border: 1px solid var(--yy-border); }
.box i { width: 6px; height: 6px; border-radius: 50%; }
.small { font-size: 12px; }
.ops { display: flex; flex: none; }
.empty { display: grid; justify-items: center; gap: 8px; padding: 64px 16px; text-align: center; }
.empty-icon { font-size: 32px; color: var(--yy-text-4); }
.empty p { margin: 4px 0 0; font-size: 20px; }
.empty span { max-width: 360px; margin-bottom: 8px; }
@media (max-width: 640px) {
  .bar { flex-direction: column; align-items: flex-start; }
  .row { flex-wrap: wrap; }
  .ops { width: 100%; justify-content: flex-end; }
}
</style>
