<script setup>
import { ref, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { useMealPlanStore } from '@/stores/mealPlan'
import { WEEK_DAYS, MEALS, MEAL_ICONS, CATEGORY_ICONS } from '@/constants'
import { currentWeekKey, weekDateKeys, toDateKey } from '@/utils/date'
import { matchDishes } from '@/utils/recipeMatch'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseTag from '@/components/common/BaseTag.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'

const inventory = useInventoryStore()
const mealPlan = useMealPlanStore()

const MEAL_SLOTS = { 早餐: 'breakfast', 午餐: 'lunch', 晚餐: 'dinner' }

// 可匹配的食材 = 临期 + 过期；过期可通过开关排除
const includeExpired = ref(true)
// 食材选择覆盖表：未设置过的默认视为选中
const toggled = ref({})

// 默认安排到“今天”的当前餐次
const weekKey = currentWeekKey()
const weekDates = weekDateKeys()
const todayKey = toDateKey()
const todayIndex = Math.max(0, weekDates.indexOf(todayKey))
const targetDay = ref(WEEK_DAYS[todayIndex].key)
const nowHour = new Date().getHours()
const targetMeal = ref(nowHour < 10 ? '早餐' : nowHour < 15 ? '午餐' : '晚餐')

const dayOptions = WEEK_DAYS.map((d, i) => ({
  key: d.key,
  label: d.label,
  isToday: weekDates[i] === todayKey,
}))

const candidates = computed(() => {
  const list = [...inventory.nearExpiryItems]
  if (includeExpired.value) list.push(...inventory.expiredItems)
  return list.sort((a, b) => a.remain - b.remain)
})

function isSelected(item) {
  return toggled.value[item.id] ?? true
}
function toggleItem(item) {
  toggled.value = { ...toggled.value, [item.id]: !isSelected(item) }
}
function selectAll() {
  toggled.value = {}
}
function clearAll() {
  const next = {}
  candidates.value.forEach((i) => (next[i.id] = false))
  toggled.value = next
}

const targets = computed(() => candidates.value.filter(isSelected))

const matches = computed(() =>
  matchDishes(mealPlan.dishes, targets.value, inventory.withExpiry),
)

// 本周每个菜品已被安排到的餐次
const weekSlots = computed(() => {
  const map = {}
  const days = mealPlan.plan[weekKey]
  WEEK_DAYS.forEach((d) => {
    MEALS.forEach((m) => {
      const ids = days?.[d.key]?.[MEAL_SLOTS[m]] || []
      ids.forEach((dishId) => {
        ;(map[dishId] ||= []).push({ dayKey: d.key, meal: m })
      })
    })
  })
  return map
})

const targetSlotIds = computed(() => {
  const k = MEAL_SLOTS[targetMeal.value]
  return new Set(mealPlan.plan[weekKey]?.[targetDay.value]?.[k] || [])
})

function isPlannedHere(dishId) {
  return targetSlotIds.value.has(dishId)
}

function elsewhereText(dishId) {
  const slots = (weekSlots.value[dishId] || []).filter(
    (s) => !(s.dayKey === targetDay.value && s.meal === targetMeal.value),
  )
  return slots
    .map((s) => `${WEEK_DAYS.find((d) => d.key === s.dayKey).label}${s.meal}`)
    .join('、')
}

function togglePlan(dishId) {
  mealPlan.toggleDish(weekKey, targetDay.value, targetMeal.value, dishId)
}

const targetLabel = computed(
  () =>
    `${dayOptions.find((d) => d.key === targetDay.value).label}${
      targetDay.value === WEEK_DAYS[todayIndex].key ? '（今天）' : ''
    } · ${targetMeal.value}`,
)

function remainText(item) {
  return item.status === 'expired' ? `过期${Math.abs(item.remain)}天` : `剩${item.remain}天`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>🍳 菜谱匹配</h2>
      <BaseButton size="sm" variant="ghost" @click="$router.push('/meal-plan')">管理菜谱 →</BaseButton>
    </div>
    <p class="muted">勾选需要优先消耗的临期/过期食材，自动反查已有菜谱用得上它们，点一下即可安排进本周计划。</p>

    <!-- 目标食材选择 -->
    <div class="card">
      <div class="section-title">
        <span>🥬 要消耗的食材（已选 {{ targets.length }} / {{ candidates.length }}）</span>
        <span class="head-tools">
          <label class="expired-toggle">
            <input v-model="includeExpired" type="checkbox" />
            包含过期（{{ inventory.expiredItems.length }}）
          </label>
          <a class="link" @click="selectAll">全选</a>
          <a class="link" @click="clearAll">清空</a>
        </span>
      </div>

      <BaseEmpty
        v-if="!candidates.length"
        emoji="🎉"
        text="没有临期或过期食材，暂时不需要清理～"
      />
      <div v-else class="ing-chips">
        <button
          v-for="item in candidates"
          :key="item.id"
          class="ing-chip"
          :class="{ on: isSelected(item), expired: item.status === 'expired' }"
          @click="toggleItem(item)"
        >
          <span class="ic">{{ CATEGORY_ICONS[item.category] }}</span>
          {{ item.name }}
          <span class="rm" :class="item.status">{{ remainText(item) }}</span>
        </button>
      </div>
    </div>

    <!-- 排餐目标 -->
    <div class="card target-card">
      <div class="target-title">📅 一键安排到</div>
      <div class="target-selects">
        <div class="seg">
          <button
            v-for="d in dayOptions"
            :key="d.key"
            class="seg-btn"
            :class="{ on: targetDay === d.key }"
            @click="targetDay = d.key"
          >
            {{ d.label }}<i v-if="d.isToday">今</i>
          </button>
        </div>
        <div class="seg">
          <button
            v-for="m in MEALS"
            :key="m"
            class="seg-btn"
            :class="{ on: targetMeal === m }"
            @click="targetMeal = m"
          >
            {{ MEAL_ICONS[m] }} {{ m }}
          </button>
        </div>
      </div>
    </div>

    <!-- 匹配结果 -->
    <div class="results-head">
      <span class="section-title" style="margin: 0">🍲 推荐菜谱（{{ matches.length }}）</span>
      <span class="muted small">按命中临期食材数量排序</span>
    </div>

    <BaseEmpty
      v-if="!targets.length"
      emoji="☝️"
      text="先在上方勾选要消耗的食材"
    />
    <BaseEmpty
      v-else-if="!mealPlan.dishes.length"
      emoji="📖"
      text="还没有菜谱，先去「每周食谱」建几道拿手菜吧"
    />
    <BaseEmpty
      v-else-if="!matches.length"
      emoji="🤔"
      text="已有菜谱里没有用到这些食材的，去新建一道菜试试？"
    />

    <div v-else class="match-list">
      <div v-for="r in matches" :key="r.dish.id" class="match card">
        <div class="m-head">
          <div class="m-name">
            <span class="rank">{{ r.matchedCount }} 种</span>
            {{ r.dish.name }}
          </div>
          <div class="m-meta">
            <BaseTag :category="r.dish.category" :text="r.dish.category" />
            <span class="muted small">⏱ {{ r.dish.cookTime }}分钟 · {{ r.dish.difficulty }}</span>
          </div>
        </div>

        <div class="m-ings">
          <span
            v-for="(m, i) in r.matched"
            :key="'hit-' + i"
            class="mi hit"
            :class="{ expired: m.item.status === 'expired' }"
          >
            {{ m.ingredient.name }}
            <em>{{ remainText(m.item) }}</em>
          </span>
          <span
            v-for="(o, i) in r.others"
            :key="'other-' + i"
            class="mi other"
            :class="{ lack: !o.inStock }"
            :title="o.inStock ? '库存有' : '库存里没有，需要采购'"
          >
            {{ o.ingredient.name }}
            <em v-if="!o.inStock">需采购</em>
          </span>
        </div>

        <div v-if="r.dish.instructions" class="m-instr muted small">{{ r.dish.instructions }}</div>

        <div class="m-foot">
          <span v-if="elsewhereText(r.dish.id)" class="muted small">
            本周已安排：{{ elsewhereText(r.dish.id) }}
          </span>
          <span v-else></span>
          <BaseButton
            size="sm"
            :variant="isPlannedHere(r.dish.id) ? 'ghost' : 'primary'"
            @click="togglePlan(r.dish.id)"
          >
            {{ isPlannedHere(r.dish.id) ? `✓ 已安排到${targetLabel}（点击移除）` : `安排到 ${targetLabel}` }}
          </BaseButton>
        </div>
      </div>
    </div>

    <div class="card tip">
      <span>💡 做完菜消耗掉食材后，还可以去</span>
      <router-link to="/challenge" class="link">冰箱清理挑战</router-link>
      <span>打卡拿积分。</span>
    </div>
  </div>
</template>

<style scoped>
.page-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
.page-head h2 {
  margin: 0;
}
.small {
  font-size: 12px;
}
.head-tools {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 13px;
  font-weight: 400;
}
.expired-toggle {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
  cursor: pointer;
}
.ing-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.ing-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: 1px solid var(--border);
  background: #fff;
  border-radius: 18px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text);
}
.ing-chip .ic {
  font-size: 15px;
}
.ing-chip .rm {
  font-style: normal;
  font-size: 11px;
  padding: 0 7px;
  border-radius: 10px;
  background: var(--warn-light);
  color: var(--warn);
}
.ing-chip .rm.expired {
  background: var(--danger-light);
  color: var(--danger);
}
.ing-chip.on {
  border-color: var(--primary);
  background: var(--primary-light);
  color: var(--primary-dark);
  font-weight: 600;
}
.ing-chip.on.expired {
  border-color: var(--danger);
  background: var(--danger-light);
  color: var(--danger);
}
.target-card {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.target-title {
  font-weight: 600;
  white-space: nowrap;
}
.target-selects {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}
.seg {
  display: inline-flex;
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
}
.seg-btn {
  border: none;
  background: #fff;
  padding: 6px 12px;
  font-size: 13px;
  cursor: pointer;
  color: var(--text-2);
  position: relative;
}
.seg-btn i {
  font-style: normal;
  font-size: 10px;
  background: var(--primary);
  color: #fff;
  border-radius: 6px;
  padding: 0 4px;
  margin-left: 3px;
}
.seg-btn.on {
  background: var(--primary);
  color: #fff;
}
.seg-btn.on i {
  background: #fff;
  color: var(--primary);
}
.results-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 18px 0 10px;
}
.match-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.match {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.m-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.m-name {
  font-weight: 600;
  font-size: 15px;
  display: flex;
  align-items: center;
  gap: 8px;
}
.rank {
  font-size: 12px;
  font-weight: 600;
  background: var(--primary);
  color: #fff;
  border-radius: 10px;
  padding: 1px 9px;
  white-space: nowrap;
}
.m-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
}
.m-ings {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.mi {
  font-size: 12px;
  padding: 3px 10px;
  border-radius: 12px;
  background: var(--surface-2);
  color: var(--text-2);
  white-space: nowrap;
}
.mi em {
  font-style: normal;
  font-size: 11px;
  margin-left: 5px;
}
.mi.hit {
  background: var(--primary-light);
  color: var(--primary-dark);
  font-weight: 600;
}
.mi.hit em {
  color: var(--warn);
}
.mi.hit.expired {
  background: var(--danger-light);
  color: var(--danger);
}
.mi.hit.expired em {
  color: var(--danger);
}
.mi.other.lack {
  background: #fff;
  border: 1px dashed var(--border);
}
.mi.other.lack em {
  color: var(--warn);
}
.m-instr {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.m-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 10px;
}
.tip {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 13px;
}
@media (max-width: 560px) {
  .m-head,
  .m-foot {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
