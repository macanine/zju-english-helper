'use client'

import * as React from 'react'

import { loadPrefs, type Prefs } from './storage'

/** 朗读英文。语音与语速取自设置页偏好：指定 voiceURI；
    未指定时自动挑英音（en-GB）女声，没有再退到任意英文声。
    opts.queue = 排队播放（不取消正在播的内容），用于「打完单词再读一遍」这类衔接朗读 */
export function speak(text: string, opts?: { queue?: boolean; voiceURI?: string | null }) {
  try {
    const synth = window.speechSynthesis
    const prefs = loadPrefs()
    const u = new SpeechSynthesisUtterance(text)
    const voices = synth.getVoices()
    const voiceURI = opts?.voiceURI === undefined ? prefs.voiceURI : opts.voiceURI
    const voice = voiceURI
      ? (voices.find((v) => v.voiceURI === voiceURI) ?? null)
      : pickDefaultVoice(voices)
    if (voice) u.voice = voice
    u.lang = voice?.lang ?? 'en-GB'
    u.rate = prefs.rate
    if (!opts?.queue) synth.cancel()
    synth.speak(u)
  } catch {
    /* 无可用语音引擎时静默忽略 */
  }
}

const FEMALE_RE = /female|kate|serena|stephanie|libby|sonia|maisie|ava|zira|hazel|emily|charlotte|olivia|samantha|fiona|moira|tessa/i
const MALE_RE = /\bmale\b|daniel|david|george|fred|tom|aaron|arthur|oliver|rishi/i

/** 默认语音：英音（en-GB）女声优先，其次任意英文女声，再退到任意英文声 */
export function pickDefaultVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en'))
  if (en.length === 0) return null
  const score = (v: SpeechSynthesisVoice) => {
    const lang = v.lang.toLowerCase().replace('_', '-')
    let s = lang === 'en-gb' ? 2 : 1
    if (FEMALE_RE.test(v.name)) s += 2
    if (MALE_RE.test(v.name)) s -= 2
    return s
  }
  return en.reduce((best, v) => (score(v) > score(best) ? v : best), en[0])
}

/** 当前环境是否支持朗读（挂载后才检测，避免水合不一致） */
export function useCanSpeak(): boolean {
  const [can, setCan] = React.useState(false)
  React.useEffect(() => setCan('speechSynthesis' in window), [])
  return can
}

/** 系统可用语音列表（浏览器异步加载，监听 voiceschanged） */
export function useVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = React.useState<SpeechSynthesisVoice[]>([])
  React.useEffect(() => {
    if (!('speechSynthesis' in window)) return
    const update = () => {
      setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('en')))
    }
    update()
    window.speechSynthesis.addEventListener('voiceschanged', update)
    return () => window.speechSynthesis.removeEventListener('voiceschanged', update)
  }, [])
  return voices
}

export type { Prefs }
