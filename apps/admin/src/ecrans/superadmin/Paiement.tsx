import { Carte, CarteStat } from '@kolek/ui';

import type { EtatPaiement } from '../../superadmin';

/** Ce que chaque état de la boutique veut dire, et ce qu'il faut en faire. */
const BOUTIQUE: Record<EtatPaiement['boutique'], { ton: 'ok' | 'ko' | 'neutre'; texte: string }> = {
  joignable: { ton: 'ok', texte: 'La boutique répond et accepte la clé.' },
  refusee: {
    ton: 'ko',
    texte:
      'La boutique refuse la clé (401/403). Elle est posée mais fausse, révoquée ou d’un autre compte — en régénérer une.',
  },
  injoignable: {
    ton: 'ko',
    texte:
      'La boutique n’a pas répondu en trois secondes. La clé n’est pas en cause : c’est le service ou le réseau.',
  },
  non_configuree: { ton: 'neutre', texte: 'Aucune clé posée : rien n’a été demandé à la boutique.' },
};

/** Ce que chaque etat s'appelle a l'ecran.
 *
 * Quatre etats, quatre libelles. Les ecraser en « Joignable / Injoignable »
 * faisait dire « Injoignable » a `non_configuree`, qui signifie exactement
 * l'inverse : aucune cle posee, donc rien n'a ete demande, donc rien n'a
 * echoue. Annoncer un echec qui n'a pas eu lieu vaut moins que ne rien dire.
 */
const LIBELLE_BOUTIQUE: Record<EtatPaiement['boutique'], string> = {
  joignable: 'Joignable',
  refusee: 'Clé refusée',
  injoignable: 'Injoignable',
  non_configuree: 'Non configurée',
};

