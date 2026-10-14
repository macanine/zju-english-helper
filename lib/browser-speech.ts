'use client'

import type { SpeechVoice } from './speech'

const VOICE_LOAD_TIMEOUT_MS = 2000

export function getBrowserSpeech(): SpeechSynthesis {
  if (typeof window === 'undefined' || !window.speechSynthesis || !window.SpeechSynthesisUtterance) {
    throw new Error('当前浏览器不支持本地语音朗读')
  }
  return window.speechSynthesis
}

function englishVoices(speech: SpeechSynthesis) {
  return speech.getVoices()
    .filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang))
    .sort((a, b) => Number(b.localService) - Number(a.localService) ||
      Number(/^en[-_]GB$/i.test(b.lang)) - Number(/^en[-_]GB$/i.test(a.lang)) ||
      Number(b.default) - Number(a.default))
}

/** 部分浏览器首次返回空列表，需要等待 voiceschanged。 */
export function loadBrowserVoices(signal: AbortSignal): Promise<SpeechVoice[]> {
  const speech = getBrowserSpeech()
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer)
      speech.removeEventListener('voiceschanged', check)
      signal.removeEventListener('abort', abort)
    }
    const check = () => {
      const voices = englishVoices(speech)
      if (voices.length === 0) return
      cleanup()
      resolve(voices.map((voice) => ({
        id: voice.voiceURI,
        name: voice.name,
        locale: voice.lang.replace(/_/g, '-'),
        gender: null,
      })))
    }
    const abort = () => {
      cleanup()
      reject(new Error('浏览器音色加载已取消'))
    }
    const timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('浏览器没有可用的英文音色，请检查系统语音设置'))
    }, VOICE_LOAD_TIMEOUT_MS)
    speech.addEventListener('voiceschanged', check)
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()
    else check()
  })
}

export function createBrowserUtterance(text: string, voiceURI: string | null, rate: number) {
  const voices = englishVoices(getBrowserSpeech())
  const localVoices = voices.filter((voice) => voice.localService)
  const preferred = localVoices.length > 0 ? localVoices : voices
  const voice = voices.find((item) => item.voiceURI === voiceURI) ??
    preferred.find((item) => /^en[-_]GB$/i.test(item.lang)) ??
    preferred.find((item) => item.default) ?? preferred[0]
  if (!voice) throw new Error('浏览器没有可用的英文音色，请检查系统语音设置')

  const utterance = new window.SpeechSynthesisUtterance(text)
  utterance.voice = voice
  utterance.lang = voice.lang
  utterance.rate = rate
  return utterance
}
