import { T } from '@start9labs/start-sdk'
import { i18n } from '../i18n'
import { sdk } from '../sdk'
import { poolInterfaceId } from '../utils'

export const connectionInfo = sdk.Action.withoutInput(
  'connection-info',

  async () => ({
    name: i18n('Connection Info'),
    description: i18n('Show what to enter on your mining hardware.'),
    warning: null,
    allowedStatuses: 'only-running',
    group: null,
    visibility: 'enabled',
  }),

  async ({ effects }) => {
    // The addresses miners on the network can reach the stratum endpoint at.
    const urls =
      (await sdk.host
        .getOwn(effects, 'pool-mining', (host) =>
          Object.values(host?.bindings ?? {})
            .flatMap((b) => Object.values(b.interfaces))
            .find((i) => i.id === poolInterfaceId)
            ?.addressInfo.nonLocal.format(),
        )
        .once()) ?? []

    if (!urls.length) {
      return {
        version: '1',
        title: i18n('Connection Info'),
        message: i18n(
          'No mining address is available yet. Start the pool and try again.',
        ),
        result: null,
      }
    }

    const addresses: T.ActionResultMember[] = urls.map((value, i) => ({
      name:
        urls.length > 1
          ? `${i18n('Mining Address')} ${i + 1}`
          : i18n('Mining Address'),
      description: i === 0 ? i18n('Point your miner here') : null,
      type: 'single',
      value,
      copyable: true,
      qr: false,
      masked: false,
    }))

    return {
      version: '1',
      title: i18n('Connection Info'),
      message: i18n(
        'Use the Bitcoin Cash address you want a miner paid at as its username — every block the pool finds is split in its coinbase between the miners that worked on it, paid straight to those addresses. The payout address configured here receives only your pool fee.',
      ),
      result: {
        type: 'group',
        value: [
          ...addresses,
          {
            name: i18n('Username'),
            description: i18n(
              'Your Bitcoin Cash address, optionally followed by a dot and a name for that miner — bitcoincash:qr….rig1. Miners with no name are numbered worker01, worker02 and so on.',
            ),
            type: 'single',
            value: '<your BCH address>.<worker name>',
            copyable: false,
            qr: false,
            masked: false,
          },
          {
            name: i18n('Password'),
            description: i18n('Anything — Stratum does not check it.'),
            type: 'single',
            value: 'x',
            copyable: true,
            qr: false,
            masked: false,
          },
        ],
      },
    }
  },
)
