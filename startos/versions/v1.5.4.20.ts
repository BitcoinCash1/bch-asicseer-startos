import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_20 = VersionInfo.of({
  version: '1.5.4:20',
  releaseNotes:
    'Payout-address guard fix: the pool now validates the payout address by its CashAddr prefix (bitcoincash:/bchtest:/bchreg:) against the node’s network, instead of the node’s validateaddress RPC. Flowee the Hub’s validateaddress is legacy-base58-only and returns isvalid=false for any cashaddr, which previously made the guard wrongly reject valid cashaddr payout addresses when Flowee was the selected node. asicseer-pool’s own runtime parsing remains the final authority.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
