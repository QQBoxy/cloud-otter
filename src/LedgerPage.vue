<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { ElAlert, ElButton, ElEmpty, ElPopconfirm } from 'element-plus'
import 'element-plus/es/components/alert/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/popconfirm/style/css'
import { taipeiDate, TRANSACTIONS_PER_PAGE, type Transaction, type TransactionPage, type YearSummary } from '../shared/ledger.ts'
import { transactionPage, transactionTotalPage } from '../shared/pages.ts'
import { ApiError, request } from './request'
import { parsePrice, transactionCollection as collection } from './transactions'

const props = defineProps<{ route: URL }>()
const emit = defineEmits<{ navigate: [path: string] }>()

const today = () => taipeiDate(new Date())
const month = ref(today().slice(0, 7))
const availableYears = ref<string[]>([])
const selectedYear = computed(() => month.value.slice(0, 4))
const years = computed(() => [...new Set([today().slice(0, 4), selectedYear.value, ...availableYears.value])].sort().reverse())
const summary = ref<YearSummary | null>(null)
const records = ref<TransactionPage>({ data: [], total: 0, price: 0 })
const page = ref(1)
const pageSize = TRANSACTIONS_PER_PAGE
const pageCount = (total: number) => Math.max(1, Math.ceil(total / pageSize))
const totalPages = computed(() => pageCount(records.value.total))
const visiblePages = computed(() => {
  const last = totalPages.value
  const current = page.value
  if (last <= 7) return Array.from({ length: last }, (_, index) => index + 1)
  if (current <= 4) return [1, 2, 3, 4, 5, '…', last]
  if (current >= last - 3) return [1, '…', last - 4, last - 3, last - 2, last - 1, last]
  return [1, '…', current - 1, current, current + 1, '…', last]
})
const loadedMonth = ref('')
const view = ref<'entries' | 'stats'>('entries')
const blankDraft = () => ({ name: '', price: '', day: today() })
const newDraft = ref(blankDraft())
const editDraft = ref<(ReturnType<typeof blankDraft> & { id: number; originalDay: string }) | null>(null)
const draft = computed(() => editDraft.value ?? newDraft.value)
const nameInput = ref<HTMLInputElement | null>(null)
const heading = ref<HTMLElement | null>(null)
const busy = ref(false)
const error = ref('')
const money = new Intl.NumberFormat('zh-TW', { maximumFractionDigits: 2 })
const dateOf = (entry: Transaction) => taipeiDate(new Date(entry.occurredAt))
const formatMoney = (price: number) => 'NT$' + money.format(price)
const maxMonth = computed(() => Math.max(1, ...(summary.value?.months.map((row) => row.price) ?? [])))
let displayedRoute = props.route
let leftLedger = false

async function load(requestedPage = page.value) {
  if (view.value === 'entries') {
    let nextPage = requestedPage
    while (true) {
      const params = new URLSearchParams({ month: month.value, offset: String((nextPage - 1) * pageSize), limit: String(pageSize) })
      const result = await request(collection + '?' + params).then((response) => response.json<TransactionPage>())
      const last = pageCount(result.total)
      // A deletion can remove the page currently open in either administrator's browser.
      if (nextPage <= last) {
        records.value = result
        page.value = nextPage
        break
      }
      nextPage = last
    }
  } else {
    summary.value = await request(collection + '/summary?year=' + month.value.slice(0, 4))
      .then((response) => response.json<YearSummary>())
  }
  loadedMonth.value = month.value
}

async function run(action: () => Promise<void>) {
  if (busy.value) return
  busy.value = true
  error.value = ''
  try {
    await action()
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) window.location.replace('/login')
    else error.value = cause instanceof Error ? cause.message : '目前無法完成操作。'
  } finally {
    busy.value = false
  }
}

function setMonth(value: string) {
  if (value !== month.value) loadedMonth.value = ''
  month.value = value
}

function periodUrl(nextView: typeof view.value, value: string) {
  return nextView === 'stats'
    ? transactionTotalPage.path + '?year=' + value.slice(0, 4)
    : transactionPage.path + '?month=' + value
}

