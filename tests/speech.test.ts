import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'

import { DEFAULT_PREFS, savePrefs, saveSpeechSettings } from '../lib/storage'

class BrowserUtterance {
  voice: SpeechSynthesisVoice | null = null
  lang = ''
  rate = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  constructor(public text: string) {}
}

class BrowserSpeech extends EventTarget {
  voices = [
    { voiceURI: 'cloud-british', name: 'Online British', lang: 'en-GB', localService: false, default: false },
    { voiceURI: 'local-american', name: 'Local American', lang: 'en-US', localService: true, default: true },
    { voiceURI: 'local-british', name: 'Local British', lang: 'en-GB', localService: true, default: false },
    { voiceURI: 'local-chinese', name: '中文', lang: 'zh-CN', localService: true, default: false },
  ]
  spoken: BrowserUtterance[] = []
  cancellations = 0
  getVoices() { return this.voices }
  speak(utterance: BrowserUtterance) {
    this.spoken.push(utterance)
    utterance.onstart?.()
  }
  cancel() { this.cancellations += 1 }
}

class CloudAudio {
  static instances: CloudAudio[] = []
  static failPlay = false
  playbackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  paused = false
  constructor(public src: string) { CloudAudio.instances.push(this) }
  async play() {
    if (CloudAudio.failPlay) throw new Error('音频播放失败')
  }
  pause() { this.paused = true }
}

const store = new Map<string, string>()
let speech: typeof import('../lib/speech')
let browser: BrowserSpeech
let calls: { url: string; init?: RequestInit }[]
let fetchResponse: (url: string, init?: RequestInit) => Promise<Response>

function cloudResponse(url: string): Promise<Response> {
  if (url.endsWith('/health')) return Promise.resolve(Response.json({ ok: true }))
  if (url.endsWith('/voices')) return Promise.resolve(Response.json({ voices: [{
    ShortName: 'en-GB-SoniaNeural', FriendlyName: 'Sonia', Locale: 'en-GB', Gender: 'Female',
  }] }))
  return Promise.resolve(new Response(new Blob(['audio']), { headers: { 'Content-Type': 'audio/mpeg' } }))
}

async function flush() {
  await new Promise<void>((resolve) => setImmediate(resolve))
}

beforeEach(() => {
  store.clear()
  browser = new BrowserSpeech()
  calls = []
  CloudAudio.instances = []
  CloudAudio.failPlay = false
  fetchResponse = cloudResponse
  Object.assign(globalThis, {
    window: {
      setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
      clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
      speechSynthesis: browser,
      SpeechSynthesisUtterance: BrowserUtterance,
    },
    localStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => store.delete(key),
    },
    Audio: CloudAudio,
    fetch: (url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return fetchResponse(url, init)
    },
  })
  // 每个用例使用独立的服务缓存和播放队列，不给生产代码添加测试入口。
  delete require.cache[require.resolve('../lib/speech')]
  speech = require('../lib/speech')
  saveSpeechSettings({ provider: 'browser' })
})

afterEach(() => speech.stopSpeaking())

test('本地浏览器只列出英文音色，优先本机音色并应用语速', async () => {
  const voices = await speech.loadSpeechVoices()
  assert.deepEqual(voices.map((voice) => voice.id), ['local-british', 'local-american', 'cloud-british'])
  savePrefs({ ...DEFAULT_PREFS, rate: 1.25, voiceURI: 'en-GB-SoniaNeural' })
  speech.speak('apple')
  await flush()
  assert.equal(browser.spoken[0].voice?.voiceURI, 'local-british')
  assert.equal(browser.spoken[0].rate, 1.25)
  assert.equal(calls.length, 0)
})

test('首次空音色列表会等待 voiceschanged，并保留指定浏览器音色', async () => {
  const voices = browser.voices
  browser.voices = []
  const loading = speech.loadSpeechVoices('browser')
  await flush()
  browser.voices = voices
  browser.dispatchEvent(new Event('voiceschanged'))
  assert.equal((await loading).length, 3)
  speech.speak('apple', { voiceURI: 'local-american' })
  await flush()
  assert.equal(browser.spoken[0].voice?.voiceURI, 'local-american')
})

for (const stage of ['health', 'voices', 'tts', 'play', 'audio-error']) {
  test(`云端 ${stage} 失败会朗读原文本并自动兜底，保留所选服务`, async () => {
    saveSpeechSettings({ provider: 'domestic' })
    fetchResponse = (url) => url.endsWith(`/${stage}`)
      ? Promise.resolve(new Response('unavailable', { status: 503 }))
      : cloudResponse(url)
    CloudAudio.failPlay = stage === 'play'
    const errors: Error[] = []
    speech.speak('fallback text', { onError: (error) => errors.push(error) })
    await flush()
    if (stage === 'audio-error') {
      CloudAudio.instances[0].onerror?.()
      await flush()
    }
    assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['fallback text'])
    assert.equal(errors.length, 0)
    assert.deepEqual(JSON.parse(store.get('zjueh.speech')!), { provider: 'domestic' })
    assert.equal(browser.spoken[0].voice?.voiceURI, 'local-british')
  })
}

