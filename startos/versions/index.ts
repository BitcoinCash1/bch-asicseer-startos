import { VersionGraph } from '@start9labs/start-sdk'
import { v_1_0_0_2 } from './v1.0.0.2'
import { v_1_0_0_1 } from './v1.0.0.1'
import { v_1_0_0_0 } from './v1.0.0.0'

export const versionGraph = VersionGraph.of({
  current: v_1_0_0_2,
  other: [v_1_0_0_1, v_1_0_0_0],
})
