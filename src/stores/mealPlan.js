import { defineStore } from 'pinia'
import { read, write } from '@/utils/storage'
import { uid } from '@/utils/id'
import { currentWeekKey, currentWeekStart, toDateKey } from '@/utils/date'
import { WEEK_DAYS, MEALS } from '@/constants'

const DISH_KEY = 'dishes'
const PLAN_KEY = 'plan'

function createDish(data) {
  return {
    id: uid('dish'),
    name: '',
    category: '蔬菜',
    ingredients: [], // [{ ingredientId|null, name, quantity, unit }]
    instructions: '',
    cookTime: 15,
    difficulty: '简单',
    publishedAt: new Date().toISOString(),
    ...data,
  }
}

function emptyWeek() {
  const days = {}
  WEEK_DAYS.forEach((d) => {
    days[d.key] = { breakfast: [], lunch: [], dinner: [] }
  })
  return days
}

export const useMealPlanStore = defineStore('mealPlan', {
  state: () => ({
    dishes: read(DISH_KEY, []),
    // { [weekKey]: { [dayKey]: { breakfast: [], lunch: [], dinner: [] } } }
    plan: read(PLAN_KEY, {}),
  }),

  getters: {
    totalDishes: (state) => state.dishes.length,

    // 当前周计划（只读，缺省返回空结构，不产生副作用）
    currentWeek() {
      const key = currentWeekKey()
      return { key, days: this.plan[key] || emptyWeek() }
    },

    // 已安排菜品的餐次数量
    plannedMeals() {
      const { days } = this.currentWeek
      let count = 0
      WEEK_DAYS.forEach((d) => {
        MEALS.forEach((m) => {
          const key = mealKey(m)
          if (days[d.key][key].length > 0) count++
        })
      })
      return count
    },

    // 菜品 id -> 对象映射
    dishMap() {
      const map = {}
      this.dishes.forEach((d) => (map[d.id] = d))
      return map
    },

    // 本周所需食材总量（按名称+单位聚合）
    weeklyRequirements() {
      const agg = {} // key: `${name}|${unit}`
      const dishMap = this.dishMap
      const { days } = this.currentWeek
      WEEK_DAYS.forEach((d) => {
        MEALS.forEach((m) => {
          days[d.key][mealKey(m)].forEach((dishId) => {
            const dish = dishMap[dishId]
            if (!dish) return
            dish.ingredients.forEach((ing) => {
              const key = `${ing.name}|${ing.unit}`
              if (!agg[key]) {
                agg[key] = {
                  name: ing.name,
                  unit: ing.unit,
                  ingredientId: ing.ingredientId || null,
                  required: 0,
                }
              }
              agg[key].required += Number(ing.quantity || 0)
            })
          })
        })
      })
      return Object.values(agg)
    },

    // 本周涉及菜品的营养类别占比
    weekDishCategories() {
      const dishMap = this.dishMap
      const cats = []
      const { days } = this.currentWeek
      WEEK_DAYS.forEach((d) => {
        MEALS.forEach((m) => {
          days[d.key][mealKey(m)].forEach((dishId) => {
            const dish = dishMap[dishId]
            if (dish) cats.push(dish.category)
          })
        })
      })
      return cats
    },
  },

  actions: {
    persistDishes() {
      write(DISH_KEY, this.dishes)
    },
    persistPlan() {
      write(PLAN_KEY, this.plan)
    },

    addDish(data) {
      const dish = createDish(data)
      this.dishes.unshift(dish)
      this.persistDishes()
      return dish
    },

    updateDish(id, patch) {
      const idx = this.dishes.findIndex((d) => d.id === id)
      if (idx === -1) return
      this.dishes[idx] = { ...this.dishes[idx], ...patch }
      this.persistDishes()
    },

    removeDish(id) {
      this.dishes = this.dishes.filter((d) => d.id !== id)
      // 从所有计划中移除引用
      Object.values(this.plan).forEach((week) => {
        WEEK_DAYS.forEach((d) => {
          MEALS.forEach((m) => {
            const k = mealKey(m)
            week[d.key][k] = week[d.key][k].filter((dishId) => dishId !== id)
          })
        })
      })
      this.persistDishes()
      this.persistPlan()
    },

    // 将菜品安排到某餐次（存在则移除，实现切换）
    toggleDish(weekKey, dayKey, meal, dishId) {
      const week = this.plan[weekKey] || (this.plan[weekKey] = emptyWeek())
      const k = mealKey(meal)
      const slot = week[dayKey][k]
      const idx = slot.indexOf(dishId)
      if (idx === -1) slot.push(dishId)
      else slot.splice(idx, 1)
      this.persistPlan()
    },

    clearSlot(weekKey, dayKey, meal) {
      const week = this.plan[weekKey]
      if (!week) return
      week[dayKey][mealKey(meal)] = []
      this.persistPlan()
    },

    // 查询菜品在指定周已安排的餐次（用于避免重复推荐）
    findDishSlots(weekKey, dishId) {
      const week = this.plan[weekKey]
      if (!week) return []
      const slots = []
      WEEK_DAYS.forEach((d) => {
        MEALS.forEach((m) => {
          if (week[d.key][mealKey(m)].includes(dishId)) {
            slots.push({ day: d.key, dayLabel: d.label, meal: m })
          }
        })
      })
      return slots
    },

    // 一键安排：从今天起找第一个未包含该菜的空餐次（优先今天，越早越好）；
    // 本周餐次都占满时追加到今天的晚餐。返回安排位置信息。
    scheduleDishThisWeek(dishId, today = new Date()) {
      const key = currentWeekKey(today)
      const week = this.plan[key] || (this.plan[key] = emptyWeek())

      const todayKey = toDateKey(today)
      const weekDates = WEEK_DAYS.map((d, i) => {
        const start = new Date(currentWeekStart(today))
        start.setDate(start.getDate() + i)
        return { day: d.key, label: d.label, dateKey: toDateKey(start) }
      })
      const todayIdx = Math.max(0, weekDates.findIndex((d) => d.dateKey === todayKey))
      const orderedDays = [
        ...weekDates.slice(todayIdx),
        ...weekDates.slice(0, todayIdx),
      ]

      for (const d of orderedDays) {
        for (const meal of MEALS) {
          const k = mealKey(meal)
          const slot = week[d.day][k]
          if (slot.includes(dishId)) {
            this.persistPlan()
            return { weekKey: key, day: d.day, dayLabel: d.label, meal, duplicated: true }
          }
          if (slot.length === 0) {
            slot.push(dishId)
            this.persistPlan()
            return { weekKey: key, day: d.day, dayLabel: d.label, meal, duplicated: false }
          }
        }
      }

      // 没有空餐次：追加到今天的晚餐（能走到这里说明本周未排过此菜）
      const todayDay = weekDates[todayIdx]
      week[todayDay.day].dinner.push(dishId)
      this.persistPlan()
      return { weekKey: key, day: todayDay.day, dayLabel: todayDay.label, meal: '晚餐', duplicated: false }
    },
  },
})

function mealKey(meal) {
  return { 早餐: 'breakfast', 午餐: 'lunch', 晚餐: 'dinner' }[meal] || meal
}
