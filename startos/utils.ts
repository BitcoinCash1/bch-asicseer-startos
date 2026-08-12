import { T } from '@start9labs/start-sdk'
import {
  rpcPlaintextHostId as bchdRpcHostId,
  rpcPlaintextPort as bchdRpcPort,
} from 'bitcoin-cash-daemon-startos/startos/utils'
import { networkPorts as bchnNetworkPorts } from 'bitcoin-cash-node-startos/startos/utils'
import {
  rpcHostId as floweeRpcHostId,
  rpcPort as floweeRpcPort,
} from 'flowee-startos/startos/utils'
import { sdk } from './sdk'

export const poolPort = 3334
export const uiPort = 81

export const poolInterfaceId = 'pool-mining'
export const uiInterfaceId = 'web-ui'

/** ASICSeer's own volume, as seen inside every subcontainer. */
export const rootDir = '/data'

/**
 * Where the selected node's `main` volume is mounted, read-only. The pool never
 * reads the chain off disk — the mount exists so `main` can read the node's
 * `store.json` for the chain it is on and, on BCHN and BCHD, its RPC
 * credentials.
 */
export const nodeMountpoint = '/mnt/node'

export const NODE_IDS = ['bitcoincashd', 'bchd', 'flowee'] as const
export type NodeId = (typeof NODE_IDS)[number]

/**
 * The chains a node can report. Mining stats are per-chain — a share found
 * against chipnet difficulty means nothing on mainnet — so `main` wipes the
 * pool's accumulated state when this changes.
 */
export const NETWORKS = [
  'mainnet',
  'testnet3',
  'testnet4',
  'scalenet',
  'chipnet',
  'regtest',
] as const
export type Network = (typeof NETWORKS)[number]

/** Flowee spells testnet3 `testnet`; every other chain name agrees across the three nodes. */
export const nodeNetwork = (reported: string): Network | null => {
  const name = reported === 'testnet' ? 'testnet3' : reported
  return NETWORKS.includes(name as Network) ? (name as Network) : null
}

/**
 * Which binding each node publishes the JSON-RPC the pool dials on, and — where
 * the port moves with the chain — how to derive it.
 *
 * BCHN remaps RPC per chain, so its port is only knowable once the node's own
 * chain is known. BCHD's plaintext stunnel proxy and Flowee's RPC are both
 * pinned to one port on every chain. BCHD is dialed through that proxy rather
 * than its native TLS RPC so no certificate has to be trusted here.
 */
const RPC_BINDINGS: Record<
  NodeId,
  { hostId: string; port: (network: Network) => number; ssl?: boolean }
> = {
  bitcoincashd: {
    // Unlike BCHD and Flowee, the BCHN package does not export its host ids —
    // `interfaces.ts` there names this group with the same literal.
    hostId: 'rpc',
    port: (network) => bchnNetworkPorts[network].rpc,
    ssl: false,
  },
  bchd: { hostId: bchdRpcHostId, port: () => bchdRpcPort },
  flowee: { hostId: floweeRpcHostId, port: () => floweeRpcPort, ssl: false },
}

/**
 * The selected node's JSON-RPC bridge address (`<osIp>:<assigned port>`).
 * `null` while the node is absent, which `main` reports through a failing
 * health check rather than writing an address that cannot answer; the
 * `.const()` heals the moment the node appears.
 *
 * On BCHN this doubles as the chain-change signal: switching chains rebinds RPC
 * to a different port, so this address goes `null` and `main` re-runs against
 * whatever the node moved to.
 */
export const nodeRpcBridge = (
  effects: T.Effects,
  node: NodeId,
  network: Network,
) => {
  const { hostId, port, ssl } = RPC_BINDINGS[node]
  return sdk.host
    .getBridgeAddress(effects, {
      packageId: node,
      hostId,
      internalPort: port(network),
      ssl,
    })
    .const()
}
