// The category picker's suggestions from a product's name (101, R11). Pure, shared by shop-web and its tests:
// a leaf-name or synonym hit outranks a hit on an ancestor's name; ties go to the deeper leaf, then the name.

export interface SuggestLeaf {
  id: string
  name: string
  /** Names from the department down to this leaf. */
  path: string[]
  synonyms: string[]
}

const STOP = new Set([
  "a", "an", "and", "the", "of", "for", "with", "in", "on", "to", "by", "x", "pack", "pk", "each", "ea", "new",
  "g", "kg", "mg", "ml", "l", "lt", "cm", "mm", "m", "w", "v", "mah", "gb", "tb", "oz", "lb", "pcs", "piece", "pieces",
])

/** One word's simple singular: berries → berry, tomatoes → tomato, boxes → box, oats → oat; "glass" stays. */
export function singular(word: string): string {
  if (word.length <= 3) return word
  if (word.endsWith("ies") && word.length > 4) return `${word.slice(0, -3)}y`
  if (/(ch|sh|x|z|ss)es$/.test(word)) return word.slice(0, -2)
  if (word.endsWith("oes")) return word.slice(0, -2)
  if (word.endsWith("s") && !word.endsWith("ss") && !word.endsWith("us") && !word.endsWith("is")) return word.slice(0, -1)
  return word
}

/** Lower-case words, singular, without numbers, units or filler. */
export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " ")
    .replace(/['’]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0 && !/^\d/.test(w) && !STOP.has(w))
    .map(singular)
}

const LEAF_WORD = 10
const SYNONYM = 10
const ANCESTOR_WORD = 2

/** Every word of `phrase` appears in `words`. */
const covers = (words: Set<string>, phrase: string[]) => phrase.length > 0 && phrase.every((w) => words.has(w))

/**
 * How telling a word is: rare across the leaves' own names and synonyms weighs more ("paracetamol" over
 * "tablet", "spinach" over "baby"). 1 for a word on every leaf, growing as it gets rarer.
 */
const rarityCache = new WeakMap<readonly SuggestLeaf[], (w: string) => number>()
function rarityOf(leaves: readonly SuggestLeaf[]): (w: string) => number {
  const cached = rarityCache.get(leaves)
  if (cached) return cached
  const df = new Map<string, number>()
  for (const leaf of leaves) {
    for (const w of new Set([...tokens(leaf.name), ...leaf.synonyms.flatMap(tokens)])) df.set(w, (df.get(w) ?? 0) + 1)
  }
  const n = Math.max(leaves.length, 1)
  const fn = (w: string) => (1 + Math.log(n / (df.get(w) ?? 1))) * (FORM.has(w) ? FORM_WEIGHT : 1)
  rarityCache.set(leaves, fn)
  return fn
}

/** Words that mostly say how a thing is packed or dosed: they weigh little ("Paracetamol Tablets" is paracetamol). */
const FORM = new Set([
  "tablet", "capsule", "bottle", "can", "jar", "bag", "box", "roll", "sheet", "pouch", "punnet", "tub", "tube", "sachet",
  "carton", "packet", "multipack", "bundle", "refill", "spray", "stick", "set",
])

/** "Potatoes, Onions & Garlic" is three alternatives, each a whole name. */
const parts = (name: string) => name.split(/&|,|\band\b|\//i).map(tokens).filter((p) => p.length > 0)

const FORM_WEIGHT = 0.3

function score(words: Set<string>, leaf: SuggestLeaf, rarity: (w: string) => number): number {
  let s = 0
  const leafWords = tokens(leaf.name)
  const hits = leafWords.filter((w) => words.has(w))
  s += hits.reduce((t, w) => t + rarity(w), 0) * LEAF_WORD
  // How much of the best-matching alternative the product covers: "Cola" beats "Lemonade & Flavoured Soft Drinks".
  const nameParts = parts(leaf.name)
  if (hits.length > 0) s += LEAF_WORD * Math.max(...nameParts.map((p) => p.filter((w) => words.has(w)).length / p.length))
  // A synonym adds only the words the name did not already score ("Tablets" with synonym "tablet" counts once).
  const scored = new Set(hits)
  for (const syn of leaf.synonyms) {
    const phrase = tokens(syn)
    if (phrase.length === 0) continue
    if (!covers(words, phrase)) continue
    const fresh = phrase.filter((w) => !scored.has(w))
    if (fresh.length === 0) continue
    s += fresh.reduce((t, w) => t + rarity(w), 0) * SYNONYM + SYNONYM
    for (const w of fresh) scored.add(w)
  }
  // Ancestors only lift a leaf that something else already matched, or break ties among weak matches.
  for (const name of leaf.path.slice(0, -1)) {
    s += tokens(name).filter((w) => words.has(w)).reduce((t, w) => t + rarity(w), 0) * ANCESTOR_WORD
  }
  return s
}

/** At most `limit` leaves, best first; nothing when the name matches nothing. */
export function suggestCategories(name: string, leaves: readonly SuggestLeaf[], limit = 5): SuggestLeaf[] {
  const words = new Set(tokens(name))
  if (words.size === 0) return []
  const rarity = rarityOf(leaves)
  return leaves
    .map((leaf) => ({ leaf, s: score(words, leaf, rarity) }))
    .filter((x) => x.s >= LEAF_WORD)
    .sort((a, b) => b.s - a.s || b.leaf.path.length - a.leaf.path.length || a.leaf.name.localeCompare(b.leaf.name))
    .slice(0, limit)
    .map((x) => x.leaf)
}

/** Leaves among the shop's taxonomy whose name, path or synonyms contain every typed word - the picker's search. */
export function searchLeaves(query: string, leaves: readonly SuggestLeaf[], limit = 50): SuggestLeaf[] {
  const q = tokens(query)
  if (q.length === 0) return []
  const hay = (l: SuggestLeaf) => new Set([...l.path.flatMap(tokens), ...l.synonyms.flatMap(tokens)])
  const prefix = (set: Set<string>, w: string) => set.has(w) || [...set].some((h) => h.startsWith(w))
  return leaves
    .filter((l) => {
      const h = hay(l)
      return q.every((w) => prefix(h, w))
    })
    .sort((a, b) => a.path.join(" ").localeCompare(b.path.join(" ")))
    .slice(0, limit)
}
