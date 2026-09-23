<script setup>
import { reactive, ref, computed } from 'vue'
import { useInventoryStore } from '@/stores/inventory'
import { useChallengeStore } from '@/stores/challenge'
import { useMealPlanStore } from '@/stores/mealPlan'
import { useUserStore } from '@/stores/user'
import { CHALLENGE_POINTS, MEAL_ICONS } from '@/constants'
import BaseButton from '@/components/common/BaseButton.vue'
import BaseEmpty from '@/components/common/BaseEmpty.vue'
import { expiryDateKey, currentWeekKey, currentWeekStart, toDateKey, parseDateKey } from '@/utils/date'
import { matchRecipes } from '@/utils/recipeMatch'

const inventory = useInventoryStore()
const challenge = useChallengeStore()
const mealPlan = useMealPlanStore()
const user = useUserStore()

// 每个食材对应的“要做的菜”输入（动态 key，需用 reactive）
const pickedDish = reactive({})

// 可挑战食材 = 临期 + 过期
const candidates = computed(() =>
  [...inventory.nearExpiryItems, ...inventory.expiredItems].sort((a, b) => a.remain - b.remain),
)

// 根据临期/过期食材反查菜谱，按命中食材数量排序
const recommendations = computed(() => matchRecipes(mealPlan.dishes, candidates.value))

// 一键安排后的即时提示（dishId -> 文案）
const flash = reactive({})

function statusText(m) {
  if (m.status === 'expired') return `过期${Math.abs(m.remain)}天`
  return `剩${m.remain}天`
}

// 当前周内该菜已安排的餐次
function scheduledSlots(dishId) {
  return mealPlan.findDishSlots(currentWeekKey(), dishId)
}

