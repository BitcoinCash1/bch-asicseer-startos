import { selectNode } from '../actions/selectNode'
import { sdk } from '../sdk'

export const taskSelectNode = sdk.setupOnInit(async (effects, kind) => {
  if (kind === 'install') {
    await sdk.action.createOwnTask(effects, selectNode, 'critical', {
      reason: 'Confirm which BCH node package should back this ASICSeer instance',
    })
  }
})
