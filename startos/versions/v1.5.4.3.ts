import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_3 = VersionInfo.of({
  version: '1.5.4:3',
  releaseNotes:
    'Fix: deleted workers no longer reappear after deletion. ' +
    'The pool daemon rewrites user stat files from its in-memory state every few seconds, ' +
    'causing deleted workers to reappear in the table. ' +
    'Fixed by writing a tombstone file on delete; stats-api.sh suppresses the worker ' +
    'until its lastshare advances past the tombstone (i.e. the miner genuinely reconnects).',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
