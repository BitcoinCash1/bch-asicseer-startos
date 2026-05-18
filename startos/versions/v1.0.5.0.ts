import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_5_0 = VersionInfo.of({
  version: '1.0.5:0',
  releaseNotes:
    'Fix crash on legacy Base58 donation address with BCHD: ' +
    'when CashAddr decode fails (non-CashAddr address format), ' +
    'log a warning and skip instead of quitting. ' +
    'Pool now starts successfully with BCHD; donation address is skipped gracefully.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
