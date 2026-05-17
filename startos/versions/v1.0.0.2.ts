import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_0_2 = VersionInfo.of({
  version: '1.0.0:2',
  releaseNotes:
    'Fix getblocktemplate with BCHD node backend. ' +
    'BCHD interprets the "coinbasetxn" GBT capability as a request to build ' +
    'a ready-made coinbase transaction, which requires --miningaddr to be set. ' +
    'Removing "coinbasetxn" from the GBT request causes BCHD to return a normal ' +
    'block template; the pool builds its own coinbase as it always intended.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
