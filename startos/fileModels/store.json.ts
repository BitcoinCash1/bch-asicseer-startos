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
  // Flowee authenticates against hashed `rpcauth` entries and cannot hand a
  // password back out, so the credential the pool dials it with is minted here
  // and registered on Flowee by the Select Node Backend action. BCHN and BCHD
  // publish their own credentials in their `store.json`, which `main` reads off
  // the mounted node volume — nothing to keep here for them.
  floweeRpcUser: z.string().catch(''),
  floweeRpcPassword: z.string().catch(''),
  // Set by the Wipe Mining State action, consumed and cleared by `main` on the
  // next start. Deliberately outside the reactive read in `main` — the clearing
  // write would otherwise restart the service it just started.
  wipePending: z.boolean().catch(false),
  // The chain the node was on at the last start. Mining stats are meaningless
  // across a chain change (mainnet shares against chipnet difficulty), so
  // `main` wipes them when this moves.
  lastNetwork: z.string().catch(''),
})

export const storeJson = FileHelper.json(
  {
    base: sdk.volumes.main,
    subpath: '/store.json',
  },
  shape,
)
