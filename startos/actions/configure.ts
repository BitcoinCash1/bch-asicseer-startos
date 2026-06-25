import { sdk } from '../sdk'
import { storeJson } from '../file-models/store.json'

const configSpec = sdk.InputSpec.of({
  payoutAddress: sdk.Value.text({
    name: 'Payout Address',
    description:
      'Your BCH address for receiving mining rewards. Used as the coinbase output address.',
    required: true,
    default: null,
    placeholder: 'bitcoincash:qr...',
    masked: false,
    minLength: 20,
    maxLength: 120,
  }),
  poolFee: sdk.Value.number({
    name: 'Pool Fee (%)',
    description:
      'Percentage fee taken from pool mining rewards. Solo mining always has 0% fee.',
    required: true,
    default: 1,
    min: 0,
    max: 10,
    integer: false,
    units: '%',
  }),
  poolIdentifier: sdk.Value.text({
    name: 'Pool Identifier',
    description:
      'Text embedded in the coinbase transaction (pool signature). Appears on block explorers.',
    required: true,
    default: 'ASICSeer',
    placeholder: 'ASICSeer',
    masked: false,
    minLength: 1,
    maxLength: 30,
  }),
  poolDifficulty: sdk.Value.number({
    name: 'Starting Difficulty',
    description:
      'Initial share difficulty assigned to new miners on connect. Vardiff adjusts automatically from here. Upstream default is 42.',
    required: true,
    default: 42,
    min: 1,
    max: 1000000,
    integer: true,
    units: null,
  }),
  nodeAddressMode: sdk.Value.select({
    name: 'Node Address Source',
    description:
      'Auto uses <selected-node>.startos. Custom lets you point to a manual host:port (including onion endpoints).',
    default: 'auto',
    values: {
      auto: 'Automatic (selected StartOS dependency)',
      custom: 'Custom host and port',
    },
  }),
  customNodeHost: sdk.Value.text({
    name: 'Custom Node Host',
    description:
      'Used only when Node Address Source is Custom. Example: bitcoincashd.startos or abcdef.onion',
    required: false,
    default: '',
    placeholder: 'bitcoincashd.startos',
    masked: false,
    minLength: 0,
    maxLength: 255,
  }),
  customNodePort: sdk.Value.number({
    name: 'Custom Node RPC Port',
    description: 'Used only when Node Address Source is Custom.',
    required: true,
    default: 8332,
    min: 1,
    max: 65535,
    integer: true,
    units: null,
  }),
  torMode: sdk.Value.select({
    name: 'RPC Network Mode',
    description:
      'Choose how ASICSeer reaches the node RPC endpoint. Tor modes use SOCKS5 via the Tor package proxy.',
    default: 'off',
    values: {
      off: 'Direct clearnet/internal routing',
      prefer: 'Prefer Tor proxy',
      only: 'Tor-only (fail if Tor proxy unavailable)',
    },
  }),
  torProxyHost: sdk.Value.text({
    name: 'Tor Proxy Host',
    description: 'SOCKS5 host used when RPC Network Mode is not Off.',
    required: false,
    default: 'tor.startos',
    placeholder: 'tor.startos',
    masked: false,
    minLength: 0,
    maxLength: 255,
  }),
  torProxyPort: sdk.Value.number({
    name: 'Tor Proxy Port',
    description: 'SOCKS5 port used when RPC Network Mode is not Off.',
    required: true,
    default: 9050,
    min: 1,
    max: 65535,
    integer: true,
    units: null,
  }),
  disableDevDonation: sdk.Value.toggle({
    name: 'Disable Developer Donation',
    description:
      'ASICSeer upstream includes an optional developer donation: 10% of the pool fee is split between the ASICSeer developer (Calin Culianu) and the BCHN project. ' +
      'This toggle is provided natively by the developer himself via the disable_dev_donation config key. ' +
      'When off (default), the donation is active. When on, the full pool fee goes to your payout address.',
    default: false,
  }),
  rpcAuthMode: sdk.Value.select({
    name: 'RPC Credentials Source',
    description:
      'Automatic uses credentials from the selected node package. Manual uses the values below.',
    default: 'auto',
    values: {
      auto: 'Automatic (from dependency store.json)',
      manual: 'Manual username/password',
    },
  }),
  manualRpcUser: sdk.Value.text({
    name: 'Manual RPC Username',
    description: 'Used only when RPC Credentials Source is Manual.',
    required: false,
    default: '',
    placeholder: 'bitcoincashd',
    masked: false,
    minLength: 0,
    maxLength: 120,
  }),
  manualRpcPassword: sdk.Value.text({
    name: 'Manual RPC Password',
    description: 'Used only when RPC Credentials Source is Manual.',
    required: false,
    default: '',
    placeholder: 'rpc password',
    masked: true,
    minLength: 0,
    maxLength: 256,
  }),
})

export const configure = sdk.Action.withInput(
  'configure',

  async ({ effects }) => ({
    name: 'Configure',
    description: 'Configure ASICSeer mining pool settings',
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  configSpec,

  async ({ effects }) => {
    const store = await storeJson.read().once()
    return {
      payoutAddress: store?.payoutAddress ?? '',
      poolFee: store?.poolFee ?? 1,
      poolIdentifier: store?.poolIdentifier ?? 'ASICSeer',
      poolDifficulty: store?.poolDifficulty ?? 42,
      disableDevDonation: store?.disableDevDonation ?? false,
      nodeAddressMode: store?.nodeAddressMode ?? 'auto',
      customNodeHost: store?.customNodeHost ?? '',
      customNodePort: store?.customNodePort ?? 8332,
      torMode: store?.torMode ?? 'off',
      torProxyHost: store?.torProxyHost ?? 'tor.startos',
      torProxyPort: store?.torProxyPort ?? 9050,
      rpcAuthMode: store?.rpcAuthMode ?? 'auto',
      manualRpcUser: store?.manualRpcUser ?? '',
      manualRpcPassword: store?.manualRpcPassword ?? '',
    }
  },

  async ({ effects, input }) => {
    await storeJson.merge(effects, {
      payoutAddress: input.payoutAddress,
      poolFee: input.poolFee,
      poolIdentifier: input.poolIdentifier,
      poolDifficulty: input.poolDifficulty,
      disableDevDonation: input.disableDevDonation,
      nodeAddressMode: input.nodeAddressMode,
      customNodeHost: input.customNodeHost ?? '',
      customNodePort: input.customNodePort,
      torMode: input.torMode,
      torProxyHost: input.torProxyHost ?? 'tor.startos',
      torProxyPort: input.torProxyPort,
      rpcAuthMode: input.rpcAuthMode,
      manualRpcUser: input.manualRpcUser ?? '',
      manualRpcPassword: input.manualRpcPassword ?? '',
    })
    // Pool settings live in store.json, which main.ts reads with .once() (not
    // reactive). Restart so the new payout address / fee / node target are
    // written into the asicseer config and picked up by the running daemons.
    await effects.restart()
    return null
  },
)
