import { i18n } from './i18n'
import { sdk } from './sdk'
import { poolInterfaceId, poolPort, uiInterfaceId, uiPort } from './utils'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  // Stratum is raw TCP, and mining hardware speaks it unencrypted.
  const poolMulti = sdk.MultiHost.of(effects, 'pool-mining')
  const poolOrigin = await poolMulti.bindPort(poolPort, {
    protocol: null,
    preferredExternalPort: poolPort,
    addSsl: null,
    secure: { ssl: false },
  })
  const pool = sdk.createInterface(effects, {
    name: i18n('Pool Mining'),
    id: poolInterfaceId,
    description: i18n('Stratum endpoint your mining hardware connects to'),
    type: 'p2p',
    masked: false,
    // Miners are pointed at `stratum+tcp://<host>:<port>`, so the addresses
    // StartOS shows say so.
    schemeOverride: { ssl: 'stratum+tcp', noSsl: 'stratum+tcp' },
    username: null,
    path: '',
    query: {},
  })

  const uiMulti = sdk.MultiHost.of(effects, 'web-ui')
  const uiOrigin = await uiMulti.bindPort(uiPort, { protocol: 'http' })
  const ui = sdk.createInterface(effects, {
    name: i18n('Web Dashboard'),
    id: uiInterfaceId,
    description: i18n('Hashrate, shares, connected workers and block history'),
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })

  return [await poolOrigin.export([pool]), await uiOrigin.export([ui])]
})
