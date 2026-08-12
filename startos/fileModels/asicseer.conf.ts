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
 * asicseer-pool reads `pool_fee` through jansson's `json_is_real`, which is
 * false for a whole number: `"pool_fee": 0` is discarded and silently replaced
 * by the built-in 1% default, so a pool configured to take nothing would take
 * one percent. JSON cannot spell zero as a float, so the value is stitched in
 * after serialisation, keyed off a sentinel that cannot collide with anything
 * `JSON.stringify` emits.
 */
const POOL_FEE = ' pool_fee '

/**
 * Lives on the shared volume, where the dashboard's stats script also reads the
 * RPC target and stratum port back out of it. Regenerated in full by `main` on
 * every start.
 */
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
