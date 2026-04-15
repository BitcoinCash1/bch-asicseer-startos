import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  payoutAddress: z.string().catch(''),
  poolFee: z.number().catch(1),
  poolIdentifier: z.string().catch('ASICSeer'),
  poolDifficulty: z.number().catch(64),
  nodeBackend: z.enum(['bitcoin-cash-node', 'knuth-bch', 'bitcoin-cash-daemon']).catch('bitcoin-cash-node'),
  nodeRpcUser: z.string().catch(''),
  nodeRpcPassword: z.string().catch(''),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: 'store.json',
  },
  shape,
)