function dayLabel(dayKey) {
  const today = toDateKey(new Date())
  const start = currentWeekStart()
  const idx = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'].indexOf(dayKey)
  const d = parseDateKey(start)
  d.setDate(d.getDate() + idx)
  const key = toDateKey(d)
  if (key === today) return '今天'
  const tomorrow = parseDateKey(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (key === toDateKey(tomorrow)) return '明天'
  return { monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日' }[dayKey]
}

function schedule(rec) {
  const res = mealPlan.scheduleDishThisWeek(rec.dish.id)
  if (res.duplicated) {
    flash[rec.dish.id] = `本周已安排过这道菜`
  } else {
    flash[rec.dish.id] = `已安排到${dayLabel(res.day)}${MEAL_ICONS[res.meal] || ''}${res.meal}`
  }
  setTimeout(() => delete flash[rec.dish.id], 3000)
}

// 某个食材能被哪些菜谱用上（用于下拉框置顶推荐）
function dishesForIngredient(item) {
  const name = String(item.name).trim().toLowerCase()
  const hit = (d) =>
    (d.ingredients || []).some((ing) => String(ing.name).trim().toLowerCase() === name)
  return [
    ...mealPlan.dishes.filter(hit),
    ...mealPlan.dishes.filter((d) => !hit(d)),
  ]
}

function complete(item) {
  const dishName = pickedDish[item.id]
  if (!dishName || !dishName.trim()) {
    alert('请先选择或输入要做的菜')
    return
  }
  challenge.complete({
    ingredientId: item.id,
    ingredientName: item.name,
    dishName: dishName.trim(),
  })
  delete pickedDish[item.id]
}

function fmt(iso) {
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}
</script>

<template>
  <div>
    <div class="page-head">
      <h2>🧹 冰箱清理挑战</h2>
      <span class="points-chip">⭐ 当前积分 {{ user.points }}</span>
    </div>

    <p class="muted">选择临期/过期食材，做一道菜吃掉它，完成后打卡获得 <b>{{ CHALLENGE_POINTS }} 积分</b>！</p>

    <!-- 菜谱智能匹配：根据临期/过期食材反查已有菜谱 -->
    <div v-if="candidates.length" class="rec-section">
      <div class="section-title">🍳 用这些食材能做什么？</div>
      <BaseEmpty
        v-if="!mealPlan.dishes.length"
        emoji="📖"
        text="还没有菜谱，先去「每周食谱计划」里建几道菜吧"
      />
      <BaseEmpty
        v-else-if="!recommendations.length"
        emoji="🤔"
        text="现有菜谱都用不上这些食材，考虑新建一道菜？"
      />
      <div v-else class="rec-list">
        <div v-for="rec in recommendations" :key="rec.dish.id" class="rec-card card">
          <div class="rec-main">
            <div class="rec-head">
              <span class="dish-name">{{ rec.dish.name }}</span>
              <span class="match-badge">命中 {{ rec.matchCount }}/{{ rec.totalCount }} 种</span>
            </div>
            <div class="rec-ingredients">
              <span
                v-for="m in rec.matched"
                :key="m.name"
                class="ing-chip hit"
                :class="m.status"
                :title="m.status === 'expired' ? '已过期' : '临期'"
              >
                {{ m.name }}<em>{{ statusText(m) }}</em>
              </span>
              <span v-for="m in rec.missing" :key="m.name" class="ing-chip miss">
                {{ m.name }}<em>需另备</em>
              </span>
            </div>
            <div class="rec-meta muted small">
              {{ rec.dish.cookTime }}分钟 · {{ rec.dish.difficulty }}
              <template v-if="scheduledSlots(rec.dish.id).length">
                · 本周已安排：
                <span v-for="(s, i) in scheduledSlots(rec.dish.id)" :key="i">
                  {{ dayLabel(s.day) }}{{ s.meal }}<span v-if="i < scheduledSlots(rec.dish.id).length - 1">、</span>
                </span>
              </template>
            </div>
          </div>
          <div class="rec-action">
            <BaseButton size="sm" @click="schedule(rec)">📅 安排进计划</BaseButton>
            <span v-if="flash[rec.dish.id]" class="flash">{{ flash[rec.dish.id] }}</span>
          </div>
        </div>
      </div>
    </div>

    <BaseEmpty v-if="!candidates.length" emoji="🧊" text="没有需要清理的临期/过期食材，冰箱很干净！" />

    <div v-else class="grid grid-2">
      <div v-for="item in candidates" :key="item.id" class="challenge card">
        <div class="ch-head">
          <span class="emoji">🍲</span>
          <div class="info">
            <div class="name">{{ item.name }}</div>
            <div class="muted small">
              {{ item.quantity }}{{ item.unit }} · 过期日 {{ expiryDateKey(item.purchaseDate, item.shelfLifeDays) }}
              ·
              <span :style="{ color: item.status === 'expired' ? '#ef5350' : '#ff9800' }">
                {{ item.status === 'expired' ? `已过期 ${Math.abs(item.remain)} 天` : `剩 ${item.remain} 天` }}
              </span>
            </div>
          </div>
        </div>

        <template v-if="!challenge.completedIngredientIds.has(item.id)">
          <div class="dish-pick">
            <select v-model="pickedDish[item.id]">
              <option value="">选择要做的菜…</option>
              <option v-for="d in dishesForIngredient(item)" :key="d.id" :value="d.name">
                {{ d.ingredients.some((ing) => ing.name === item.name) ? `🔥 ${d.name}` : d.name }}
              </option>
            </select>
            <input v-model="pickedDish[item.id]" type="text" placeholder="或输入新菜名" />
          </div>
          <BaseButton block @click="complete(item)">✅ 完成打卡 +{{ CHALLENGE_POINTS }}积分</BaseButton>
        </template>
        <div v-else class="done">🎉 已清理</div>
      </div>
    </div>

    <div v-if="challenge.completed.length" class="card">
      <div class="section-title">清理记录</div>
      <div class="records">
        <div v-for="c in challenge.completed" :key="c.id" class="rec-row">
          <span>🧹 {{ c.ingredientName }} → 做了「{{ c.dishName }}」</span>
          <span class="muted small">{{ fmt(c.date) }} · +{{ c.points }}积分</span>
        </div>
      </div>
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
.points-chip {
  background: var(--warn-light);
  color: var(--warn);
  padding: 6px 14px;
  border-radius: 20px;
  font-weight: 600;
}
.rec-section {
  margin: 16px 0 20px;
}
.rec-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rec-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
}
.rec-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rec-head {
  display: flex;
  align-items: center;
  gap: 10px;
}
.dish-name {
  font-weight: 600;
  font-size: 15px;
}
.match-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-dark);
  background: var(--primary-light);
  border-radius: 12px;
  padding: 2px 10px;
  white-space: nowrap;
}
.rec-ingredients {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ing-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 12px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.ing-chip em {
  font-style: normal;
  font-size: 11px;
  opacity: 0.85;
}
.ing-chip.hit.near {
  background: #fff3e0;
  color: #ef6c00;
  border-color: #ffcc80;
}
.ing-chip.hit.expired {
  background: #ffebee;
  color: #c62828;
  border-color: #ef9a9a;
}
.ing-chip.miss {
  background: var(--surface-2);
  color: var(--text-2);
  border-color: var(--border);
}
.rec-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
}
.rec-action {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
}
.flash {
  font-size: 12px;
  color: var(--primary-dark);
  white-space: nowrap;
}
.challenge {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.ch-head {
  display: flex;
  gap: 12px;
  align-items: center;
}
.ch-head .emoji {
  font-size: 32px;
}
.info .name {
  font-weight: 600;
}
.small {
  font-size: 12px;
}
.dish-pick {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.dish-pick select,
.dish-pick input {
  padding: 9px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 14px;
}
.done {
  text-align: center;
  padding: 12px;
  background: var(--primary-light);
  border-radius: 8px;
  font-weight: 600;
  color: var(--primary-dark);
}
.records {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.rec-row {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  font-size: 13px;
}
.rec-row:last-child {
  border-bottom: none;
}
</style>
