import { VersionGraph } from '@start9labs/start-sdk'
import { v_1_0_2_0 } from './v1.0.2.0'
import { v_1_0_1_0 } from './v1.0.1.0'
import { v_1_0_0_1 } from './v1.0.0.1'
import { v_1_0_0_0 } from './v1.0.0.0'

export const versionGraph = VersionGraph.of({
  current: v_1_0_2_0,
  other: [v_1_0_1_0, v_1_0_0_1, v_1_0_0_0],
})
