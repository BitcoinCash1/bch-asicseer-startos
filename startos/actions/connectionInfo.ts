import { sdk } from '../sdk'
import { poolPort, soloPort, poolInterfaceId, soloInterfaceId } from '../utils'
import { storeJson } from '../file-models/store.json'

export const connectionInfo = sdk.Action.withoutInput(
  'connection-info',
  async ({ effects: _effects }) => ({
    name: 'Connection Info',
    description:
      'Show stratum connection URLs for pool and solo mining. Point your miners here.',
    warning: null,
    allowedStatuses: 'only-running' as const,
    group: null,
    visibility: 'enabled' as const,
  }),
  async ({ effects }) => {
    const store = await storeJson.read().once()
    const payoutAddress = store?.payoutAddress ?? ''

    const poolIface = await sdk.serviceInterface
      .getOwn(effects, poolInterfaceId)
      .once()
    const soloIface = await sdk.serviceInterface
      .getOwn(effects, soloInterfaceId)
      .once()

    const getAddresses = (
      iface: typeof poolIface,
      fallbackPort: number,
    ): string[] => {
      if (!iface?.addressInfo) return []
      const hostnames = iface.addressInfo.nonLocal.hostnames
      return hostnames.map((h) => {
        const port = h.port ?? fallbackPort
        return `stratum+tcp://${h.hostname}:${port}`
      })
    }

    const poolAddrs = getAddresses(poolIface, poolPort)
    const soloAddrs = getAddresses(soloIface, soloPort)

    const members: Array<{
      name: string
      description: string | null
      type: 'single'
      value: string
      copyable: boolean
      qr: boolean
      masked: boolean
    }> = []

    if (poolAddrs.length > 0) {
      members.push({
        name: 'Pool Stratum URL',
        description: 'Shared reward mining — connect your miners here',
        type: 'single' as const,
        value: poolAddrs[0],
        copyable: true,
        qr: false,
        masked: false,
      })
    }

    if (soloAddrs.length > 0) {
      members.push({
        name: 'Solo Stratum URL',
        description: 'Winner-takes-all mining — you keep the entire block reward',
        type: 'single' as const,
        value: soloAddrs[0],
        copyable: true,
        qr: false,
        masked: false,
      })
    }

    members.push({
      name: 'Username',
      description: 'Your BCH payout address — the pool requires a valid address as the stratum username',
      type: 'single' as const,
      value: payoutAddress || '(configure payout address first)',
      copyable: true,
      qr: false,
      masked: false,
    })

    members.push({
      name: 'Password',
      description: 'Can be anything — stratum v1 does not use password auth',
      type: 'single' as const,
      value: 'x',
      copyable: true,
      qr: false,
      masked: false,
    })

    if (members.length === 0) {
      return {
        version: '1' as const,
        title: 'Connection Info',
        message:
          'Stratum interfaces are not yet available. Make sure the service is running and try again.',
        result: null,
      }
    }

    return {
      version: '1' as const,
      title: 'Miner Connection Info',
      message:
        'Point your ASIC or mining software to one of these stratum URLs. Use your BCH address as the username.',
      result: {
        type: 'group' as const,
        value: members,
      },
    }
  },
)
