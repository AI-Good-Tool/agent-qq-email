<script setup lang="ts">
withDefaults(defineProps<{ size?: number }>(), { size: 28 });
</script>

<template>
  <span class="brand-mark" :style="{ width: `${size}px`, height: `${size}px`, borderRadius: `${size * 0.28}px` }" aria-hidden="true">
    <svg viewBox="0 0 64 64" :width="size * 0.62" :height="size * 0.62">
      <path d="M12 21.5c0-3 2.4-5.5 5.5-5.5h29c3 0 5.5 2.5 5.5 5.5v21c0 3-2.5 5.5-5.5 5.5h-29c-3.1 0-5.5-2.5-5.5-5.5z" fill="none" stroke="currentColor" stroke-width="4.5" />
      <path d="m14.5 20.5 17.5 13 17.5-13" fill="none" stroke="currentColor" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>
  </span>
</template>

<style scoped>
.brand-mark { display: inline-grid; place-items: center; flex: none; background: var(--yy-accent); color: #fff; }
</style>
