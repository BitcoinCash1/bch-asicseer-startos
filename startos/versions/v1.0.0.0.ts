import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_0_0 = VersionInfo.of({
  version: '1.0.0:0',
  releaseNotes:
    'Initial release of ASICSeer for StartOS. Bitcoin Cash mining pool built on the ASICSeer fork of ckpool with dual-mode operation (pool + solo), built-in web dashboard, and Bitcoin Cash Node dependency wiring.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