function readRoute(url: URL) {
  view.value = url.pathname === transactionTotalPage.path ? 'stats' : 'entries'
  const year = url.searchParams.get('year')
  const value = view.value === 'stats'
    ? year && year + month.value.slice(4)
    : url.searchParams.get('month')
  setMonth(value && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(value) ? value : today().slice(0, 7))
  loadedMonth.value = ''
}

function changePeriod(event: Event, unit: 'year' | 'month') {
  const value = (event.target as HTMLSelectElement).value
  return run(async () => {
    setMonth(unit === 'year' ? value + month.value.slice(4) : selectedYear.value + '-' + value)
    window.history.replaceState(null, '', periodUrl(view.value, month.value))
    await load(1)
  })
}

function switchView(nextView: typeof view.value, value = month.value) {
  emit('navigate', periodUrl(nextView, value))
}

function goToPage(target: number) {
  if (target < 1 || target > totalPages.value || target === page.value) return
  return run(() => load(target))
}

async function openEdit(entry: Transaction) {
  const day = dateOf(entry)
  editDraft.value = { id: entry.id, originalDay: day, name: entry.name, price: entry.price.toString(), day }
  await nextTick()
  nameInput.value?.focus()
}

async function closeEdit() {
  editDraft.value = null
  await nextTick()
  heading.value?.focus()
}

function save() {
  return run(async () => {
    const savedFrom = window.location.href
    const route = props.route
    const editing = editDraft.value
    const form = draft.value
    const price = parsePrice(form.price)
    const name = editing ? form.name : form.name.trim()
    const now = new Date()
    const occurredAt = !editing && form.day === taipeiDate(now)
      ? now.toISOString()
      : form.day + 'T00:00:00+08:00'
    const body = {
      name,
      price,
      // Preserve an imported time when the user edits only the item or amount.
      ...(form.day !== editing?.originalDay && { occurredAt }),
    }
    const response = editing
      ? await request(collection + '/' + editing.id, 'PATCH', body)
      : await request(collection, 'POST', body)
    const entry = await response.json<Transaction>()
    if (leftLedger) return
    if (!editing) newDraft.value = blankDraft()
    // A completed save must not replace the URL of a different history entry.
    if (props.route !== route || window.location.href !== savedFrom) {
      editDraft.value = null
      return
    }
    const savedMonth = dateOf(entry).slice(0, 7)
    const targetPage = editing && month.value === savedMonth ? page.value : 1
    setMonth(savedMonth)
    if (!availableYears.value.includes(selectedYear.value)) availableYears.value.push(selectedYear.value)
    window.history.replaceState(null, '', periodUrl('entries', savedMonth))
    await closeEdit()
    loadedMonth.value = ''
    await load(targetPage)
  })
}

function remove(id: number) {
  return run(async () => {
    await request(collection + '/' + id, 'DELETE')
    loadedMonth.value = ''
    await load()
  })
}

readRoute(displayedRoute)
watch([() => props.route, busy], ([route, loading]) => {
  // Apply the latest navigation once the previous ledger operation settles.
  if (loading || route === displayedRoute) return
  displayedRoute = route
  readRoute(route)
  void run(() => load(1))
})

onMounted(() => run(async () => {
  const results = await Promise.allSettled([
    load(),
    request(collection + '/years').then(async (response) => {
      availableYears.value = await response.json<string[]>()
    }),
  ])
  for (const result of results) {
    if (result.status === 'rejected') throw result.reason
  }
}))
onUnmounted(() => { leftLedger = true })
</script>

