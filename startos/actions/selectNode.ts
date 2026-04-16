import { sdk } from '../sdk'
import { storeJson } from '../file-models/store.json'

const { InputSpec, Value } = sdk

const nodeInputSpec = InputSpec.of({
  nodePackageId: Value.select({
    name: 'Node Backend',
    description: 'Select which BCH full node ASICSeer should connect to.',
    default: 'bitcoincashd',
    values: {
      bitcoincashd: 'Bitcoin Cash Node (BCHN)',
      bchd: 'Bitcoin Cash Daemon (BCHD)',
    },
  }),
})

export const selectNode = sdk.Action.withInput(
  'select-node',

  {
    name: 'Select Node Backend',
    description:
      'Choose which BCH node package ASICSeer should use for mining RPC.',
    warning:
      'Changing the node package may require dependency reconfiguration and service restart.',
    allowedStatuses: 'any',
    group: null,
    visibility: 'enabled',
  },

  nodeInputSpec,

  async ({ effects }) => {
    const store = await storeJson.read().once()
    const nodePackageId = store?.nodePackageId ?? 'bitcoincashd'
    return {
      nodePackageId: nodePackageId as 'bitcoincashd' | 'bchd',
    }
  },

  async ({ effects, input }) => {
    await storeJson.merge(effects, {
      nodePackageId: input.nodePackageId,
    })
  },
)
