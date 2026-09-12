import { formatMontant, ilYaLisible } from '@kolek/core';
import { Bouton, Carte, CarteStat } from '@kolek/ui';
import { useState } from 'react';

import { chargerJournal, type PageJournal } from '../../superadmin';

const TAILLE_PAGE = 50;

function horodatage(iso: string): string {
  return new Date(iso).toLocaleString('fr-FR');
}

/**
 * Le journal ne se charge pas tout seul, et c'est le point.
 *
 * Chaque lecture s'enregistre dans le journal — c'est l'action qui révèle tout
 * le reste, et sans cette trace ce serait la seule à ne rien laisser. La
 * déclencher à l'ouverture de l'écran remplirait la table de la preuve qu'on la
 * regarde : en une semaine, elle ne parlerait plus que d'elle-même, et ce
 * qu'elle protège serait enterré dessous.
 *
 * Il faut donc le demander. C'est un clic de plus, assumé.
 */
export function Journal({
  volumes,
  journal,
}: {
  volumes: Record<string, number>;
  journal: { derniere_ecriture: string | null; tables: string[] };
}) {
  const [page, setPage] = useState<PageJournal | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [consultations, setConsultations] = useState(false);

  async function lire(numero: number, avecConsultations: boolean) {
    setEnCours(true);
    setErreur(null);
    try {
      setPage(
        await chargerJournal({
          page: numero,
          taille: TAILLE_PAGE,
          consultations: avecConsultations,
        }),
      );
      setConsultations(avecConsultations);
    } catch (cause) {
      setErreur(cause instanceof Error ? cause.message : 'Lecture impossible.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <section>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Qui a fait quoi, sur quelle ligne, et quand. Le journal est en écriture seule : un
        déclencheur refuse toute modification, y compris par la clé de service.{' '}
        <strong className="font-semibold text-ink">Le consulter s'enregistre</strong> — c'est
        pourquoi il ne s'affiche pas de lui-même.
      </p>

      {/* La taille du journal, sans le lire : la lecture s’y enregistre, et
          c’est tout le sujet de cet ecran. Ces trois chiffres viennent de
          l’etat deja charge. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
        <CarteStat
          libelle="Lignes de journal"
          valeur={formatMontant(volumes.audit_log ?? 0)}
          precision="depuis l’origine"
          icone="history"
        />
        <CarteStat
          libelle="Tables tracées"
          valeur={String(journal.tables.length)}
          precision="lu dans pg_trigger"
          icone="shield-check"
        />
        <CarteStat
          libelle="Dernière écriture"
          valeur={journal.derniere_ecriture ? ilYaLisible(journal.derniere_ecriture) : '—'}
          precision={journal.derniere_ecriture ? '' : 'aucune écriture'}
          icone="check-circle"
        />
      </div>

      <Carte className="p-5">
        {!page && !erreur && (
          <Bouton icone="history" disabled={enCours} onClick={() => void lire(1, false)}>
            Afficher le journal
          </Bouton>
        )}

        {erreur && (
          <>
            <p role="alert" className="font-body text-sm text-negative mb-3">
              {erreur}
            </p>
            <Bouton
              variante="contour"
              icone="history"
              disabled={enCours}
              onClick={() => void lire(page?.page ?? 1, consultations)}
            >
              Réessayer
            </Bouton>
          </>
        )}

        {page && (
          <>
            <label className="flex items-center gap-2 mb-4 font-body text-sm text-ink cursor-pointer">
              <input
                type="checkbox"
                checked={consultations}
                disabled={enCours}
                onChange={(e) => void lire(1, e.target.checked)}
                className="w-4 h-4 accent-primary"
              />
              Afficher aussi les consultations du journal
            </label>

            <div className="divide-y divide-hairline">
              {page.lignes.length === 0 && (
                <p className="font-body text-sm text-muted-foreground py-2">
                  Aucune ligne sur cette page.
                </p>
              )}
              {page.lignes.map((l) => (
                <div key={l.id} data-testid={`journal-${l.id}`} className="py-3">
                  <p className="font-body text-sm text-ink">
                    <span className="font-semibold">{l.table_cible}</span>
                    {' · '}
                    {l.action}
                    {' · '}
                    <span className="text-muted-foreground">{horodatage(l.survenu_le)}</span>
                  </p>
                  {/* « non attribue » et non « inconnu » : le libelle que
                      20260830090000_journal_acteur.sql prescrit pour les
                      lignes anterieures a l'ajout de la colonne. */}
                  <p className="font-body text-xs text-muted-foreground">
                    par {l.acteur_nom ?? 'non attribué'}
                    {l.cible_nom && ` · sur ${l.cible_nom}`}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-4">
              <Bouton
                variante="contour"
                disabled={enCours || page.page <= 1}
                onClick={() => void lire(page.page - 1, consultations)}
              >
                Page précédente
              </Bouton>
              <Bouton
                variante="contour"
                disabled={enCours || !page.a_suivre}
                onClick={() => void lire(page.page + 1, consultations)}
              >
                Page suivante
              </Bouton>
              <span className="font-body text-sm text-muted-foreground">Page {page.page}</span>
            </div>
          </>
        )}
      </Carte>
    </section>
  );
}
