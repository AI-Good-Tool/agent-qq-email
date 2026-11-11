<script setup lang="ts">
import { computed } from 'vue';
import { labelColors } from '@/stores/mailbox';

const props = withDefaults(defineProps<{ name: string; color?: string; size?: 'small' | 'mini' }>(), { size: 'small' });
const tint = computed(() => props.color || labelColors.value.get(props.name) || '#6b6a65');
</script>

<template>
  <span class="label-chip" :class="size" :style="{ '--c': tint }" :title="name"><i />{{ name }}</span>
</template>

<style scoped>
.label-chip {
  display: inline-flex; align-items: center; gap: 4px; flex: none; max-width: 120px;
  overflow: hidden; white-space: nowrap; text-overflow: ellipsis;
  font-size: 11.5px; line-height: 18px; font-weight: 500; padding: 0 7px; border-radius: 6px;
  color: color-mix(in srgb, var(--c) 82%, var(--yy-text));
  background: color-mix(in srgb, var(--c) 13%, transparent);
}
.label-chip.mini { font-size: 10.5px; line-height: 16px; padding: 0 5px; gap: 3px; }
.label-chip i { width: 6px; height: 6px; border-radius: 50%; background: var(--c); flex: none; }
.label-chip.mini i { width: 5px; height: 5px; }
</style>
