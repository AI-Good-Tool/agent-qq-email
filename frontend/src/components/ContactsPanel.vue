<script setup lang="ts">
import { computed } from 'vue';
import { state } from '@/stores/mailbox';
import { colorFor, initial } from '@/utils/format';

const emit = defineEmits<{ (e: 'compose', email: string): void }>();
const contacts = computed(() => {
  const q = state.search.trim().toLowerCase();
  return q ? state.contacts.filter((c) => `${c.name} ${c.email}`.toLowerCase().includes(q)) : state.contacts;
});
</script>

<template>
  <div v-if="contacts.length" class="grid">
    <div v-for="contact in contacts" :key="contact.email" class="contact">
      <span class="avatar" :style="{ background: colorFor(contact.email) }">{{ initial(contact.name) }}</span>
      <div class="info">
        <strong class="ellipsis">{{ contact.name }}</strong>
        <span class="muted ellipsis">{{ contact.email }}</span>
      </div>
      <a-tooltip content="发邮件" mini>
        <button type="button" class="mail-btn" :disabled="!state.accounts.length" @click="emit('compose', contact.email)"><icon-send /></button>
      </a-tooltip>
    </div>
  </div>
  <div v-else class="empty">
    <icon-user-group class="empty-icon" />
    <p class="serif">还没有联系人</p>
    <span class="muted">联系人会根据收件箱中的往来邮件自动整理。</span>
  </div>
</template>

<style scoped>
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 1px; background: var(--yy-border); }
.contact { display: flex; align-items: center; gap: 12px; padding: 14px 16px; background: var(--yy-surface); }
.avatar { flex: none; width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; color: #fff; font-weight: 600; }
.info { flex: 1; min-width: 0; display: grid; font-size: 13px; }
.info strong { font-weight: 600; font-size: 14px; }
.mail-btn { width: 32px; height: 32px; display: grid; place-items: center; border: 1px solid var(--yy-border); border-radius: 8px; background: transparent; color: var(--yy-text-3); cursor: pointer; }
.mail-btn:hover:not(:disabled) { color: var(--yy-accent-text); border-color: var(--yy-accent); }
.empty { display: grid; justify-items: center; gap: 6px; padding: 72px 16px; text-align: center; }
.empty-icon { font-size: 34px; color: var(--yy-text-4); }
.empty p { margin: 6px 0 0; font-size: 20px; }
</style>
