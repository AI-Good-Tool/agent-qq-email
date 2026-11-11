<script setup lang="ts">
import { onMounted } from 'vue';
import { auth, checkSession } from '@/stores/auth';
import BrandMark from '@/components/BrandMark.vue';
import LoginView from '@/views/LoginView.vue';
import MailView from '@/views/MailView.vue';

onMounted(checkSession);
</script>

<template>
  <div v-if="auth.status === 'checking'" class="boot">
    <BrandMark :size="44" />
    <a-spin :size="20" />
  </div>
  <LoginView v-else-if="auth.status === 'anonymous'" />
  <MailView v-else />
</template>

<style scoped>
.boot { height: 100%; display: grid; place-content: center; justify-items: center; gap: 20px; }
</style>
