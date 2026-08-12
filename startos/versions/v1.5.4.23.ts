import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_23 = VersionInfo.of({
  version: '1.5.4:23',
  releaseNotes:
    'Knuth backend: wire JSON-RPC autoconfig (RPC on, full DB), use the same ' +
    'per-network RPC ports as BCHN/Flowee, and declare knuth-bch in the package ' +
    'manifest. GBT probe notes classic vs light template API when Knuth is selected.',
  migrations: {
    up: async () => {},
    down: async () => {},
  },
})
