<script setup lang="ts">
import { computed, reactive } from 'vue';
import { Message } from '@arco-design/web-vue';
import { api } from '@/api/client';
import type { LabelDef } from '@/api/types';
import { loadDashboard, state } from '@/stores/mailbox';
import LabelChip from './LabelChip.vue';

const COLORS = ['#c96442', '#5a7ea8', '#7f8f4e', '#a8677f', '#c08a3e', '#4f8f88', '#8a6fb0', '#6b6a65'];
const form = reactive({
  visible: false,
  original: null as LabelDef | null,
  name: '',
  color: COLORS[0],
  selected: [] as string[],
  saving: false,
  error: '',
});
const isEdit = computed(() => Boolean(form.original));

function open(label?: LabelDef) {
  const used = state.labels.map((l) => l.color);
  Object.assign(form, {
    visible: true,
    original: label || null,
    name: label?.name || '',
    color: label?.color || COLORS.find((c) => !used.includes(c)) || COLORS[0],
    selected: label ? state.accounts.filter((a) => a.labels.includes(label.name)).map((a) => a.id) : [],
    saving: false,
    error: '',
  });
}

// 邮箱已有的其他标签（正在编辑的这个标签由勾选框表示）
const otherLabels = (labels: string[]) => labels.filter((name) => name !== form.original?.name);

function toggle(id: string) {
  form.selected = form.selected.includes(id) ? form.selected.filter((x) => x !== id) : [...form.selected, id];
}

async function save() {
  const name = form.name.trim();
  if (!name) { form.error = '请输入标签名称。'; return false; }
  if (name.length > 16) { form.error = '标签名称不能超过 16 个字符。'; return false; }
  form.saving = true;
  form.error = '';
  try {
    const aliases = state.accounts.filter((a) => form.selected.includes(a.id)).map((a) => ({ workspace: a.workspace, aliasId: a.aliasId }));
    if (form.original) {
      await api.updateLabel(form.original.name, { name: name !== form.original.name ? name : undefined, color: form.color, aliases });
      if (state.label === form.original.name) state.label = name;
    } else {
      await api.createLabel(name, form.color);
      if (aliases.length) await api.updateLabel(name, { aliases });
    }
    Message.success(isEdit.value ? '标签已更新。' : '标签已创建。');
    form.visible = false;
    await loadDashboard();
  } catch (error) {
    form.error = error instanceof Error ? error.message : '保存失败。';
  } finally {
    form.saving = false;
  }
  return false;
}

defineExpose({ open });
</script>

<template>
  <a-modal v-model:visible="form.visible" :title="isEdit ? '编辑标签' : '新建标签'" :ok-text="isEdit ? '保存' : '创建'" :ok-loading="form.saving"
    :on-before-ok="save" :width="520" title-align="start" unmount-on-close>
    <label class="yy-field">
      <span>名称</span>
      <a-input v-model="form.name" :max-length="16" show-word-limit placeholder="例如：工作、个人、订阅" @input="form.error = ''" />
    </label>
    <div class="yy-field">
      <span>颜色</span>
      <div class="swatches">
        <button v-for="c in COLORS" :key="c" type="button" class="swatch" :class="{ on: form.color === c }" :style="{ background: c }" :aria-label="c" @click="form.color = c">
          <icon-check v-if="form.color === c" />
        </button>
      </div>
    </div>
    <div class="yy-field">
      <span>应用到邮箱 <small class="muted">（已选 {{ form.selected.length }} 个 · 一个邮箱可以有多个标签，不影响已有标签）</small></span>
      <div v-if="state.accounts.length" class="boxes">
        <button v-for="a in state.accounts" :key="a.id" type="button" class="box" :class="{ on: form.selected.includes(a.id) }" @click="toggle(a.id)">
          <span class="check"><icon-check v-if="form.selected.includes(a.id)" /></span>
          <span class="avatar" :style="{ background: a.color }">{{ (a.name || a.email).slice(0, 1).toUpperCase() }}</span>
          <span class="ellipsis email">{{ a.email }}</span>
          <span class="tags">
            <LabelChip v-for="name in otherLabels(a.labels)" :key="name" :name="name" size="mini" />
          </span>
        </button>
      </div>
      <p v-else class="yy-note">还没有邮箱，可以先创建标签，添加邮箱后再分配。</p>
    </div>
    <div v-if="form.error" class="yy-error">{{ form.error }}</div>
  </a-modal>
</template>

<style scoped>
.swatches { display: flex; flex-wrap: wrap; gap: 8px; }
.swatch { width: 28px; height: 28px; border-radius: 8px; border: 2px solid transparent; color: #fff; display: grid; place-items: center; cursor: pointer; }
.swatch.on { box-shadow: 0 0 0 2px var(--yy-surface), 0 0 0 4px var(--yy-text-3); }
.boxes { display: grid; gap: 4px; max-height: 300px; overflow-y: auto; border: 1px solid var(--yy-border); border-radius: 10px; padding: 4px; }
.box { display: flex; align-items: center; gap: 10px; padding: 7px 10px; border: none; border-radius: 7px; background: transparent; color: var(--yy-text-2); cursor: pointer; text-align: left; }
.box:hover { background: var(--yy-hover); }
.box.on { color: var(--yy-text); }
.email { flex: 0 1 auto; }
.tags { margin-left: auto; display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 4px; min-width: 0; }
.check { width: 16px; height: 16px; flex: none; border-radius: 4px; border: 1.5px solid var(--yy-border-strong); display: grid; place-items: center; font-size: 11px; color: #fff; }
.box.on .check { background: var(--yy-accent); border-color: var(--yy-accent); }
.avatar { width: 22px; height: 22px; flex: none; border-radius: 50%; color: #fff; font-size: 11px; font-weight: 600; display: grid; place-items: center; }
</style>
