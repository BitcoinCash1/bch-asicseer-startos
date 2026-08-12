export const DEFAULT_LANG = 'en_US'

const dict = {
  // actions/configure.ts
  Configure: 0,
  'Set the payout address and how the pool pays out.': 1,
  'Payout Address': 2,
  'The address a found block pays to. It must belong to the chain the node is on — mainnet addresses start bitcoincash:, the test chains bchtest:, regtest bchreg:.': 3,
  'A Bitcoin Cash address, either CashAddr (bitcoincash:q…) or legacy.': 4,
  'Pool Fee': 5,
  'The share of each block reward the pool keeps. The rest is split between the miners that worked on it.': 6,
  'Pool Identifier': 7,
  'Written into the coinbase transaction of every block this pool finds, where block explorers show it.': 8,
  'Starting Difficulty': 9,
  'The share difficulty a miner is given when it first connects. The pool raises or lowers it from there to match what the miner can actually do.': 10,
  'Disable Developer Donation': 11,
  'ASICSeer donates a tenth of the pool fee — not of the block reward — to its author and to Bitcoin Cash Node. Turn this on to keep the whole fee.': 12,

  // actions/connectionInfo.ts
  'Connection Info': 13,
  'Show what to enter on your mining hardware.': 14,
  'No mining address is available yet. Start the pool and try again.': 15,
  'Mining Address': 16,
  'Point your miner here': 17,
  'Use the Bitcoin Cash address you want a miner paid at as its username — every block the pool finds is split in its coinbase between the miners that worked on it, paid straight to those addresses. The payout address configured here receives only your pool fee.': 18,
  Username: 19,
  'Your Bitcoin Cash address, optionally followed by a dot and a name for that miner — bitcoincash:qr….rig1. Miners with no name are numbered worker01, worker02 and so on.': 20,
  Password: 21,
  'Anything — Stratum does not check it.': 22,

  // actions/selectNode.ts
  'Select Node Backend': 23,
  'Choose which Bitcoin Cash node the pool gets its block templates from.': 24,
  'The pool restarts against the new node. If that node is on a different chain, the accumulated share and hashrate figures are cleared, because they do not carry across chains.': 25,
  'Node Backend': 26,
  'The node must be installed and fully synced before the pool can mine on it.': 27,
  'Bitcoin Cash Node': 28,
  'Bitcoin Cash Daemon': 29,
  'Flowee the Hub': 30,
  'Flowee needs an RPC credential registered for the pool to log in with': 31,

  // actions/wipeMiningState.ts
  'Wipe Mining State': 32,
  'Clear the accumulated share counts and hashrate figures and restart the pool. Use it when a miner is stuck showing as idle or the statistics look wrong.': 33,
  'Every share count and hashrate figure goes back to zero, and connected miners briefly disconnect. Blocks already found are not affected.': 34,

  // init/taskConfigure.ts
  'Set the address the pool pays a found block to': 35,

  // init/taskSelectNode.ts
  'Choose which Bitcoin Cash node the pool mines on': 36,

  // interfaces.ts
  'Pool Mining': 37,
  'Stratum endpoint your mining hardware connects to': 38,
  'Web Dashboard': 39,
  'Hashrate, shares, connected workers and block history': 40,

  // main.ts
  'Starting ASICSeer': 41,
  'The selected node reports an unrecognized chain: ${chain}.': 42,
  Mining: 43,
  'No payout address is set. Open Configure and set the address a found block should pay to.': 44,
  'The payout address does not belong to the chain the node is on (${chain}). Open Configure and set an address starting ${prefix}': 45,
  'The ${node} node is not reachable. The pool will start once it is installed and running.': 46,
  'Clearing mining statistics (chain is now ${chain})': 47,
  'The node rejected the payout address. Open Configure and set one valid on ${chain}.': 48,
  'The node is not answering, so there is no work to mine.': 49,
  'Accepting miners on ${chain}': 50,
  'Starting...': 51,
  'The dashboard is ready': 52,
  'The dashboard is not ready': 53,
  Node: 54,
  'The node switched from ${from} to ${to}. Restarting.': 55,
  'The node is still syncing. Blocks found before it catches up would be rejected by the network.': 56,
  'Mining on ${chain}': 57,
} as const

/**
 * Plumbing. DO NOT EDIT.
 */
export type I18nKey = keyof typeof dict
export type LangDict = Record<(typeof dict)[I18nKey], string>
export default dict
