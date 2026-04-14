import { sdk } from './sdk'
import {
  poolPort,
  soloPort,
  uiPort,
  poolInterfaceId,
  soloInterfaceId,
  uiInterfaceId,
} from './utils'

export const setInterfaces = sdk.setupInterfaces(async ({ effects }) => {
  const receipts = []

  // ── Pool Mining (stratum) ────────────────────────────────────────
  const poolMulti = sdk.MultiHost.of(effects, 'pool-mining')
  const poolOrigin = await poolMulti.bindPort(poolPort, {
    protocol: null,
    preferredExternalPort: poolPort,
    addSsl: null,
    secure: { ssl: false },
  })
  const pool = sdk.createInterface(effects, {
    name: 'Pool Mining',
    id: poolInterfaceId,
    description:
      'Stratum mining interface for pool mode — shared rewards',
    type: 'p2p',
    masked: false,
    schemeOverride: { ssl: null, noSsl: null },
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await poolOrigin.export([pool]))

  // ── Solo Mining (stratum) ────────────────────────────────────────
  const soloMulti = sdk.MultiHost.of(effects, 'solo-mining')
  const soloOrigin = await soloMulti.bindPort(soloPort, {
    protocol: null,
    preferredExternalPort: soloPort,
    addSsl: null,
    secure: { ssl: false },
  })
  const solo = sdk.createInterface(effects, {
    name: 'Solo Mining',
    id: soloInterfaceId,
    description:
      'Stratum mining interface for solo mode — winner takes all',
    type: 'p2p',
    masked: false,
    schemeOverride: { ssl: null, noSsl: null },
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await soloOrigin.export([solo]))

  // ── Web UI ───────────────────────────────────────────────────────
  const uiMulti = sdk.MultiHost.of(effects, 'web-ui')
  const uiOrigin = await uiMulti.bindPort(uiPort, {
    protocol: 'http',
    preferredExternalPort: uiPort,
  })
  const ui = sdk.createInterface(effects, {
    name: 'Web Dashboard',
    id: uiInterfaceId,
    description:
      'Web dashboard for monitoring pool and solo mining stats',
    type: 'ui',
    masked: false,
    schemeOverride: null,
    username: null,
    path: '',
    query: {},
  })
  receipts.push(await uiOrigin.export([ui]))

  return receipts
})
