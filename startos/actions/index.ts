import { sdk } from '../sdk'
import { configure } from './configure'
import { connectionInfo } from './connectionInfo'
import { selectNode } from './selectNode'
import { wipeMiningState } from './wipeMiningState'

export const actions = sdk.Actions.of()
  .addAction(connectionInfo)
  .addAction(configure)
  .addAction(selectNode)
  .addAction(wipeMiningState)
