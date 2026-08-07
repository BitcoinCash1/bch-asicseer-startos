import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_23 = VersionInfo.of({
  version: '1.5.4:23',
  releaseNotes:
    'Knuth backend: wire JSON-RPC autoconfig (RPC on, full DB), use the same ' +
    'per-network RPC ports as BCHN/Flowee, and declare knuth-bch in the package ' +
    'manifest. Classic getblocktemplate is still missing upstream (k-nuth/kth#616) — ' +
    'the GBT probe now explains that clearly when Knuth is selected.',
  migrations: {
    up: async () => {},
    down: async () => {},
  },
})
