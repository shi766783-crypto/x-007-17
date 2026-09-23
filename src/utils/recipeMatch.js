// 菜谱匹配：根据临期/过期食材反查能用得上的菜谱
// 匹配规则：菜谱食材与待清理食材按名称匹配（忽略大小写与首尾空格），
// 至少命中 1 种食材的菜谱才推荐，按命中数量降序，越紧急越靠前。

function norm(name) {
  return String(name || '').trim().toLowerCase()
}

// 由食材列表建立名称 -> 食材（同名取最紧急的一条）
function buildIngredientIndex(items) {
  const map = new Map()
  items.forEach((item) => {
    const key = norm(item.name)
    if (!key) return
    const prev = map.get(key)
    if (!prev || item.remain < prev.remain) map.set(key, item)
  })
  return map
}

/**
 * 匹配菜谱
 * @param {Array} dishes 菜谱列表（mealPlan.dishes）
 * @param {Array} items 待清理食材（withExpiry 后的临期/过期项，含 status/remain）
 * @returns {Array<{
 *   dish, matchCount, totalCount, matchRate,
 *   matched: Array, missing: Array, minRemain
 * }>} 按匹配度排序的结果
 */
export function matchRecipes(dishes, items) {
  const index = buildIngredientIndex(items)
  if (!index.size) return []

  const results = []
  dishes.forEach((dish) => {
    // 同名食材去重，避免菜谱里重复写同一种食材导致计数虚高
    const seen = new Set()
    const matched = []
    const missing = []

    ;(dish.ingredients || []).forEach((ing) => {
      const key = norm(ing.name)
      if (!key || seen.has(key)) return
      seen.add(key)
      const hit = index.get(key)
      if (hit) {
        matched.push({
          name: ing.name.trim(),
          quantity: ing.quantity,
          unit: ing.unit,
          status: hit.status,
          remain: hit.remain,
        })
      } else {
        missing.push({ name: ing.name.trim(), quantity: ing.quantity, unit: ing.unit })
      }
    })

    if (!matched.length) return

    const totalCount = matched.length + missing.length
    results.push({
      dish,
      matched,
      missing,
      matchCount: matched.length,
      totalCount,
      matchRate: totalCount ? matched.length / totalCount : 0,
      // 命中食材中最紧急的剩余天数（越小越紧急），用于次级排序
      minRemain: Math.min(...matched.map((m) => m.remain)),
    })
  })

  // 命中数多 → 紧急 → 缺的食材少 → 菜谱新建顺序稳定排序
  return results.sort((a, b) => {
    if (b.matchCount !== a.matchCount) return b.matchCount - a.matchCount
    if (a.minRemain !== b.minRemain) return a.minRemain - b.minRemain
    if (a.missing.length !== b.missing.length) return a.missing.length - b.missing.length
    return 0
  })
}
