import { storeJson } from '../fileModels/store.json'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

const { InputSpec, Value } = sdk

export const configure = sdk.Action.withInput(
  'configure',

  async () => ({
    name: i18n('Configure'),
    description: i18n('Set the payout address and how the pool pays out.'),
    warning: null,
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  }),

  InputSpec.of({
    payoutAddress: Value.text({
      name: i18n('Payout Address'),
      description: i18n(
        'The address a found block pays to. It must belong to the chain the node is on — mainnet addresses start bitcoincash:, the test chains bchtest:, regtest bchreg:.',
      ),
      required: true,
      default: null,
      placeholder: 'bitcoincash:qr...',
      masked: false,
      patterns: [
        {
          regex:
            '^((bitcoincash|bchtest|bchreg):)?[qpQP][a-zA-Z0-9]{41}$|^[123mn][a-km-zA-HJ-NP-Z1-9]{25,34}$',
          description: i18n(
            'A Bitcoin Cash address, either CashAddr (bitcoincash:q…) or legacy.',
          ),
        },
      ],
    }),
    poolFee: Value.number({
      name: i18n('Pool Fee'),
      description: i18n(
        'The share of each block reward the pool keeps. The rest is split between the miners that worked on it.',
      ),
      required: true,
      default: 1,
      min: 0,
      max: 10,
      integer: false,
      units: '%',
    }),
    poolIdentifier: Value.text({
      name: i18n('Pool Identifier'),
      description: i18n(
        'Written into the coinbase transaction of every block this pool finds, where block explorers show it.',
      ),
      required: true,
      default: 'ASICSeer',
      placeholder: 'ASICSeer',
      masked: false,
      minLength: 1,
      maxLength: 30,
    }),
    poolDifficulty: Value.number({
      name: i18n('Starting Difficulty'),
      description: i18n(
        'The share difficulty a miner is given when it first connects. The pool raises or lowers it from there to match what the miner can actually do.',
      ),
      required: true,
      default: 42,
      min: 1,
      max: 1000000,
      integer: true,
      units: null,
    }),
    disableDevDonation: Value.toggle({
      name: i18n('Disable Developer Donation'),
      description: i18n(
        'ASICSeer donates a tenth of the pool fee — not of the block reward — to its author and to Bitcoin Cash Node. Turn this on to keep the whole fee.',
      ),
      default: false,
    }),
  }),

  async () => {
    const store = await storeJson.read().once()
    return {
      payoutAddress: store?.payoutAddress ?? '',
      poolFee: store?.poolFee ?? 1,
      poolIdentifier: store?.poolIdentifier ?? 'ASICSeer',
      poolDifficulty: store?.poolDifficulty ?? 42,
      disableDevDonation: store?.disableDevDonation ?? false,
    }
  },

  // `main` reads these through a `.const()`, so writing them here is what
  // restarts the pool onto the new settings.
  async ({ effects, input }) => storeJson.merge(effects, input),
)
