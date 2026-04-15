import { sdk } from '../sdk'
import { configure } from './configure'
import { connectionInfo } from './connectionInfo'

export const actions = sdk.Actions.of()
  .addAction(connectionInfo)
  .addAction(configure)
