// 菜谱匹配：根据需要消耗的库存食材（临期/过期），反查哪些菜谱用得上它们

// 食材名称归一化：去首尾空格、忽略大小写
function normName(name) {
  return String(name || '').trim().toLowerCase()
}

// 判断菜谱中的食材行是否对应某个库存食材（优先 ingredientId，其次按名称）
export function isSameIngredient(ingredient, item) {
  if (ingredient.ingredientId && item.id && ingredient.ingredientId === item.id) {
    return true
  }
  const a = normName(ingredient.name)
  return a !== '' && a === normName(item.name)
}

// 在给定库存列表中查找菜谱食材对应的库存项
export function findStockItem(ingredient, items) {
  return items.find((item) => isSameIngredient(ingredient, item)) || null
}

/**
 * 根据目标食材反查菜谱
 * @param {Array} dishes 菜谱列表（mealPlan.dishes）
 * @param {Array} targets 需要消耗的库存食材（inventory.withExpiry 结构）
 * @param {Array} [allItems] 全部库存，用于判断菜谱的其它食材是否手头就有
 * @returns {Array} 仅包含命中 ≥1 种目标食材的菜谱，按匹配度从高到低排序
 */
export function matchDishes(dishes, targets, allItems = []) {
  const results = []

  for (const dish of dishes) {
    const matchedItemIds = new Set()
    const matched = [] // 命中的目标食材：{ ingredient, item }
    const others = [] // 菜谱里的其它食材：{ ingredient, inStock }

    for (const ingredient of dish.ingredients || []) {
      const hit = targets.find(
        (item) => !matchedItemIds.has(item.id) && isSameIngredient(ingredient, item),
      )
      if (hit) {
        matchedItemIds.add(hit.id)
        matched.push({ ingredient, item: hit })
      } else {
        others.push({ ingredient, inStock: !!findStockItem(ingredient, allItems) })
      }
    }

    if (!matched.length) continue

    const expiredCount = matched.filter((m) => m.item.status === 'expired').length
    // 紧急度：过期食材权重最高；临期食材剩余天数越少越靠前
    const urgency = matched.reduce((sum, m) => {
      if (m.item.status === 'expired') return sum + 100
      return sum + 10 - Math.max(0, m.item.remain || 0)
    }, 0)

    results.push({
      dish,
      matched,
      others,
      matchedCount: matched.length,
      expiredCount,
      nearCount: matched.length - expiredCount,
      urgency,
      ratio: dish.ingredients && dish.ingredients.length
        ? matched.length / dish.ingredients.length
        : 0,
    })
  }

  // 排序规则：命中食材数量 → 紧急度 → 食材覆盖率 → 烹饪用时
  results.sort(
    (a, b) =>
      b.matchedCount - a.matchedCount ||
      b.urgency - a.urgency ||
      b.ratio - a.ratio ||
      (a.dish.cookTime || 0) - (b.dish.cookTime || 0),
  )

  return results
}