test('国际节点同样兜底，浏览器音色 ID 不会发送到云端', async () => {
  saveSpeechSettings({ provider: 'international' })
  savePrefs({ ...DEFAULT_PREFS, voiceURI: 'local-american' })
  fetchResponse = (url) => url.endsWith('/tts')
    ? Promise.reject(new Error('offline'))
    : cloudResponse(url)
  speech.speak('apple')
  await flush()
  const request = calls.find((call) => call.url.endsWith('/tts'))!
  assert.ok(request.url.startsWith('https://tts.ukraine.us.ci/'))
  assert.equal(JSON.parse(request.init!.body as string).voice, 'en-GB-SoniaNeural')
  assert.equal(browser.spoken[0].voice?.voiceURI, 'local-american')
})

test('云端请求超时后自动改用浏览器语音', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  saveSpeechSettings({ provider: 'domestic' })
  fetchResponse = (_url, init) => new Promise((_resolve, reject) => {
    init!.signal!.addEventListener('abort', () => reject(new Error('timeout')), { once: true })
  })
  speech.speak('apple')
  await flush()
  context.mock.timers.tick(8000)
  await flush()
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['apple'])
})

test('失败服务冷却期间直接兜底，连续朗读不会延后重试时间', async (context) => {
  let now = 100000
  context.mock.method(Date, 'now', () => now)
  saveSpeechSettings({ provider: 'domestic' })
  fetchResponse = () => Promise.reject(new Error('offline'))
  speech.speak('first')
  await flush()
  now += 10000
  speech.speak('second')
  await flush()
  assert.equal(calls.length, 1)
  now += 21000
  fetchResponse = cloudResponse
  speech.speak('third')
  await flush()
  assert.equal(calls.length, 4)
  assert.equal(CloudAudio.instances.length, 1)
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['first', 'second'])
})

test('浏览器朗读队列等上一条真正结束才播放下一条', async () => {
  speech.speak('first')
  await flush()
  speech.speak('second', { queue: true })
  await flush()
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['first'])
  browser.spoken[0].onend?.()
  await flush()
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['first', 'second'])
  assert.equal(browser.cancellations, 0)
})

test('云端朗读队列等音频结束，不在 play 完成时抢播', async () => {
  saveSpeechSettings({ provider: 'domestic' })
  speech.speak('first')
  await flush()
  speech.speak('second', { queue: true })
  await flush()
  assert.equal(CloudAudio.instances.length, 1)
  CloudAudio.instances[0].onended?.()
  await flush()
  assert.equal(CloudAudio.instances.length, 2)
  assert.equal(browser.spoken.length, 0)
})

test('停止朗读会中止正在合成的请求，取消内容不启动兜底或队列', async () => {
  saveSpeechSettings({ provider: 'domestic' })
  let synthesisSignal: AbortSignal | null = null
  fetchResponse = (url, init) => {
    if (!url.endsWith('/tts')) return cloudResponse(url)
    synthesisSignal = init!.signal!
    return new Promise((_resolve, reject) => {
      synthesisSignal!.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    })
  }
  speech.speak('first')
  await flush()
  speech.speak('queued', { queue: true })
  speech.stopSpeaking()
  await flush()
  assert.equal((synthesisSignal as AbortSignal | null)?.aborted, true)
  assert.equal(browser.spoken.length, 0)
  assert.equal(CloudAudio.instances.length, 0)
})

test('探测中的旧请求停止后，不再发起合成或消耗新队列', async () => {
  saveSpeechSettings({ provider: 'domestic' })
  let completeHealth!: (response: Response) => void
  fetchResponse = (url) => url.endsWith('/health')
    ? new Promise((resolve) => { completeHealth = resolve })
    : cloudResponse(url)
  speech.speak('old')
  await flush()
  speech.stopSpeaking()
  saveSpeechSettings({ provider: 'browser' })
  speech.speak('new')
  speech.speak('new queued', { queue: true })
  completeHealth(Response.json({ ok: true }))
  await flush()
  assert.equal(calls.some((call) => call.url.endsWith('/tts')), false)
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['new'])
  browser.spoken[0].onend?.()
  await flush()
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['new', 'new queued'])
})

test('浏览器取消后迟到的结束事件不影响新朗读与队列', async () => {
  speech.speak('old')
  await flush()
  const oldEnd = browser.spoken[0].onend!
  speech.speak('discarded', { queue: true })
  speech.stopSpeaking()
  speech.speak('new')
  speech.speak('new queued', { queue: true })
  await flush()
  oldEnd()
  await flush()
  assert.equal(browser.cancellations, 1)
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['old', 'new'])
  browser.spoken[1].onend?.()
  await flush()
  assert.deepEqual(browser.spoken.map((utterance) => utterance.text), ['old', 'new', 'new queued'])
})

test('不支持浏览器语音时暴露错误并恢复 loading 状态', async () => {
  Reflect.deleteProperty(window, 'speechSynthesis')
  const statuses: string[] = []
  const errors: Error[] = []
  speech.speak('apple', { onStatus: (status) => statuses.push(status), onError: (error) => errors.push(error) })
  await flush()
  assert.match(errors[0].message, /不支持本地语音/)
  assert.deepEqual(statuses, ['loading', 'ready'])
  assert.equal(calls.length, 0)
})

test('没有英文音色时给出明确错误，不朗读中文默认音色', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] })
  browser.voices = browser.voices.filter((voice) => voice.lang === 'zh-CN')
  const loading = speech.loadSpeechVoices('browser')
  const rejected = assert.rejects(loading, /没有可用的英文音色/)
  await flush()
  context.mock.timers.tick(2000)
  await rejected
  assert.equal(browser.spoken.length, 0)
})
