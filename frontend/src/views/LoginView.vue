<script setup lang="ts">
import { reactive } from 'vue';
import { auth, login } from '@/stores/auth';
import BrandMark from '@/components/BrandMark.vue';

const form = reactive({ username: 'admin', password: '', loading: false, error: auth.expiredNotice });

async function submit() {
  if (!form.username.trim() || !form.password) {
    form.error = '请输入账号和密码。';
    return;
  }
  form.loading = true;
  form.error = '';
  try {
    await login(form.username.trim(), form.password);
  } catch (error) {
    form.error = error instanceof Error ? error.message : '登录失败。';
  } finally {
    form.loading = false;
  }
}
</script>

<template>
  <main class="login">
    <header class="login-top">
      <BrandMark :size="28" />
      <span class="serif wordmark">云邮盒</span>
    </header>

    <section class="login-center">
      <h1 class="serif headline">你的所有邮箱，<br />都在一处。</h1>
      <p class="lede">聚合多个微信授权的 Agent Mail 邮箱，统一收件、筛选与回复。</p>

      <form class="card" @submit.prevent="submit">
        <label class="yy-field">
          <span>账号</span>
          <a-input v-model="form.username" size="large" autocomplete="username" placeholder="请输入账号" @input="form.error = ''">
            <template #prefix><icon-user /></template>
          </a-input>
        </label>
        <label class="yy-field">
          <span>密码</span>
          <a-input-password v-model="form.password" size="large" autocomplete="current-password" placeholder="请输入密码" autofocus @input="form.error = ''" @press-enter="submit">
            <template #prefix><icon-lock /></template>
          </a-input-password>
        </label>
        <div v-if="form.error" class="yy-error" role="alert">{{ form.error }}</div>
        <a-button type="primary" html-type="submit" size="large" long :loading="form.loading">登录</a-button>
      </form>

      <p class="foot"><icon-safe /> 登录状态仅保存在当前浏览器，邮件数据存储在你自己的服务器上。</p>
    </section>
  </main>
</template>

<style scoped>
.login {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(1200px 520px at 50% -10%, color-mix(in srgb, var(--yy-accent) 7%, transparent), transparent 70%),
    var(--yy-bg);
}
.login-top { display: flex; align-items: center; gap: 10px; padding: 22px 28px; }
.wordmark { font-size: 19px; }
.login-center {
  flex: 1;
  width: min(420px, calc(100% - 32px));
  margin: 0 auto;
  padding: 6vh 0 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}
.headline { font-size: clamp(32px, 6vw, 44px); line-height: 1.18; margin: 0 0 14px; color: var(--yy-text); }
.lede { margin: 0 0 32px; color: var(--yy-text-3); font-size: 15px; max-width: 380px; text-wrap: balance; }
.card {
  width: 100%;
  text-align: left;
  background: var(--yy-surface);
  border: 1px solid var(--yy-border);
  border-radius: 18px;
  padding: 24px 24px 22px;
  box-shadow: var(--yy-shadow);
}
.card .arco-btn { margin-top: 6px; height: 42px; border-radius: 10px; }
.foot { margin-top: 22px; font-size: 12.5px; color: var(--yy-text-4); display: flex; gap: 6px; align-items: center; justify-content: center; }
</style>
