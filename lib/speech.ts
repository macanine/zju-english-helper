'use client'

import * as React from 'react'

import { createBrowserUtterance, getBrowserSpeech, loadBrowserVoices } from './browser-speech'
import {
  DEFAULT_SPEECH_SETTINGS,
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
  baseUrl: string | null
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
  {
    id: 'browser',
    name: '本地浏览器',
    description: '使用浏览器内置的英文语音',
    baseUrl: null,
  },
]

export type SpeechProviderStatus = 'checking' | 'available' | 'unavailable'

export interface SpeechProviderState {
  providerId: SpeechProviderId
  provider: SpeechProviderOption
  activeProvider: SpeechProviderOption
  usingFallback: boolean
  providers: readonly SpeechProviderOption[]
  status: SpeechProviderStatus
  voices: SpeechVoice[]
  error: string | null
  selectProvider: (providerId: SpeechProviderId) => void
}

interface SpeechProvider {
  probe(signal: AbortSignal): Promise<void>
  listVoices(signal: AbortSignal): Promise<SpeechVoice[]>
}

interface EdgeSpeechProvider extends SpeechProvider {
  synthesize(text: string, voice: string, signal: AbortSignal): Promise<Blob>
}

interface ProviderCache {
  voices: SpeechVoice[]
  voicesCachedAt: number
  status: SpeechProviderStatus
  error: string | null
  request: Promise<void> | null
  retryAt: number
}

const DEFAULT_EDGE_VOICE = 'en-GB-SoniaNeural'
const REQUEST_TIMEOUT_MS = 8000
const VOICE_CACHE_MS = 10 * 60 * 1000
const PROVIDER_RETRY_MS = 30 * 1000
const providerOptions = new Map(SPEECH_PROVIDERS.map((provider) => [provider.id, provider]))
const providerListeners = new Set<() => void>()

function withTimeout<T>(work: (signal: AbortSignal) => Promise<T>, signal?: AbortSignal) {
  const controller = new AbortController()
  const abort = () => controller.abort()
  const timer = window.setTimeout(abort, REQUEST_TIMEOUT_MS)
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()
  return Promise.resolve().then(() => work(controller.signal)).finally(() => {
    window.clearTimeout(timer)
    signal?.removeEventListener('abort', abort)
  })
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

function createProvider(providerId: Exclude<SpeechProviderId, 'browser'>): EdgeSpeechProvider {
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

const providers = new Map<SpeechProviderId, EdgeSpeechProvider>([
  ['domestic', createProvider('domestic')],
  ['international', createProvider('international')],
])
const browserProvider: SpeechProvider = {
  async probe() { getBrowserSpeech() },
  listVoices: loadBrowserVoices,
}
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
    retryAt: 0,
  }
  providerCaches.set(providerId, cache)
  return cache
}

function providerSnapshot(providerId: SpeechProviderId): Omit<SpeechProviderState, 'selectProvider'> {
  const cache = getProviderCache(providerId)
  // 云端重新探测期间继续提供已经可用的兜底，避免禁用朗读或打断焦点。
  const usingFallback = providerId !== 'browser' && cache.status !== 'available' && cache.retryAt > 0
  const activeProviderId = usingFallback ? 'browser' : providerId
  const activeCache = getProviderCache(activeProviderId)
  return {
    providerId,
    provider: getProvider(providerId),
    activeProvider: getProvider(activeProviderId),
    usingFallback,
    providers: SPEECH_PROVIDERS,
    status: activeCache.status,
    voices: activeCache.voices,
    error: usingFallback && activeCache.error
      ? `${cache.error}；${activeCache.error}`
      : cache.error,
  }
}

function notifyProviders() {
  providerListeners.forEach((listener) => listener())
}

function markProviderUnavailable(providerId: SpeechProviderId, error: unknown) {
  const cache = getProviderCache(providerId)
  cache.status = 'unavailable'
  cache.error = error instanceof Error ? error.message : '语音服务不可用'
  cache.retryAt = Date.now() + PROVIDER_RETRY_MS
  notifyProviders()
}

