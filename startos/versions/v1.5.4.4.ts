import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_4 = VersionInfo.of({
  version: '1.5.4:4',
  releaseNotes:
    'Fix: hashrate display now uses 1-hour average instead of 5-minute average for a more stable and accurate reading.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
