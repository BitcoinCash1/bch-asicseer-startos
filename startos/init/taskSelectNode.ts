import { selectNode } from '../actions/selectNode'
import { i18n } from '../i18n'
import { sdk } from '../sdk'

export const taskSelectNode = sdk.setupOnInit(async (effects, kind) => {
  if (kind !== 'install') return

  await sdk.action.createOwnTask(effects, selectNode, 'critical', {
    reason: i18n('Choose which Bitcoin Cash node the pool mines on'),
  })
})
