import { sdk } from './sdk'
import { storeJson } from './file-models/store.json'

export const setDependencies = sdk.setupDependencies(async ({ effects }) => {
  const store = await storeJson.read().once()
  const nodeBackend = store?.nodeBackend ?? 'bitcoin-cash-node'

  const deps: Record<string, any> = {}

  switch (nodeBackend) {
    case 'bitcoin-cash-node':
      deps['bitcoin-cash-node'] = {
        kind: 'running' as const,
        versionRange: '>=0.1.0:0',
        healthChecks: ['primary'],
      }
      break
    case 'knuth-bch':
      deps['knuth-bch'] = {
        kind: 'running' as const,
        versionRange: '>=0.1.0:0',
        healthChecks: ['primary'],
      }
      break
    case 'bitcoin-cash-daemon':
      deps['bitcoin-cash-daemon'] = {
        kind: 'running' as const,
        versionRange: '>=0.1.0:0',
        healthChecks: ['primary'],
      }
      break
  }

  return deps
})
