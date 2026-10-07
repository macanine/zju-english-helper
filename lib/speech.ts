'use client'

import * as React from 'react'

import { loadPrefs } from './storage'

export interface SpeechVoice {
  id: string
  name: string
  locale: string
  gender: string | null
}

export type SpeechProviderStatus = 'checking' | 'available' | 'unavailable'

export interface SpeechProviderState {
  status: SpeechProviderStatus
  voices: SpeechVoice[]
  error: string | null
}

interface SpeechProvider {
  probe(signal: AbortSignal): Promise<void>
  listVoices(signal: AbortSignal): Promise<SpeechVoice[]>
  synthesize(text: string, voice: string, signal: AbortSignal): Promise<Blob>
}

const EDGE_TTS_BASE_URL = 'https://tts.ukraine.us.ci'
const DEFAULT_EDGE_VOICE = 'en-GB-SoniaNeural'
const REQUEST_TIMEOUT_MS = 8000
const VOICE_CACHE_MS = 10 * 60 * 1000

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  return work(controller.signal).finally(() => window.clearTimeout(timer))
}

function edgeUrl(path: string) {
  return `${EDGE_TTS_BASE_URL}${path}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

const edgeProvider: SpeechProvider = {
  async probe(signal) {
    const response = await fetch(edgeUrl('/health'), { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`健康检查失败（${response.status}）`)
    const data: unknown = await response.json()
    if (!isRecord(data) || data.ok !== true) throw new Error('健康检查响应无效')
  },

  async listVoices(signal) {
    const response = await fetch(edgeUrl('/voices'), { signal, cache: 'no-store' })
    if (!response.ok) throw new Error(`音色列表加载失败（${response.status}）`)
    const data: unknown = await response.json()
    if (!isRecord(data) || !Array.isArray(data.voices)) throw new Error('音色列表响应无效')

    const voices = data.voices.map((voice): SpeechVoice => {
      if (!isRecord(voice) || typeof voice.ShortName !== 'string' ||
          typeof voice.FriendlyName !== 'string' || typeof voice.Locale !== 'string') {
        throw new Error('音色列表包含无效条目')
      }
      return {
        id: voice.ShortName,
        name: voice.FriendlyName,
        locale: voice.Locale,
        gender: typeof voice.Gender === 'string' ? voice.Gender : null,
      }
    })

    const englishVoices = voices.filter((voice) => voice.locale.toLowerCase().startsWith('en-'))
    if (englishVoices.length === 0) throw new Error('云端语音没有可用的英文音色')
    return englishVoices
  },

  async synthesize(text, voice, signal) {
    const response = await fetch(edgeUrl('/tts'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
      signal,
    })
    if (!response.ok) throw new Error(`语音合成失败（${response.status}）`)
    const contentType = response.headers.get('content-type')?.toLowerCase()
    if (contentType !== 'audio/mpeg') throw new Error('语音接口没有返回 MP3')
    return response.blob()
  },
}

let cachedVoices: SpeechVoice[] = []
let voicesCachedAt = 0
let providerStatus: SpeechProviderStatus = 'checking'
let providerError: string | null = null
let providerRequest: Promise<void> | null = null

function providerSnapshot(): SpeechProviderState {
  return { status: providerStatus, voices: cachedVoices, error: providerError }
}

async function ensureProvider(): Promise<void> {
  if (providerStatus === 'available' && cachedVoices.length > 0 &&
      Date.now() - voicesCachedAt < VOICE_CACHE_MS) return
  if (providerRequest) return providerRequest

  providerStatus = 'checking'
  providerError = null
  providerRequest = withTimeout((signal) => edgeProvider.probe(signal))
    .then(() => withTimeout((signal) => edgeProvider.listVoices(signal)))
    .then((voices) => {
      cachedVoices = voices
      voicesCachedAt = Date.now()
      providerStatus = 'available'
    })
    .catch((error: unknown) => {
      providerStatus = 'unavailable'
      providerError = error instanceof Error ? error.message : '云端语音不可用'
      throw error
    })
    .finally(() => {
      providerRequest = null
    })
  return providerRequest
}

/** 设置页与练习页共享同一次 provider 探测，不提供浏览器 TTS 降级。 */
export function useSpeechProvider(): SpeechProviderState {
  const [state, setState] = React.useState<SpeechProviderState>(providerSnapshot)

  React.useEffect(() => {
    let cancelled = false
    void ensureProvider()
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setState(providerSnapshot())
      })
    return () => { cancelled = true }
  }, [])

  return state
}

export function loadSpeechVoices(): Promise<SpeechVoice[]> {
  return ensureProvider().then(() => cachedVoices)
}

interface SpeechRequest {
  text: string
  rate: number
  voice: string
  onStatus?: (status: 'loading' | 'ready') => void
  onError?: (error: Error) => void
}

let activeAudio: HTMLAudioElement | null = null
let activeObjectUrl: string | null = null
let activeRequest: SpeechRequest | null = null
let audioQueue: SpeechRequest[] = []
let playbackGeneration = 0

function finalizeRequest(request: SpeechRequest) {
  request.onStatus?.('ready')
  if (activeRequest === request) activeRequest = null
}

function stopAudio() {
  playbackGeneration += 1
  if (activeRequest) finalizeRequest(activeRequest)
  activeAudio?.pause()
  activeAudio = null
  activeRequest = null
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl)
  activeObjectUrl = null
  audioQueue = []
}

/** 停止当前朗读、排队内容和正在请求的合成。 */
export function stopSpeaking() {
  if (typeof window === 'undefined') return
  stopAudio()
}

function finishAudio(audio: HTMLAudioElement, request: SpeechRequest) {
  if (activeAudio !== audio) return
  activeAudio = null
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl)
  activeObjectUrl = null
  finalizeRequest(request)
  const next = audioQueue.shift()
  if (next) void playRequest(next, playbackGeneration)
}

async function playRequest(request: SpeechRequest, generation = playbackGeneration) {
  activeRequest = request
  request.onStatus?.('loading')
  let objectUrl: string | null = null
  let audio: HTMLAudioElement | null = null

  try {
    await ensureProvider()
    const blob = await withTimeout((signal) => edgeProvider.synthesize(request.text, request.voice, signal))
    if (generation !== playbackGeneration) {
      finalizeRequest(request)
      return
    }

    objectUrl = URL.createObjectURL(blob)
    audio = new Audio(objectUrl)
    audio.playbackRate = request.rate
    activeAudio = audio
    activeObjectUrl = objectUrl
    audio.addEventListener('ended', () => finishAudio(audio!, request), { once: true })
    await audio.play()
    if (generation === playbackGeneration) finalizeRequest(request)
  } catch (error: unknown) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    if (activeAudio === audio) activeAudio = null
    if (activeObjectUrl === objectUrl) activeObjectUrl = null
    if (generation === playbackGeneration) {
      finalizeRequest(request)
      request.onError?.(error instanceof Error ? error : new Error('语音播放失败'))
    }
    const next = audioQueue.shift()
    if (next && generation === playbackGeneration) void playRequest(next, playbackGeneration)
  }
}

export function speak(text: string, opts?: {
  queue?: boolean
  voiceURI?: string | null
  onStatus?: (status: 'loading' | 'ready') => void
  onError?: (error: Error) => void
}) {
  if (typeof window === 'undefined' || !text.trim()) return
  const prefs = loadPrefs()
  const voice = opts?.voiceURI || prefs.voiceURI || DEFAULT_EDGE_VOICE
  const request: SpeechRequest = {
    text,
    rate: prefs.rate,
    voice,
    onStatus: opts?.onStatus,
    onError: opts?.onError,
  }

  if (opts?.queue && activeRequest) {
    audioQueue.push(request)
    return
  }
  if (!opts?.queue) stopAudio()
  void playRequest(request)
}

export type { Prefs } from './storage'