async function ensureProvider(providerId: SpeechProviderId): Promise<void> {
  const cache = getProviderCache(providerId)
  if (cache.status === 'available' && cache.voices.length > 0 &&
      Date.now() - cache.voicesCachedAt < VOICE_CACHE_MS) return
  if (cache.request) return cache.request
  if (cache.status === 'unavailable' && Date.now() < cache.retryAt) {
    throw new Error(cache.error ?? '语音服务不可用')
  }

  const provider = providerId === 'browser' ? browserProvider : providers.get(providerId)!
  cache.status = 'checking'
  cache.error = null
  notifyProviders()
  cache.request = withTimeout((signal) => provider.probe(signal))
    .then(() => withTimeout((signal) => provider.listVoices(signal)))
    .then((voices) => {
      cache.voices = voices
      cache.voicesCachedAt = Date.now()
      cache.status = 'available'
      cache.error = null
      cache.retryAt = 0
      notifyProviders()
    })
    .catch((error: unknown) => {
      markProviderUnavailable(providerId, error)
      throw error
    })
    .finally(() => {
      cache.request = null
    })
  return cache.request
}

async function ensureAvailableProvider(providerId: SpeechProviderId) {
  // 提前加载浏览器音色，让云端失败后的兜底无需再等首次加载。
  const browserReady = providerId === 'browser' ? null : ensureProvider('browser').catch(() => undefined)
  try {
    await ensureProvider(providerId)
  } catch (error) {
    if (providerId === 'browser') throw error
    await browserReady
    await ensureProvider('browser')
  }
}

/** 设置页与练习页共享每个 provider 的探测和音色缓存。 */
export function useSpeechProvider(): SpeechProviderState {
  const [providerId, setProviderId] = React.useState<SpeechProviderId | null>(null)
  const [state, setState] = React.useState(() => providerSnapshot(DEFAULT_SPEECH_SETTINGS.provider))
  const [storageError, setStorageError] = React.useState<Error | null>(null)

  React.useEffect(() => {
    try {
      setProviderId(loadSpeechSettings().provider)
    } catch (error) {
      setStorageError(error instanceof Error ? error : new Error('语音设置无法读取'))
    }
  }, [])

  React.useEffect(() => {
    if (providerId === null) return
    let cancelled = false
    const sync = () => {
      if (!cancelled) setState(providerSnapshot(providerId))
    }
    providerListeners.add(sync)
    sync()
    void ensureAvailableProvider(providerId)
      .catch(() => undefined)
      .finally(sync)

    const browserSpeech = window.speechSynthesis
    const refreshBrowserVoices = () => {
      const cache = getProviderCache('browser')
      cache.voicesCachedAt = 0
      cache.retryAt = 0
      void ensureAvailableProvider(providerId).catch(() => undefined)
    }
    browserSpeech?.addEventListener('voiceschanged', refreshBrowserVoices)
    return () => {
      cancelled = true
      providerListeners.delete(sync)
      browserSpeech?.removeEventListener('voiceschanged', refreshBrowserVoices)
    }
  }, [providerId])

  const selectProvider = React.useCallback((nextProviderId: SpeechProviderId) => {
    if (nextProviderId === providerId) return
    saveSpeechSettings({ provider: nextProviderId })
    stopSpeaking()
    setProviderId(nextProviderId)
  }, [providerId])

  if (storageError) throw storageError
  return { ...state, selectProvider }
}

export function loadSpeechVoices(providerId?: SpeechProviderId): Promise<SpeechVoice[]> {
  const selectedProviderId = providerId ?? loadSpeechSettings().provider
  return ensureAvailableProvider(selectedProviderId).then(() => providerSnapshot(selectedProviderId).voices)
}

interface SpeechRequest {
  text: string
  rate: number
  voice: string | null
  providerId: SpeechProviderId
  onStatus?: (status: 'loading' | 'ready') => void
  onError?: (error: Error) => void
  loading: boolean
  fallingBack: boolean
}

let activeAudio: HTMLAudioElement | null = null
let activeObjectUrl: string | null = null
let activeRequest: SpeechRequest | null = null
let activeUtterance: SpeechSynthesisUtterance | null = null
let activeController: AbortController | null = null
let audioQueue: SpeechRequest[] = []
let playbackGeneration = 0

function readyRequest(request: SpeechRequest) {
  if (!request.loading) return
  request.loading = false
  request.onStatus?.('ready')
}

function releaseAudio() {
  if (activeAudio) {
    activeAudio.onended = null
    activeAudio.onerror = null
  }
  activeAudio?.pause()
  activeAudio = null
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl)
  activeObjectUrl = null
}

function stopAudio() {
  playbackGeneration += 1
  if (activeRequest) readyRequest(activeRequest)
  activeRequest = null
  activeController?.abort()
  activeController = null
  releaseAudio()
  if (activeUtterance) {
    activeUtterance.onstart = null
    activeUtterance.onend = null
    activeUtterance.onerror = null
    activeUtterance = null
    window.speechSynthesis.cancel()
  }
  audioQueue = []
}

