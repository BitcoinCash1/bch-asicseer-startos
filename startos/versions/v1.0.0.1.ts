import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_0_1 = VersionInfo.of({
  version: '1.0.0:1',
  releaseNotes:
    'Add Knuth (knuth-bch) to the Node Backend dropdown. ' +
    'Knuth does not expose JSON-RPC in the current upstream release; selecting it ' +
    'will surface a clear RPC error at startup until upstream ships RPC. ' +
    'No behavior change for BCHN/BCHD/Flowee users.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