<template>
  <main class="page management-page ledger" :aria-busy="busy">
    <header class="page-header management-heading">
      <h1 ref="heading" tabindex="-1">{{ view === 'entries' ? '記帳' : '年度統計' }}</h1>
      <ElButton
        :disabled="busy || !!editDraft"
        @click="switchView(view === 'entries' ? 'stats' : 'entries')"
      >{{ view === 'entries' ? '年度統計' : '返回記帳' }}</ElButton>
    </header>

    <ElAlert v-if="error" :title="error" type="error" :closable="false" />

    <form v-if="view === 'entries'" class="panel panel-form ledger-form" @submit.prevent="save">
      <h2>{{ editDraft ? '編輯支出' : '新增支出' }}</h2>
      <label class="form-field">品項 <input ref="nameInput" v-model="draft.name" required maxlength="500" :disabled="busy"></label>
      <label class="form-field">金額（NT$） <input v-model="draft.price" inputmode="decimal" required :disabled="busy"></label>
      <label class="form-field">交易日期 <input v-model="draft.day" type="date" min="1000-01-01" max="9999-12-31" required :disabled="busy"></label>
      <div class="actions">
        <ElButton
          type="primary"
          native-type="submit"
          :loading="busy"
          :disabled="!draft.name.trim() || !draft.price.trim() || !draft.day"
        >{{ editDraft ? '儲存' : '新增' }}</ElButton>
        <ElButton v-if="editDraft" :disabled="busy" @click="closeEdit">取消</ElButton>
      </div>
    </form>

    <div class="ledger-period">
      <label class="form-field">年份
        <select :value="selectedYear" :disabled="busy || !!editDraft" @change="changePeriod($event, 'year')">
          <option v-for="year in years" :key="year" :value="year">{{ year }}</option>
        </select>
      </label>
      <label v-if="view === 'entries'" class="form-field">月份
        <select :value="month.slice(5)" :disabled="busy || !!editDraft" @change="changePeriod($event, 'month')">
          <option v-for="n in 12" :key="n" :value="String(n).padStart(2, '0')">{{ n }} 月</option>
        </select>
      </label>
    </div>

    <p v-if="busy && loadedMonth !== month" role="status">載入中…</p>
    <template v-if="loadedMonth === month">
      <section v-if="view === 'entries'" aria-labelledby="monthly-heading">
        <div class="page-header management-section-heading">
          <h2 id="monthly-heading">{{ month }} 支出</h2>
          <strong>{{ formatMoney(records.price) }}</strong>
        </div>
        <ElEmpty v-if="records.data.length === 0" description="這個月還沒有支出。" />
        <table v-else class="record-table ledger-table" role="table">
          <caption>{{ month }} 支出明細</caption>
          <thead role="rowgroup">
            <tr role="row"><th scope="col" role="columnheader">日期</th><th scope="col" role="columnheader">品項</th><th scope="col" role="columnheader">金額</th><th scope="col" role="columnheader">操作</th></tr>
          </thead>
          <tbody role="rowgroup">
            <tr v-for="entry in records.data" :key="entry.id" role="row">
              <td role="cell">{{ dateOf(entry) }}</td>
              <td role="cell">{{ entry.name }}</td>
              <td role="cell">{{ formatMoney(entry.price) }}</td>
              <td class="ledger-row-actions" role="cell">
                <div class="actions record-actions">
                  <ElButton :disabled="busy || !!editDraft" @click="openEdit(entry)">編輯</ElButton>
                  <ElPopconfirm
                    title="確定刪除這筆支出？"
                    confirm-button-text="刪除"
                    cancel-button-text="取消"
                    @confirm="remove(entry.id)"
                  >
                    <template #reference>
                      <ElButton type="danger" plain :disabled="busy || !!editDraft">刪除</ElButton>
                    </template>
                  </ElPopconfirm>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
        <nav v-if="totalPages > 1" class="ledger-pagination" aria-label="支出明細分頁">
          <ElButton :disabled="busy || !!editDraft || page === 1" @click="goToPage(page - 1)">上一頁</ElButton>
          <span class="ledger-page-status" aria-live="polite">{{ page }} / {{ totalPages }}</span>
          <div class="ledger-page-numbers">
            <template v-for="(number, index) in visiblePages" :key="index">
              <ElButton
                v-if="typeof number === 'number'"
                :type="page === number ? 'primary' : 'default'"
                :disabled="busy || !!editDraft"
                :aria-current="page === number ? 'page' : undefined"
                :aria-label="`第 ${number} 頁`"
                @click="goToPage(number)"
              >{{ number }}</ElButton>
              <span v-else aria-hidden="true">{{ number }}</span>
            </template>
          </div>
          <ElButton :disabled="busy || !!editDraft || page === totalPages" @click="goToPage(page + 1)">下一頁</ElButton>
        </nav>
      </section>

      <section v-else-if="summary" aria-labelledby="yearly-heading">
        <div class="panel ledger-total">
          <h2 id="yearly-heading">{{ summary.year }} 年支出合計</h2>
          <strong>{{ formatMoney(summary.price) }}</strong>
        </div>
        <h2>每月支出趨勢</h2>
        <ol class="panel ledger-trend">
          <li v-for="(row, index) in summary.months" :key="row.month">
            <button type="button" :disabled="busy" @click="switchView('entries', row.month)">
              <span>{{ index + 1 }} 月</span>
              <span class="ledger-track" aria-hidden="true"><span :style="{ width: (100 * row.price / maxMonth) + '%' }"></span></span>
              <span>{{ formatMoney(row.price) }}</span>
            </button>
          </li>
        </ol>
      </section>
    </template>
  </main>
