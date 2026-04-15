export const poolPort = 3334
export const soloPort = 4568
export const uiPort = 81
export const poolInterfaceId = 'pool-mining'
export const soloInterfaceId = 'solo-mining'
export const uiInterfaceId = 'web-ui'
export const rootDir = '/data'

export type NodeBackend = 'bitcoin-cash-node' | 'knuth-bch' | 'bitcoin-cash-daemon'

export const nodeHostnames: Record<NodeBackend, string> = {
  'bitcoin-cash-node': 'bitcoin-cash-node.startos',
  'knuth-bch': 'knuth-bch.startos',
  'bitcoin-cash-daemon': 'bitcoin-cash-daemon.startos',
}

export const nodeMountpoints: Record<NodeBackend, string> = {
  'bitcoin-cash-node': '/mnt/bitcoin-cash-node',
  'knuth-bch': '/mnt/knuth-bch',
  'bitcoin-cash-daemon': '/mnt/bitcoin-cash-daemon',
}
