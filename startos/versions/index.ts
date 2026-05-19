import { VersionGraph } from '@start9labs/start-sdk'
import { v_1_5_4_3 } from './v1.5.4.3'
import { v_1_5_4_2 } from './v1.5.4.2'
import { v_1_5_4_1 } from './v1.5.4.1'
import { v_1_5_4_0 } from './v1.5.4.0'
import { v_1_0_4_0 } from './v1.0.4.0'
import { v_1_0_3_0 } from './v1.0.3.0'
import { v_1_0_2_0 } from './v1.0.2.0'
import { v_1_0_1_0 } from './v1.0.1.0'
import { v_1_0_0_1 } from './v1.0.0.1'
import { v_1_0_0_0 } from './v1.0.0.0'

export const versionGraph = VersionGraph.of({
  current: v_1_5_4_3,
  other: [v_1_5_4_2, v_1_5_4_1, v_1_5_4_0, v_1_0_4_0, v_1_0_3_0, v_1_0_2_0, v_1_0_1_0, v_1_0_0_1, v_1_0_0_0],
})
