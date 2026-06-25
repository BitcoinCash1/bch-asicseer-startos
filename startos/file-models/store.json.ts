import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

export const shape = z.object({
  nodePackageId: z.string().catch('bitcoincashd'),
  nodeConfirmed: z.boolean().catch(true),
  payoutAddress: z.string().catch(''),
  poolFee: z.number().catch(1),
  poolIdentifier: z.string().catch('ASICSeer'),
  poolDifficulty: z.number().catch(42),
  nodeAddressMode: z.enum(['auto', 'custom']).catch('auto'),
  customNodeHost: z.string().catch(''),
  customNodePort: z.number().catch(8332),
  torMode: z.enum(['off', 'prefer', 'only']).catch('off'),
  torProxyHost: z.string().catch('tor.startos'),
  torProxyPort: z.number().catch(9050),
  rpcAuthMode: z.enum(['auto', 'manual']).catch('auto'),
  manualRpcUser: z.string().catch(''),
  manualRpcPassword: z.string().catch(''),
  nodeRpcUser: z.string().catch(''),
  nodeRpcPassword: z.string().catch(''),
  disableDevDonation: z.boolean().catch(false),
  // Set true by the "Wipe Mining State" action; consumed (and cleared) by
  // main.ts on the next start to delete persisted pool stats.
  wipePending: z.boolean().catch(false),
  // The node network used at the last successful start. If it changes, main.ts
  // auto-wipes stats so cross-network numbers don't leak (e.g. mainnet shares
  // shown against chipnet difficulty).
  lastNetwork: z.string().catch(''),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: 'store.json',
  },
  shape,
)
