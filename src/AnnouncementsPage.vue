<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElForm, ElFormItem, ElInput, ElPopconfirm } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/form/style/css'
import 'element-plus/es/components/form-item/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/popconfirm/style/css'
import { collection, readAnnouncements, type Announcement } from './announcements'
import { ApiError, request } from './request'

const announcements = ref<Announcement[]>([])
const draft = ref('')
const editId = ref<number | null>(null)
const editText = ref('')
const busy = ref(false)
const loaded = ref(false)
const error = ref('')

async function load() {
  announcements.value = await readAnnouncements()
  loaded.value = true
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      window.location.replace('/login')
      return
    }
    error.value = cause instanceof Error ? cause.message : '目前無法完成操作。'
  } finally {
    busy.value = false
  }
}

function createAnnouncement() {
  return run(async () => {
    await request(collection, 'POST', { text: draft.value })
    draft.value = ''
    await load()
  })
}

function beginEdit(item: Announcement) {
  editId.value = item.id
  editText.value = item.text
}

function saveEdit(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'PATCH', { text: editText.value })
    editId.value = null
    await load()
  })
}

function remove(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'DELETE')
    if (editId.value === id) editId.value = null
    await load()
  })
}

function move(index: number, step: number) {
  return run(async () => {
    const previousIds = announcements.value.map(({ id }) => id)
    const other = index + step
    const currentId = previousIds[index]
    const otherId = previousIds[other]
    if (currentId === undefined || otherId === undefined) return

    const ids = [...previousIds]
    ids[index] = otherId
    ids[other] = currentId
    try {
      await request(collection + '/order', 'PUT', { ids, previousIds })
    } catch (cause) {
      if (cause instanceof ApiError && cause.status === 409) await load()
      throw cause
    }
    await load()
  })
}

onMounted(() => run(load))
</script>

<template>
  <main class="page management-page">
    <header class="page-header management-heading">
      <h1>公告</h1>
    </header>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />

    <ElForm class="panel panel-form" label-position="top" @submit.prevent="createAnnouncement">
      <h2>新增公告</h2>
      <ElFormItem label="公告內容" for="announcement-text">
        <ElInput
          id="announcement-text"
          v-model="draft"
          type="textarea"
          :rows="3"
          :maxlength="500"
          show-word-limit
        />
      </ElFormItem>
      <div class="actions">
        <ElButton type="primary" native-type="submit" :disabled="busy || !draft.trim()">新增</ElButton>
      </div>
    </ElForm>

    <section aria-labelledby="announcements-title" :aria-busy="busy">
      <div class="page-header management-section-heading">
        <h2 id="announcements-title">公告清單</h2>
        <ElButton :disabled="busy" @click="run(load)">重新整理</ElButton>
      </div>
      <p v-if="!loaded && !error" role="status">載入中…</p>
      <ElEmpty v-else-if="loaded && announcements.length === 0" description="目前沒有公告" />
      <table v-else-if="loaded" class="record-table announcements-table" role="table">
        <caption>公告清單</caption>
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">公告內容</th>
            <th scope="col" role="columnheader">操作</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          <tr v-for="(item, index) in announcements" :key="item.id" role="row">
            <td v-if="editId === item.id" colspan="2" role="cell">
              <ElForm class="panel-form" label-position="top" @submit.prevent="saveEdit(item.id)">
                <h2>編輯公告</h2>
                <ElFormItem label="公告內容" for="edit-text">
                  <ElInput
                    id="edit-text"
                    v-model="editText"
                    type="textarea"
                    :rows="3"
                    :maxlength="500"
                    show-word-limit
                  />
                </ElFormItem>
                <div class="actions">
                  <ElButton type="primary" native-type="submit" :disabled="busy || !editText.trim()">
                    儲存
                  </ElButton>
                  <ElButton :disabled="busy" @click="editId = null">取消</ElButton>
                </div>
              </ElForm>
            </td>
            <template v-else>
              <td class="announcement-text" role="cell">{{ item.text }}</td>
              <td role="cell">
                <div class="actions record-actions">
                  <ElButton :disabled="busy || index === 0" @click="move(index, -1)">上移</ElButton>
                  <ElButton :disabled="busy || index === announcements.length - 1" @click="move(index, 1)">
                    下移
                  </ElButton>
                  <ElButton :disabled="busy" @click="beginEdit(item)">編輯</ElButton>
                  <ElPopconfirm
                    title="確定刪除這則公告？"
                    confirm-button-text="刪除"
                    cancel-button-text="取消"
                    @confirm="remove(item.id)"
                  >
                    <template #reference>
                      <ElButton type="danger" plain :disabled="busy">刪除</ElButton>
                    </template>
                  </ElPopconfirm>
                </div>
              </td>
            </template>
          </tr>
        </tbody>
      </table>
    </section>
  </main>
</template>

<style scoped>
.announcements-table th:last-child { width: 19rem; }
</style>
