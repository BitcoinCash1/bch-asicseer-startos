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
      'Initial share difficulty for new miners. Lower values are better for small miners (e.g., Bitaxe). Higher values reduce server load for large farms.',
    required: true,
    default: 64,
    min: 1,
    max: 1000000,
    integer: true,
    units: null,
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
      poolDifficulty: store?.poolDifficulty ?? 64,
    }
  },

  async ({ effects, input }) => {
    await storeJson.merge(effects, {
      payoutAddress: input.payoutAddress,
      poolFee: input.poolFee,
      poolIdentifier: input.poolIdentifier,
      poolDifficulty: input.poolDifficulty,
    })
    return 'Pool configuration saved. Restart ASICSeer to apply changes.'
  },
)
