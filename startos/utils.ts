import { T } from '@start9labs/start-sdk'
import {
  rpcPlaintextHostId as bchdRpcHostId,
  rpcPlaintextPort as bchdRpcPort,
} from 'bitcoin-cash-daemon-startos/startos/utils'
import { networkPorts as bchnNetworkPorts } from 'bitcoin-cash-node-startos/startos/utils'
import { rpcHostId as floweeRpcHostId } from 'flowee-startos/startos/utils'
import { sdk } from './sdk'

export const poolPort = 3334
export const uiPort = 81

export const poolInterfaceId = 'pool-mining'
export const uiInterfaceId = 'web-ui'

/** ASICSeer's own volume, as seen inside every subcontainer. */
export const rootDir = '/data'

/**
 * Where the selected node's `main` volume is mounted, read-only — for its
 * `store.json`, not for chain data: the chain it is on and, on BCHN and BCHD,
 * its RPC credentials.
 */
export const nodeMountpoint = '/mnt/node'

export const NODE_IDS = ['bitcoincashd', 'bchd', 'flowee', 'knuth-bch'] as const
export type NodeId = (typeof NODE_IDS)[number]

/** The chains a node can report. `main` wipes the pool's stats when it moves. */
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
 * Which binding each node publishes the JSON-RPC on. BCHN remaps its port per
 * chain; BCHD and Flowee are fixed. BCHD is dialed through its plaintext proxy
 * so no certificate has to be trusted here.
 */
const RPC_BINDINGS: Record<
  NodeId,
  { hostId: string; port: (network: Network) => number; ssl?: boolean }
> = {
  bitcoincashd: {
    // BCHN exports no host ids; its `interfaces.ts` uses this literal.
    hostId: 'rpc',
    port: (network) => bchnNetworkPorts[network].rpc,
    ssl: false,
  },
  bchd: { hostId: bchdRpcHostId, port: () => bchdRpcPort },
  flowee: {
    hostId: floweeRpcHostId,
    // Hub defaults match BCHN per network. Start9 Flowee :12 pinned 8332
    // and broke chipnet dependents; BitcoinCash1 / Flowee #4 restore this.
    port: (network) => bchnNetworkPorts[network].rpc,
    ssl: false,
  },
  // Optional sideload from BitcoinCash1. Same per-network RPC ports as BCHN.
  // Classic GBT is served by the 1.3.0 sidecar (kth itself is light-GBT).
  'knuth-bch': {
    hostId: 'rpc',
    port: (network) => bchnNetworkPorts[network].rpc,
    ssl: false,
  },
}

/**
 * The selected node's JSON-RPC bridge address. `null` while the node is absent,
 * which `main` reports as a failing health check; the `.const()` heals when it
 * appears. It does not signal a chain change — a binding the node moves off is
 * left disabled, and a disabled binding still resolves.
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
