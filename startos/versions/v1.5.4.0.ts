import { VersionInfo } from '@start9labs/start-sdk'

export const v_1_5_4_0 = VersionInfo.of({
  version: '1.5.4:0',
  releaseNotes:
    'BCHD compatibility: add JSON-RPC id field, remove coinbasetxn capability, ' +
    'fix Go header order (drain loop), handle missing isscript (defaults to P2PKH), ' +
    'derive scriptPubKey from address when BCHD omits it — supports CashAddr (q/p prefix) ' +
    'and legacy Base58Check (1.../3...) formats.',
  migrations: {
    up: async ({ effects }) => {},
    down: async ({ effects }) => {},
  },
})
