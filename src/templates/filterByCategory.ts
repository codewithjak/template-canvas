/**
 * filterByCategory.ts — the Templates page's chip filter (relayout doc T3.5).
 *
 * Pure and React-free, so the filtering rules are testable without rendering:
 * the page renders whatever these return and decides nothing itself.
 */
import type { BuiltinTemplate, BuiltinCategory } from './registry'

/** The pseudo-category for "don't filter". Not a real `BuiltinCategory`. */
export const ALL_CATEGORIES = 'All' as const
export type CategoryFilter = BuiltinCategory | typeof ALL_CATEGORIES

/**
 * The categories actually present in the given templates, in first-seen order,
 * with `All` first.
 *
 * Derived from the templates rather than hard-coded, so adding a built-in with a
 * new category makes its chip appear on its own — and, just as important, a
 * category with no templates never gets a chip that filters to an empty page.
 */
export function categoriesOf(templates: readonly BuiltinTemplate[]): readonly CategoryFilter[] {
  const seen: CategoryFilter[] = [ALL_CATEGORIES]
  for (const t of templates) {
    if (!seen.includes(t.category)) seen.push(t.category)
  }
  return seen
}

export function filterByCategory(
  templates: readonly BuiltinTemplate[],
  category: CategoryFilter,
): readonly BuiltinTemplate[] {
  if (category === ALL_CATEGORIES) return templates
  return templates.filter((t) => t.category === category)
}
