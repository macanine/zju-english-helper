import { defineConfig, presetWind4 } from 'unocss'

export default defineConfig({
  content: {
    filesystem: ['app/**/*.{ts,tsx,css}', 'components/**/*.{ts,tsx}', 'lib/**/*.{ts,tsx}'],
  },
  presets: [presetWind4()],
})