/** 停止当前朗读、排队内容和正在请求的合成。 */
export function stopSpeaking() {
  if (typeof window === 'undefined') return
  stopAudio()
}

function isCurrentRequest(request: SpeechRequest, generation: number) {
  return generation === playbackGeneration && activeRequest === request
}

function finishRequest(request: SpeechRequest, generation: number, error?: Error) {
  if (!isCurrentRequest(request, generation)) return
  releaseAudio()
  if (activeUtterance) {
    activeUtterance.onstart = null
    activeUtterance.onend = null
    activeUtterance.onerror = null
    activeUtterance = null
  }
  activeRequest = null
  readyRequest(request)
  if (error) request.onError?.(error)
  if (generation !== playbackGeneration) return
  const next = audioQueue.shift()
  if (next) void playRequest(next, generation)
}

function playBrowserRequest(request: SpeechRequest, generation: number) {
  if (!isCurrentRequest(request, generation)) return
  const utterance = createBrowserUtterance(request.text, request.voice, request.rate)
  activeUtterance = utterance
  utterance.onstart = () => {
    if (isCurrentRequest(request, generation)) readyRequest(request)
  }
  utterance.onend = () => finishRequest(request, generation)
  utterance.onerror = (event) => {
    const message = event.error === 'not-allowed'
      ? '浏览器阻止自动朗读，请点击朗读按钮后重试'
      : `浏览器语音播放失败（${event.error}）`
    finishRequest(request, generation, new Error(message))
  }
  getBrowserSpeech().speak(utterance)
}

async function recoverRequest(request: SpeechRequest, generation: number, error: unknown) {
  if (!isCurrentRequest(request, generation) || request.fallingBack) return
  if (request.providerId === 'browser') {
    finishRequest(request, generation, error instanceof Error ? error : new Error('浏览器语音播放失败'))
    return
  }
  request.fallingBack = true
  releaseAudio()
  if (getProviderCache(request.providerId).status !== 'unavailable') {
    markProviderUnavailable(request.providerId, error)
  }
  try {
    await ensureProvider('browser')
    playBrowserRequest(request, generation)
  } catch (fallbackError) {
    const detail = fallbackError instanceof Error ? fallbackError.message : '浏览器语音不可用'
    finishRequest(request, generation, new Error(`云端朗读失败；${detail}`))
  }
}

async function playRequest(request: SpeechRequest, generation = playbackGeneration) {
  if (generation !== playbackGeneration) return
  activeRequest = request
  request.loading = true
  request.onStatus?.('loading')

  try {
    await ensureProvider(request.providerId)
    if (!isCurrentRequest(request, generation)) return
    if (request.providerId === 'browser') {
      playBrowserRequest(request, generation)
      return
    }

    const voices = getProviderCache(request.providerId).voices
    // 切换服务后，另一个服务的音色 ID 不会传给 Edge TTS。
    const voice = voices.find((item) => item.id === request.voice) ??
      voices.find((item) => item.id === DEFAULT_EDGE_VOICE) ??
      voices.find((item) => item.locale === 'en-GB' && item.gender === 'Female') ?? voices[0]
    const controller = new AbortController()
    activeController = controller
    const blob = await withTimeout((signal) => providers.get(request.providerId)!.synthesize(
      request.text,
      voice.id,
      signal,
    ), controller.signal)
    if (!isCurrentRequest(request, generation)) return
    activeController = null

    activeObjectUrl = URL.createObjectURL(blob)
    const audio = new Audio(activeObjectUrl)
    audio.playbackRate = request.rate
    activeAudio = audio
    audio.onended = () => finishRequest(request, generation)
    audio.onerror = () => { void recoverRequest(request, generation, new Error('云端音频播放失败')) }
    await audio.play()
    if (isCurrentRequest(request, generation)) readyRequest(request)
  } catch (error: unknown) {
    if (!isCurrentRequest(request, generation)) return
    activeController = null
    await recoverRequest(request, generation, error)
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
  const voice = opts?.voiceURI ?? prefs.voiceURI
  const request: SpeechRequest = {
    text,
    rate: prefs.rate,
    voice,
    providerId: speechSettings.provider,
    onStatus: opts?.onStatus,
    onError: opts?.onError,
    loading: false,
    fallingBack: false,
  }

  if (opts?.queue && activeRequest) {
    audioQueue.push(request)
    return
  }
  if (!opts?.queue) stopAudio()
  void playRequest(request)
}

export type { Prefs } from './storage'
