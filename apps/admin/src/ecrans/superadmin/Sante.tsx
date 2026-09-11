import { evaluerSante, formatMontant, type NiveauSante, type Voyant } from '@kolek/core';
import {
  Carte,
  CarteStat,
  CourbeEvolution,
  Icone,
  type NomIcone,
  type PointCourbe,
} from '@kolek/ui';
import { useState } from 'react';

import type { ReleveQuotidien, SanteSysteme } from '../../superadmin';
import { jourLisible, tailleLisible } from './lisible';

/**
 * La santé du système : ce qui doit tourner tourne-t-il, et comment la base
 * évolue-t-elle.
 *
 * ## Ce que l'écran s'interdit
 *
 * Comparer à « mois dernier » sans le relevé d'il y a un mois. Juger la taille
 * de la base sans connaître le plafond du forfait. Afficher des zéros quand la
 * base n'a rien rendu. Et laisser la couleur porter seule un niveau : chaque
 * pastille dit sa raison en toutes lettres.
 */

type Serie = 'taille' | 'mises' | 'clients' | 'cartes_actives' | 'audit_log';

const SERIES: Array<{ cle: Serie; libelle: string }> = [
  { cle: 'taille', libelle: 'Base' },
  { cle: 'mises', libelle: 'Mises' },
  { cle: 'clients', libelle: 'Clients' },
  { cle: 'cartes_actives', libelle: 'Cartes actives' },
  { cle: 'audit_log', libelle: 'Journal' },
];

const ASPECT: Record<NiveauSante, { classes: string; icone: NomIcone; mot: string }> = {
  normal: { classes: 'bg-positive-tint text-positive', icone: 'check-circle', mot: 'Normal' },
  // Pas de jeton « avertissement » dans le Design System : l'or en fond, l'encre
  // en texte. L'or en texte sur fond clair ne tiendrait pas le contraste.
  attention: { classes: 'bg-or/20 text-ink', icone: 'info', mot: 'Attention' },
  alerte: { classes: 'bg-negative-tint text-negative', icone: 'alert-circle', mot: 'Alerte' },
};

function synthese(voyants: Voyant[]): string {
  const alertes = voyants.filter((v) => v.niveau === 'alerte').length;
  const attentions = voyants.filter((v) => v.niveau === 'attention').length;
  if (alertes === 0 && attentions === 0) return 'Tout fonctionne';

  const parts: string[] = [];
  if (alertes > 0) parts.push(`${alertes} ${alertes > 1 ? 'points en alerte' : 'point en alerte'}`);
  if (attentions > 0) {
    parts.push(
      `${attentions} ${attentions > 1 ? 'points demandent attention' : 'point demande attention'}`,
    );
  }
  return parts.join(' · ');
}

/** Une clé absente d'un relevé ancien n'est pas un zéro : le point est omis. */
function pointsDe(releves: ReleveQuotidien[], serie: Serie): PointCourbe[] {
  return releves.flatMap((r) => {
    const valeur = serie === 'taille' ? r.taille_base : r.volumes[serie];
    return typeof valeur === 'number' ? [{ jour: r.jour, valeur }] : [];
  });
}

/** Le plus récent des relevés d'au moins trente jours, ou rien. */
function referenceDuMois(releves: ReleveQuotidien[], maintenant: Date): ReleveQuotidien | null {
  const limite = new Date(maintenant.getTime() - 30 * 86_400_000).toISOString().slice(0, 10);
  const anciens = releves.filter((r) => r.jour <= limite);
  return anciens[anciens.length - 1] ?? null;
}

