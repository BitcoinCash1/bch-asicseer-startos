import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_4_0 = VersionInfo.of({
  version: '1.0.4:0',
  releaseNotes:
    'Fix BCHD mining: validateaddress on BCHD omits scriptPubKey (no wallet). ' +
    'Added CashAddr decoder to derive scriptPubKey directly from the payout address ' +
    'for P2PKH (q-prefix) and P2SH (p-prefix) BCH addresses.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
