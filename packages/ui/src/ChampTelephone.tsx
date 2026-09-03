import { useId } from 'react';

import { Champ } from './Champ';

/**
 * Saisie d'un numéro : un pays, un numéro national.
 *
 * Ce découpage n'est pas une préférence d'interface, c'est ce que le
 * fournisseur de paiement exige — `Docs/Chariow.md` §3bis. Un E.164 brut lui
 * revient en « 400 Invalid phone number », et un numéro sans pays n'est
 * rattrapable côté serveur que si son indicatif est africain.
 *
 * Le composant remonte les **trois** formes à chaque frappe. Le serveur les
 * reçoit toutes les trois et tranche lui-même : le front ne pré-nettoie rien.
 *
 * La partie numéro délègue à `Champ` plutôt que de recopier ses classes. Le
 * plan prévoyait une copie ; elle serait née fausse le jour même, avec le
 * `outline-none` que `Champ` a cessé de poser le 2026-08-23 — l'anneau de
 * focus vit dans `packages/core/src/base.css` et aucun composant n'a le droit
 * de l'éteindre. Une liste de classes recopiée est une règle qu'on redécouvre
 * une fois sur deux.
 */

export interface PaysTelephone {
  /** ISO2, ce que le fournisseur attend. */
  code: string;
  nom: string;
  /** Indicatif, sans le `+`. */
  indicatif: string;
}

/** Les pays du marché. La Côte d'Ivoire d'abord : c'est celui du pilote. */
export const PAYS_TELEPHONE: readonly PaysTelephone[] = [
  { code: 'CI', nom: 'Côte d’Ivoire', indicatif: '225' },
  { code: 'SN', nom: 'Sénégal', indicatif: '221' },
  { code: 'BJ', nom: 'Bénin', indicatif: '229' },
  { code: 'TG', nom: 'Togo', indicatif: '228' },
  { code: 'BF', nom: 'Burkina Faso', indicatif: '226' },
  { code: 'ML', nom: 'Mali', indicatif: '223' },
  { code: 'NE', nom: 'Niger', indicatif: '227' },
  { code: 'GN', nom: 'Guinée', indicatif: '224' },
  { code: 'CM', nom: 'Cameroun', indicatif: '237' },
  { code: 'FR', nom: 'France', indicatif: '33' },
];

const LONGUEUR_MIN = 6;
const LONGUEUR_MAX = 15;

function chiffres(brut: string): string {
  return brut.replace(/\D/g, '');
}

function sansZeroDeTete(national: string): string {
  return national.replace(/^0+/, '');
}

/** Compose l'E.164. Rend une chaîne vide si le pays n'est pas dans la liste. */
export function composerE164(pays: string, local: string): string {
  const trouve = PAYS_TELEPHONE.find((p) => p.code === pays);
  if (!trouve) return '';
  const national = sansZeroDeTete(chiffres(local));
  if (!national) return '';
  return `+${trouve.indicatif}${national}`;
}

export interface ValeurTelephone {
  pays: string;
  local: string;
  e164: string;
  valide: boolean;
}

interface Props {
  libelle: string;
  valeur: { pays: string; local: string };
  onChange: (valeur: ValeurTelephone) => void;
  className?: string;
}

export function ChampTelephone({ libelle, valeur, onChange, className = '' }: Props) {
  // `useId` plutôt qu'un identifiant passé en propriété : deux formulaires sur
  // un même écran ne peuvent pas se voler leur étiquette par accident.
  const idPays = useId();

  function remonter(pays: string, local: string) {
    const national = sansZeroDeTete(chiffres(local));
    onChange({
      pays,
      local,
      e164: composerE164(pays, local),
      valide: national.length >= LONGUEUR_MIN && national.length <= LONGUEUR_MAX,
    });
  }

  return (
    <div className={className}>
      <div className="flex gap-2">
        <div className="w-32 shrink-0">
          <label htmlFor={idPays} className="block text-sm font-body font-semibold text-ink mb-1.5">
            Pays
          </label>
          <select
            id={idPays}
            value={valeur.pays}
            onChange={(e) => remonter(e.target.value, valeur.local)}
            className="w-full min-h-11 px-2 bg-input border-[1.5px] border-hairline rounded-md text-base font-body text-ink focus:border-primary"
          >
            {PAYS_TELEPHONE.map((p) => (
              <option key={p.code} value={p.code}>
                {p.code} +{p.indicatif}
              </option>
            ))}
          </select>
        </div>

        <div className="flex-1 min-w-0">
          <Champ
            libelle={libelle}
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            valeur={valeur.local}
            onChange={(local) => remonter(valeur.pays, local)}
          />
        </div>
      </div>
      <p className="mt-1.5 text-xs font-body text-muted-foreground">
        Le numéro qui recevra la demande de paiement Mobile Money.
      </p>
    </div>
  );
}
