/**
 * 打字音效：用 Web Audio 现场合成，不引入任何音频素材（静态导出可直接用）。
 * 默认关闭，由设置页「键盘音效」开关控制；无 AudioContext 的环境静默降级。
 */
let ctx: AudioContext | null = null

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  try {
    ctx ??= new Ctor()
    if (ctx.state === 'suspended') void ctx.resume()
    return ctx
  } catch {
    return null
  }
}

/** 一个带包络的短音；delay 为相对当前时刻的秒数 */
function blip(freq: number, duration: number, type: OscillatorType, gain: number, delay = 0) {
  const ac = audio()
  if (!ac) return
  const t0 = ac.currentTime + delay
  const osc = ac.createOscillator()
  const g = ac.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  // 8ms 淡入避免爆音，指数淡出更接近敲击的自然衰减
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(gain, t0 + 0.008)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration)
  osc.connect(g)
  g.connect(ac.destination)
  osc.start(t0)
  osc.stop(t0 + duration + 0.03)
}

/** 正确按键：短促高音（笔记本键盘的「嗒」） */
export function playKey() {
  blip(1500, 0.035, 'triangle', 0.03)
}

/** 错误按键：低频闷响 */
export function playWrong() {
  blip(170, 0.16, 'sawtooth', 0.045)
}

/** 整词完成：两声上行小铃 */
export function playDone() {
  blip(880, 0.09, 'sine', 0.05)
  blip(1320, 0.12, 'sine', 0.04, 0.07)
}

/** 跳过：一声中性提示 */
export function playSkip() {
  blip(520, 0.08, 'sine', 0.035)
}
