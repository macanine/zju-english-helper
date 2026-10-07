'use client'

import * as React from 'react'

import {
  DEFAULT_SPEECH_SETTINGS,
  SPEECH_PROVIDER_IDS,
  loadPrefs,
  loadSpeechSettings,
  saveSpeechSettings,
  type SpeechProviderId,
} from './storage'

export interface SpeechVoice {
  id: string
  name: string
  locale: string
  gender: string | null
}

export interface SpeechProviderOption {
  id: SpeechProviderId
  name: string
  description: string
  baseUrl: string
}

export const SPEECH_PROVIDERS: readonly SpeechProviderOption[] = [
  {
    id: 'domestic',
    name: '国内',
    description: '中国大陆节点，连接更快',
    baseUrl: 'https://42.192.39.35:8900',
  },
  {
    id: 'international',
    name: '国际',
    description: 'Edge TTS 国际节点',
    baseUrl: 'https://tts.ukraine.us.ci',
  },
]

export type SpeechProviderStatus = 'checking' | 'available' | 'unavailable'

export interface SpeechProviderState {
  providerId: SpeechProviderId
  provider: SpeechProviderOption
  providers: readonly SpeechProviderOption[]
  status: SpeechProviderStatus
  voices: SpeechVoice[]
  error: string | null
  selectProvider: (providerId: SpeechProviderId) => void
}

interface SpeechProvider {
  probe(signal: AbortSignal): Promise<void>
  listVoices(signal: AbortSignal): Promise<SpeechVoice[]>
  synthesize(text: string, voice: string, signal: AbortSignal): Promise<Blob>
}

interface ProviderCache {
  voices: SpeechVoice[]
  voicesCachedAt: number
  status: SpeechProviderStatus
  error: string | null
  request: Promise<void> | null
}

const DEFAULT_EDGE_VOICE = 'en-GB-SoniaNeural'
const REQUEST_TIMEOUT_MS = 8000
const VOICE_CACHE_MS = 10 * 60 * 1000
const providerOptions = new Map(SPEECH_PROVIDERS.map((provider) => [provider.id, provider]))

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, timeout = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeout)
  return work(controller.signal).finally(() => window.clearTimeout(timer))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function getProvider(providerId: SpeechProviderId): SpeechProviderOption {
  return providerOptions.get(providerId) ?? providerOptions.get(DEFAULT_SPEECH_SETTINGS.provider)!
}

function providerUrl(providerId: SpeechProviderId, path: string) {
  return `${getProvider(providerId).baseUrl}${path}`
}

function createProvider(providerId: SpeechProviderId): SpeechProvider {
  return {
    async probe(signal) {
      const response = await fetch(providerUrl(providerId, '/health'), { signal, cache: 'no-store' })
      if (!response.ok) throw new Error(`健康检查失败（${response.status}）`)
      const data: unknown = await response.json()
      if (!isRecord(data) || data.ok !== true) throw new Error('健康检查响应无效')
    },

    async listVoices(signal) {
      const response = await fetch(providerUrl(providerId, '/voices'), { signal, cache: 'no-store' })
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
      const response = await fetch(providerUrl(providerId, '/tts'), {
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
}

const providers = new Map(
  SPEECH_PROVIDER_IDS.map((providerId) => [providerId, createProvider(providerId)]),
)
const providerCaches = new Map<SpeechProviderId, ProviderCache>()

function getProviderCache(providerId: SpeechProviderId): ProviderCache {
  const existing = providerCaches.get(providerId)
  if (existing) return existing
  const cache: ProviderCache = {
    voices: [],
    voicesCachedAt: 0,
    status: 'checking',
    error: null,
    request: null,
  }
  providerCaches.set(providerId, cache)
  return cache
}

function providerSnapshot(providerId: SpeechProviderId): Omit<SpeechProviderState, 'selectProvider'> {
  const cache = getProviderCache(providerId)
  return {
    providerId,
    provider: getProvider(providerId),
    providers: SPEECH_PROVIDERS,
    status: cache.status,
    voices: cache.voices,
    error: cache.error,
  }
}

async function ensureProvider(providerId: SpeechProviderId): Promise<void> {
  const cache = getProviderCache(providerId)
  if (cache.status === 'available' && cache.voices.length > 0 &&
      Date.now() - cache.voicesCachedAt < VOICE_CACHE_MS) return
  if (cache.request) return cache.request

  cache.status = 'checking'
  cache.error = null
  cache.request = withTimeout((signal) => providers.get(providerId)!.probe(signal))
    .then(() => withTimeout((signal) => providers.get(providerId)!.listVoices(signal)))
    .then((voices) => {
      cache.voices = voices
      cache.voicesCachedAt = Date.now()
      cache.status = 'available'
    })
    .catch((error: unknown) => {
      cache.status = 'unavailable'
      cache.error = error instanceof Error ? error.message : '云端语音不可用'
      throw error
    })
    .finally(() => {
      cache.request = null
    })
  return cache.request
}

/** 设置页与练习页共享每个 provider 的探测和音色缓存。 */
export function useSpeechProvider(): SpeechProviderState {
  const [providerId, setProviderId] = React.useState<SpeechProviderId>(DEFAULT_SPEECH_SETTINGS.provider)
  const [state, setState] = React.useState(() => providerSnapshot(DEFAULT_SPEECH_SETTINGS.provider))

  React.useEffect(() => {
    try {
      setProviderId(loadSpeechSettings().provider)
    } catch {
      setProviderId(DEFAULT_SPEECH_SETTINGS.provider)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    setState(providerSnapshot(providerId))
    void ensureProvider(providerId)
      .catch(() => undefined)
      .finally(() => {
        if (!cancelled) setState(providerSnapshot(providerId))
      })
    return () => { cancelled = true }
  }, [providerId])

  const selectProvider = React.useCallback((nextProviderId: SpeechProviderId) => {
    if (nextProviderId === providerId) return
    saveSpeechSettings({ provider: nextProviderId })
    stopSpeaking()
    setProviderId(nextProviderId)
  }, [providerId])

  return { ...state, selectProvider }
}

export function loadSpeechVoices(providerId?: SpeechProviderId): Promise<SpeechVoice[]> {
  const selectedProviderId = providerId ?? loadSpeechSettings().provider
  return ensureProvider(selectedProviderId).then(() => getProviderCache(selectedProviderId).voices)
}

interface SpeechRequest {
  text: string
  rate: number
  voice: string
  providerId: SpeechProviderId
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
    await ensureProvider(request.providerId)
    const blob = await withTimeout((signal) => providers.get(request.providerId)!.synthesize(
      request.text,
      request.voice,
      signal,
    ))
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
  const speechSettings = loadSpeechSettings()
  const voice = opts?.voiceURI || prefs.voiceURI || DEFAULT_EDGE_VOICE
  const request: SpeechRequest = {
    text,
    rate: prefs.rate,
    voice,
    providerId: speechSettings.provider,
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
