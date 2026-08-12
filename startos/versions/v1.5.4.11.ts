import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_11 = VersionInfo.of({
  version: '1.5.4:11',
  releaseNotes: 'Bundle instructions.md inside the package so the Instructions tab is populated in StartOS.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
