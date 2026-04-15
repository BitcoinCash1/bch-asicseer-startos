import { sdk } from '../sdk'
import { poolPort, soloPort, poolInterfaceId, soloInterfaceId } from '../utils'

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
    const poolIface = await sdk.serviceInterface
      .getOwn(effects, poolInterfaceId)
      .once()
    const soloIface = await sdk.serviceInterface
      .getOwn(effects, soloInterfaceId)
      .once()

    type Member = {
      name: string
      description: string | null
      type: 'single'
      value: string
      copyable: boolean
      qr: boolean
      masked: boolean
    }

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

    const members: Member[] = []

    // Show all available pool addresses
    for (let i = 0; i < poolAddrs.length; i++) {
      members.push({
        name: i === 0 ? 'Pool Stratum URL' : `Pool Stratum URL (${i + 1})`,
        description: i === 0 ? 'Shared reward mining — connect your miners here' : null,
        type: 'single' as const,
        value: poolAddrs[i],
        copyable: true,
        qr: false,
        masked: false,
      })
    }

    // Show all available solo addresses
    for (let i = 0; i < soloAddrs.length; i++) {
      members.push({
        name: i === 0 ? 'Solo Stratum URL' : `Solo Stratum URL (${i + 1})`,
        description: i === 0 ? 'Winner-takes-all mining — you keep the entire block reward' : null,
        type: 'single' as const,
        value: soloAddrs[i],
        copyable: true,
        qr: false,
        masked: false,
      })
    }

    members.push({
      name: 'Username',
      description:
        'Your BCH address, optionally with a worker name: address.workername — ' +
        'e.g. bitcoincash:qr...abc.rig1 — miners without a .name suffix get auto-assigned worker01, worker02, etc.',
      type: 'single' as const,
      value: '<your BCH address>.<worker name>',
      copyable: false,
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
        'Point your ASIC or mining software to a stratum URL below. Set your own BCH payout address as the username — the pool pays directly to whatever address you configure on your miner.',
      result: {
        type: 'group' as const,
        value: members,
      },
    }
  },
)