function Pastille({ ok, libelle }: { ok: boolean; libelle: string }) {
  return (
    <span
      className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap ${
        ok ? 'bg-positive-tint text-positive' : 'bg-negative-tint text-negative'
      }`}
    >
      {libelle}
    </span>
  );
}

/**
 * L'état du paiement d'abonnement.
 *
 * **Aucun champ de saisie, et c'est le sujet de cet écran.** La question posée
 * le 2026-09-02 était « il n'y a pas de place pour la clé API Chariow ». Il ne
 * doit pas y en avoir : une clé qui encaisse ne traverse pas le navigateur d'un
 * administrateur, ne se pose pas en base, et ne revient pas à l'écran à chaque
 * ouverture de page. Elle vit dans l'environnement des Edge Functions, et
 * `verifier-bundles.mjs` refuse tout artefact qui en porterait la trace.
 *
 * Ce qui manquait n'était pas un champ, c'était la réponse à la vraie question :
 * **est-ce configuré, et est-ce que ça marche ?** Sans cet écran, la seule façon
 * de l'apprendre serait qu'un collecteur échoue à payer.
 *
 * D'où deux blocs et non un : ce que l'environnement **déclare**, puis ce que la
 * boutique **répond**. Une clé présente et fausse coche la première case et rate
 * la seconde — c'est toute la différence entre une case cochée et un contrôle.
 */
export function Paiement({ paiement }: { paiement: EtatPaiement | null }) {
  if (!paiement) {
    return (
      <section>
        <Carte className="p-5">
          <p className="font-body text-sm text-muted-foreground">
            La fonction <code>super-admin-etat</code> en ligne ne rend pas encore l’état du
            paiement. Redéploie-la pour que cet écran ait quelque chose à lire.
          </p>
        </Carte>
      </section>
    );
  }

  const boutique = BOUTIQUE[paiement.boutique];
  const manquants = paiement.produits.filter((p) => !p.configure);

  return (
    <section>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Aucune clé ne se saisit ici, et il n’y a pas de champ pour ça. Une clé qui encaisse vit dans
        les secrets des Edge Functions — <code>npx supabase secrets set</code>, voir{' '}
        <code>Docs/deploiement.md</code> §7. Cet écran dit ce qui est posé et si la boutique
        l’accepte, jamais ce que valent les secrets.
      </p>

      {/* `manquants` et `boutique` sont calcules au-dessus du `return` : rien
          a deplacer. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Produits déclarés"
          valeur={`${paiement.produits.filter((p) => p.configure).length} / ${paiement.produits.length}`}
          precision={manquants.length > 0 ? 'un palier ne peut pas être payé' : 'tous les paliers'}
          icone="receipt"
          alerte={manquants.length > 0}
        />
        <CarteStat
          libelle="Boutique"
          valeur={LIBELLE_BOUTIQUE[paiement.boutique]}
          precision={boutique.texte}
          icone="landmark"
          alerte={boutique.ton === 'ko'}
        />
      </div>

      <div data-testid="paiement">
        <Carte className="p-5 space-y-5">
          <div>
            <p className="font-body text-sm font-semibold text-ink mb-2">Ce qui est déclaré</p>
            <dl className="space-y-2.5">
              <div className="flex items-center justify-between gap-4">
                <dt className="font-body text-sm text-muted-foreground">
                  Clé d’API <code>CHARIOW_CLE_API</code>
                </dt>
                <dd className="flex items-center gap-2">
                  {paiement.cleIndice && (
                    <span className="font-body text-xs text-muted-foreground tabular-nums">
                      …{paiement.cleIndice}
                    </span>
                  )}
                  <Pastille
                    ok={paiement.cleConfiguree}
                    libelle={paiement.cleConfiguree ? 'Posée' : 'Absente'}
                  />
                </dd>
              </div>

              <div className="flex items-center justify-between gap-4">
                <dt className="font-body text-sm text-muted-foreground">
                  Secret de webhook <code>CHARIOW_SECRET_WEBHOOK</code>
                </dt>
                <dd>
                  <Pastille
                    ok={paiement.webhookConfigure}
                    libelle={paiement.webhookConfigure ? 'Posé' : 'Absent ou trop court'}
                  />
                </dd>
              </div>

              <div className="flex items-start justify-between gap-4">
                <dt className="font-body text-sm text-muted-foreground">
                  Produits <code>CHARIOW_PRODUITS</code>
                </dt>
                <dd className="flex flex-wrap justify-end gap-1.5">
                  {paiement.produits.map((p) => (
                    <Pastille key={p.palier} ok={p.configure} libelle={p.palier} />
                  ))}
                </dd>
              </div>
            </dl>

            {manquants.length > 0 && (
              <p role="alert" className="font-body text-sm text-negative mt-3">
                {manquants.length === 1
                  ? `Le palier ${manquants[0]?.palier} n’a pas de produit déclaré.`
                  : `${manquants.length} paliers n’ont pas de produit déclaré.`}{' '}
                Un collecteur qui choisit ce palier-là verra le paiement refusé, et il finira par
                le choisir.
              </p>
            )}
          </div>

          <div className="border-t border-hairline pt-4">
            <p className="font-body text-sm font-semibold text-ink mb-2">Ce que la boutique répond</p>
            <p
              role={boutique.ton === 'ko' ? 'alert' : 'status'}
              className={`font-body text-sm ${
                boutique.ton === 'ok'
                  ? 'text-positive'
                  : boutique.ton === 'ko'
                    ? 'text-negative'
                    : 'text-muted-foreground'
              }`}
            >
              {boutique.texte}
            </p>
            <p className="font-body text-xs text-muted-foreground mt-2">
              Mesuré à l’ouverture de cet écran, par un <code>GET /products</code> chez Chariow —
              la lecture la plus inoffensive du contrat. Trois secondes d’attente au plus : une
              boutique en panne ne doit pas empêcher d’afficher la page où l’on vient justement
              voir ce qui ne va pas.
            </p>
          </div>
        </Carte>
      </div>
    </section>
  );
}
