import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_21 = VersionInfo.of({
  version: '1.5.4:21',
  releaseNotes:
    'asicseer-pool fix: getblocktemplate no longer hard-requires the deprecated/optional coinbaseaux field. Flowee the Hub omits coinbaseaux, which made asicseer-pool reject every Flowee block template ("JSON failed to decode GBT … No bitcoinds active!") even though it only reads coinbaseaux.flags and already defaults that to empty when absent. The pool now works with Flowee (and any node that omits coinbaseaux). To be submitted upstream to cculianu/asicseer-pool.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
