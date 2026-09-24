import { FileHelper, z } from '@start9labs/start-sdk'
import { sdk } from '../sdk'

const shape = z.object({
  btcd: z.array(
    z.object({
      url: z.string(),
      auth: z.string(),
      pass: z.string(),
      notify: z.boolean(),
    }),
  ),
  bchaddress: z.string(),
  bchsig: z.string(),
  blockpoll: z.number(),
  update_interval: z.number(),
  serverurl: z.array(z.string()),
  mindiff: z.number(),
  startdiff: z.number(),
  maxdiff: z.number(),
  logdir: z.string(),
  pool_fee: z.number(),
  disable_dev_donation: z.boolean().optional(),
})

export type AsicseerConf = z.infer<typeof shape>

/**
 * asicseer-pool reads `pool_fee` with jansson's `json_is_real`, which rejects a
 * whole number and falls back to its 1% default — so a 0% fee would charge 1%.
 * JSON cannot spell a whole number as a float, hence the sentinel.
 */
const POOL_FEE = ' pool_fee '

/** On the shared volume, where the dashboard's stats script reads it too. */
export const asicseerConf = FileHelper.raw<AsicseerConf>(
  { base: sdk.volumes.main, subpath: 'pool/asicseer.conf' },
  (conf) =>
    JSON.stringify({ ...conf, pool_fee: POOL_FEE }, null, 2).replace(
      JSON.stringify(POOL_FEE),
      conf.pool_fee.toFixed(3),
    ),
  JSON.parse,
  (data) => shape.parse(data),
)
