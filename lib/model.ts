export interface Sense {
  /** 词性（跟着释义走，如 'n. [C]'、'adj.'、'短语'；无标注为 null） */
  pos: string | null
  /** 中文释义（放前展示；源数据即纯中文） */
  zh: string
  /** 英文释义（源数据本就是纯中文的词条为空串） */
  en: string
  /** 例句（已去 e.g. 前缀），[[..]] 挖空，按句中变形词作答 */
  examples: string[]
}

/** 词库 v3 词条：同一单词的多个释义合并在 senses 里，词性也在释义上 */
export interface WordEntry {
  english: string
  senses: Sense[]
}

/**
 * 练习卡片。卡片以**单词**为单位记录（错题本 / 统计 / 已掌握都按词记），
 * `sense` 是本题对应的释义，`senses` 是该词的完整释义列表（提示与错题本展示用）。
 */
export interface SenseCard {
  english: string
  sense: Sense
  senses: Sense[]
}

/** 多义词的出题方式 */
export const MERGE_MODES = ['sense', 'first', 'all'] as const
export type MergeMode = (typeof MERGE_MODES)[number]

/**
 * 词库词条 → 练习卡片。
 *   sense：每个释义各考一遍（默认）
 *   first：同词只考一次，提示只给第一条释义（例句填空也用这个）
 *   all：  同词只考一次，提示里列出全部释义
 */
export function buildCards(words: WordEntry[], merge: MergeMode): SenseCard[] {
  const cards: SenseCard[] = []
  for (const word of words) {
    if (word.senses.length === 0) continue
    if (merge === 'sense') {
      for (const sense of word.senses) {
        cards.push({ english: word.english, sense, senses: word.senses })
      }
    } else {
      cards.push({ english: word.english, sense: word.senses[0], senses: word.senses })
    }
  }
  return cards
}

/** 取逗号前的干净英文（与原版 _get_clean_english 一致） */
export function cleanEnglish(english: string): string {
  return english.split(',')[0].trim()
}

/** 例句随机选一条（[[..]] 挖空） */
export function pickExample(examples: string[]): string {
  if (examples.length === 0) return ''
  return examples[Math.floor(Math.random() * examples.length)]
}

/** 取例句中 [[..]] 标记的词（即句子中实际出现的变形形式），按出现顺序返回 */
export function extractBlanks(sentence: string): string[] {
  return [...sentence.matchAll(/\[\[(.*?)\]\]/g)].map((m) => m[1])
}

/** 例句模式用：本题对应的释义里有没有可用的挖空例句 */
export function hasUsableExamples(card: SenseCard): boolean {
  return card.sense.examples.some((e) => e.includes('[['))
}
