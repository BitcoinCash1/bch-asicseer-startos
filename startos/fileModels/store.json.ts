import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'
import { NODE_IDS } from '../utils'

export const shape = z.object({
  nodePackageId: z.enum(NODE_IDS).catch('bitcoincashd'),
  nodeConfirmed: z.boolean().catch(false),
  payoutAddress: z.string().catch(''),
  poolFee: z.number().catch(1),
  poolIdentifier: z.string().catch('ASICSeer'),
  poolDifficulty: z.number().catch(42),
  disableDevDonation: z.boolean().catch(false),
  // Flowee stores only a hash and cannot hand a password back, so the pool
  // mints its own and Select Node Backend registers it there. BCHN and BCHD
  // publish theirs in their own `store.json`.
  floweeRpcUser: z.string().catch(''),
  floweeRpcPassword: z.string().catch(''),
  // Set by Wipe Mining State, cleared by `main` on the next start. Outside
  // `main`'s reactive read, or clearing it would restart the service.
  wipePending: z.boolean().catch(false),
  // The chain at the last start; `main` wipes the stats when it moves.
  lastNetwork: z.string().catch(''),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
