import { IMPOSSIBLE, VersionInfo } from '@start9labs/start-sdk'

export const current = VersionInfo.of({
  version: '1.5.4:24',
  releaseNotes: {
    en_US:
      'The pool now reaches its node the way StartOS intends, which fixes mining against Flowee the Hub — its RPC credentials moved and the pool was still looking for the old ones. Choosing Knuth as the backend is gone: it does not serve the kind of block template this pool asks for. Mining addresses are shown as stratum+tcp:// URLs you can copy straight into a miner, a new Node health check reports when the node is still syncing, and setting a pool fee of 0% now really means zero.',
    es_ES:
      'El pool ahora llega a su nodo como StartOS espera, lo que arregla la minería con Flowee the Hub: sus credenciales RPC cambiaron de sitio y el pool seguía buscando las antiguas. Se elimina Knuth como backend: no sirve el tipo de plantilla de bloque que pide este pool. Las direcciones de minería se muestran como URLs stratum+tcp:// que puede copiar directamente en un minero, una nueva comprobación de estado Nodo avisa cuando el nodo aún se está sincronizando, y una comisión del 0% ahora significa realmente cero.',
    de_DE:
      'Der Pool erreicht seinen Knoten jetzt auf dem von StartOS vorgesehenen Weg. Das repariert das Mining mit Flowee the Hub: dessen RPC-Zugangsdaten sind umgezogen, der Pool suchte noch die alten. Knuth als Backend entfällt — es liefert nicht die Art von Blockvorlage, die dieser Pool anfordert. Mining-Adressen werden als stratum+tcp://-URLs angezeigt, die sich direkt in einen Miner kopieren lassen, eine neue Zustandsprüfung „Knoten" meldet, wenn der Knoten noch synchronisiert, und eine Poolgebühr von 0 % bedeutet jetzt wirklich null.',
    pl_PL:
      'Kopalnia łączy się teraz ze swoim węzłem w sposób przewidziany przez StartOS, co naprawia kopanie z Flowee the Hub — jego dane logowania RPC zmieniły miejsce, a kopalnia wciąż szukała starych. Knuth jako zaplecze został usunięty: nie udostępnia szablonów bloków, o które prosi ta kopalnia. Adresy do kopania są pokazywane jako adresy stratum+tcp://, które można wkleić wprost do koparki, nowa kontrola stanu „Węzeł" informuje, gdy węzeł wciąż się synchronizuje, a prowizja 0% naprawdę oznacza zero.',
    fr_FR:
      "Le pool joint désormais son nœud de la manière prévue par StartOS, ce qui répare le minage avec Flowee the Hub : ses identifiants RPC ont changé de place et le pool cherchait toujours les anciens. Knuth disparaît comme backend : il ne fournit pas le type de modèle de bloc que ce pool demande. Les adresses de minage sont affichées sous forme d'URL stratum+tcp:// à copier directement dans un mineur, un nouveau contrôle d'état « Nœud » signale quand le nœud est encore en cours de synchronisation, et des frais de pool de 0 % veulent enfin dire zéro.",
  },
  migrations: {
    up: async ({ effects }) => {},
    down: IMPOSSIBLE,
  },
})