</template>

<style scoped>
.ledger-period, .ledger-total { margin-block: 1rem; }
.ledger-total h2, .ledger-total + h2 { font-size: 1.125rem; margin: 0; }
.ledger .management-section-heading { flex-wrap: wrap; }
.ledger-period { display: flex; flex-wrap: wrap; align-items: end; gap: .65rem; }
@media (min-width: 43rem) {
  .ledger-form { grid-template-columns: minmax(0, 2fr) repeat(2, minmax(0, 1fr)); }
  .ledger-form h2, .ledger-form .actions { grid-column: 1 / -1; }
}
.ledger-total strong { display: block; font-size: 1.6rem; margin-top: .15rem; overflow-wrap: anywhere; }
.ledger-table th:first-child { width: 8.5rem; }
.ledger-table td:first-child { white-space: nowrap; font-variant-numeric: tabular-nums; }
.ledger-table th:nth-child(3) { width: 9.25rem; }
.ledger-table th:last-child { width: 10.5rem; }
.ledger-pagination, .ledger-page-numbers { display: flex; align-items: center; justify-content: center; gap: .35rem; }
.ledger-pagination { margin-block: 1rem; }
.ledger-pagination .el-button { margin: 0; }
.ledger-page-numbers .el-button { min-width: 44px; padding-inline: .4rem; }
.ledger-page-status { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
@media (max-width: 45rem) {
  .ledger-page-numbers { display: none; }
  .ledger-page-status { position: static; width: auto; height: auto; clip-path: none; padding-inline: .5rem; }
}
.ledger-trend { list-style: none; padding-block: .4rem; }
.ledger-trend button {
  width: 100%; display: grid; grid-template-columns: 2.6rem minmax(1.25rem, 1fr) auto;
  min-height: var(--control-height);
  align-items: center; gap: .6rem; border: 0; background: transparent; color: inherit;
  text-align: start; font: inherit; padding: .15rem 0;
}
.ledger-trend button:hover { background: #f3f7f5; }
.ledger-track { display: block; height: .65rem; background: #e1f0ea; border-radius: .3rem; }
.ledger-track span { display: block; height: 100%; border-radius: inherit; background: #176753; }

@media (max-width: 43rem) {
  .ledger-table tr { grid-template-columns: minmax(0, 1fr) minmax(0, auto); }
  .ledger-table td:first-child { grid-area: 2 / 1; font-size: .9rem; color: #4e675e; }
  .ledger-table td:nth-child(2) { grid-area: 1 / 1; }
  .ledger-table td:nth-child(3) { grid-area: 1 / 2; text-align: end; padding-left: .5rem; }
  .ledger-table .ledger-row-actions { grid-area: 2 / 2; }
}
</style>
