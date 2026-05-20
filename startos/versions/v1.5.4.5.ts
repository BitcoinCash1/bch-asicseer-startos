import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_5 = VersionInfo.of({
  version: '1.5.4:5',
  releaseNotes:
    'Fix: maxdiff is now configurable in settings (default 2147483648) instead of 0 (unlimited). A maxdiff of 0 caused vardiff to raise share difficulty indefinitely, making miners appear Idle. Users with high hashrate can raise the ceiling from the Configure action.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
