import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_0_2_0 = VersionInfo.of({
  version: '1.0.2:0',
  releaseNotes:
    'Fix BCHD mining: Go\'s net/http randomises header order, so BCHD sometimes sends ' +
    'Content-Type after Content-Length. The old parser read exactly one line expecting ' +
    'the blank-line separator and aborted when it got Content-Type instead. ' +
    'Now drains all remaining headers until the blank line is found.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
