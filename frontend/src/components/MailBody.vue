<script setup lang="ts">
import { computed } from 'vue';
import { renderMailBody } from '@/utils/mailHtml';

const props = defineProps<{ body?: string; format?: string }>();
const rendered = computed(() => renderMailBody(props.body, props.format));
</script>

<template>
  <!-- 内容已经过白名单重建 / DOMPurify 清洗 -->
  <div class="mail-body" :class="`mail-body--${rendered.kind}`" v-html="rendered.html" />
</template>
