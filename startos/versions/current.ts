import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

/**
 * Whether users may downgrade from this release to an earlier one. Set it per
 * release: `true` only when earlier versions can still read the data this one
 * leaves behind, `false` when this release is one-way.
 */
const ALLOW_DOWNGRADE = false

export const current = VersionInfo.of({
  version: '1.5.4:25',
  releaseNotes: {
    en_US:
      'Knuth is available again as a node backend. It is wired the same way as the other nodes: the pool asks Knuth to turn JSON-RPC on and use its full database mode, then mines through it.',
    es_ES:
      'Knuth vuelve a estar disponible como nodo. Se conecta igual que los demás: el pool pide a Knuth que active JSON-RPC y use su modo de base de datos completo, y mina a través de él.',
    de_DE:
      'Knuth steht wieder als Knoten zur Verfügung. Es wird wie die anderen Knoten angebunden: Der Pool bittet Knuth, JSON-RPC einzuschalten und den vollständigen Datenbankmodus zu verwenden, und mint dann darüber.',
    pl_PL:
      'Knuth znów jest dostępny jako węzeł. Jest podłączony tak jak pozostałe węzły: kopalnia prosi Knuth o włączenie JSON-RPC i pełnego trybu bazy danych, a następnie kopie przez niego.',
    fr_FR:
      "Knuth est de nouveau disponible comme nœud. Il est branché comme les autres : le pool demande à Knuth d'activer JSON-RPC et son mode de base de données complet, puis mine à travers lui.",
  },
  migrations: {
    up: async ({ effects }) => {},
    down: ALLOW_DOWNGRADE ? async () => {} : IMPOSSIBLE,
  },
})
