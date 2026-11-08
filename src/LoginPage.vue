<script setup lang="ts">
import { ref } from 'vue'
import { ElAlert, ElButton, ElForm, ElFormItem, ElInput } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import { request } from './request'

const username = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')

async function login() {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await request('/api/sessions', 'POST', { username: username.value, password: password.value })
    window.location.replace('/')
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : '目前無法登入。'
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <main class="page login-page">
    <h1>管理員登入</h1>
    <ElAlert v-if="error" :title="error" type="error" :closable="false" />
    <ElForm label-position="top" @submit.prevent="login">
      <ElFormItem label="帳號" for="username">
        <ElInput
          id="username"
          v-model="username"
          name="username"
          autocomplete="username"
          :maxlength="128"
          required
        />
      </ElFormItem>
      <ElFormItem label="密碼" for="password">
        <ElInput
          id="password"
          v-model="password"
          name="password"
          autocomplete="current-password"
          type="password"
          :maxlength="256"
          required
        />
      </ElFormItem>
      <ElButton
        type="primary"
        native-type="submit"
        :loading="busy"
        :disabled="!username.trim() || !password"
      >
        登入
      </ElButton>
    </ElForm>
  </main>
</template>
