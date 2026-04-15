import { sdk } from '../sdk'
import { storeJson } from '../file-models/store.json'

export const seedFiles = sdk.setupOnInit(async (effects) => {
  const existing = await storeJson.read().once()
  if (!existing?.payoutAddress) {
    await storeJson.merge(effects, {
      payoutAddress: '',
      poolFee: 1,
      poolIdentifier: 'ASICSeer',
      poolDifficulty: 64,
      nodeBackend: 'bitcoin-cash-node',
      nodeRpcUser: '',
      nodeRpcPassword: '',
    })
  }
})
