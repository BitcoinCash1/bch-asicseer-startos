import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_3_0 = VersionInfo.of({
  version: '1.0.3:0',
  releaseNotes:
    'Fix BCHD mining: validateaddress on BCHD omits isscript (no wallet support). ' +
    'The old code called quit() when isscript was absent; now defaults to P2PKH (false) ' +
    'which is correct for standard BCH payout addresses.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