export function Sante({
  sante,
  maintenant,
}: {
  sante: SanteSysteme | null | undefined;
  /** L'instant du jugement. Fourni par les épreuves ; l'heure courante sinon. */
  maintenant?: Date;
}) {
  const [serie, setSerie] = useState<Serie>('taille');

  if (!sante) {
    return (
      <Carte className="p-5">
        <p className="font-body text-sm text-muted-foreground">
          Santé indisponible : la base n'a pas rendu ses mesures. Les volumes ci-dessous restent à
          jour.
        </p>
      </Carte>
    );
  }

  const instant = maintenant ?? new Date();
  const { niveau, voyants } = evaluerSante(sante, instant);
  const aspectGeneral = ASPECT[niveau];

  const premierReleve = sante.releves[0];
  const reference = referenceDuMois(sante.releves, instant);
  const ecart = reference ? sante.base.taille - reference.taille_base : 0;
  const precisionBase = reference
    ? `${ecart >= 0 ? '+' : '-'}${tailleLisible(Math.abs(ecart))} vs mois dernier`
    : premierReleve
      ? `premier relevé le ${jourLisible(premierReleve.jour)}`
      : 'aucun relevé encore';

  const libelleSerie = SERIES.find((s) => s.cle === serie)!.libelle;
  const heure = new Date(sante.mesure_le).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <section className="flex flex-col gap-4" aria-labelledby="sante-titre">
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`flex items-center gap-2 px-3 py-1.5 rounded-pill font-body text-sm font-semibold ${aspectGeneral.classes}`}
        >
          <Icone nom={aspectGeneral.icone} taille={16} />
          <span id="sante-titre">{synthese(voyants)}</span>
        </span>
        <span className="font-body text-sm text-muted-foreground">mesuré à {heure}</span>
      </div>

      <ul aria-label="Voyants" className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3">
        {voyants.map((v) => {
          const aspect = ASPECT[v.niveau];
          return (
            <li key={v.point} className={`rounded-lg px-4 py-3 ${aspect.classes}`}>
              <p className="flex items-center gap-2 font-body text-sm font-semibold">
                <Icone nom={aspect.icone} taille={15} />
                <span className="sr-only">{aspect.mot} : </span>
                {v.libelle}
              </p>
              <p className="font-body text-xs mt-1">{v.raison}</p>
            </li>
          );
        })}
      </ul>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <CarteStat
          libelle="Taille de la base"
          valeur={tailleLisible(sante.base.taille)}
          precision={precisionBase}
          icone="bar-chart-2"
        />
        <CarteStat
          libelle="Connexions"
          valeur={`${sante.base.connexions} / ${sante.base.max_connexions}`}
          precision="connexions clientes ouvertes"
          icone="users"
        />
        <CarteStat
          libelle="Cache"
          valeur={
            sante.base.cache_pct === null
              ? '—'
              : `${String(sante.base.cache_pct).replace('.', ',')}\u00a0%`
          }
          precision="lectures servies par la mémoire"
          icone="refresh-cw"
        />
        <CarteStat
          libelle="Journal du planificateur"
          valeur={tailleLisible(sante.journal_cron.taille)}
          precision={`${formatMontant(sante.journal_cron.lignes)} lignes · purgé au-delà de 30 jours`}
          icone="history"
        />
      </div>

      <Carte className="p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="font-headings font-bold text-lg text-ink">Évolution</h3>
          <div role="group" aria-label="Série affichée" className="flex flex-wrap gap-2">
            {SERIES.map((s) => (
              <button
                key={s.cle}
                type="button"
                aria-pressed={serie === s.cle}
                onClick={() => setSerie(s.cle)}
                className={`px-3 py-1.5 rounded-pill border font-body text-sm font-medium cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                  serie === s.cle
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-hairline text-ink'
                }`}
              >
                {s.libelle}
              </button>
            ))}
          </div>
        </div>

        <CourbeEvolution
          libelle={libelleSerie}
          points={pointsDe(sante.releves, serie)}
          formater={serie === 'taille' ? tailleLisible : formatMontant}
        />

        {premierReleve && (
          <p className="font-body text-xs text-muted-foreground mt-3">
            Relevés depuis le {jourLisible(premierReleve.jour)}, chaque soir à 23 h 55.
          </p>
        )}
      </Carte>
    </section>
  );
}
