import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_22 = VersionInfo.of({
  version: '1.5.4:22',
  releaseNotes:
    'asicseer-pool Flowee compatibility (cashaddr): accept a cashaddr payout address even when the node’s validateaddress reports it invalid. Flowee the Hub’s validateaddress RPC is legacy-base58-only and returns isvalid=false for any cashaddr, which made asicseer-pool reject the payout ("Invalid bchaddress" → "No bitcoinds active"). The pool now derives the scriptPubKey from the cashaddr/legacy address itself when the node rejects it. Together with the 1.5.4:21 coinbaseaux fix, asicseer-pool now works with Flowee the Hub. To be submitted upstream to cculianu/asicseer-pool.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
