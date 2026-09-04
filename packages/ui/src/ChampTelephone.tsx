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

/**
 * Les pays dont le plan de numérotation porte un **préfixe national** — ce zéro
 * qu'on compose à l'intérieur du pays et qui tombe à l'international.
 *
 * ## Pourquoi une liste, et non une règle
 *
 * « Le zéro de tête ne fait pas partie du numéro » était écrit ici comme une
 * règle universelle. Elle ne l'est pas, et elle était fausse pour le pays
 * principal du produit.
 *
 * Depuis le 31 janvier 2021, un numéro ivoirien fait dix chiffres et **garde
 * son zéro** : `07 11 28 29 92` s'écrit `+225 0711282992`. Le retirer produit
 * neuf chiffres, c'est-à-dire un numéro qui n'existe pas. Mesuré le 2026-09-04 :
 * Chariow rendait `400 Invalid phone number` sur tout numéro ivoirien, et le
 * paiement était impossible depuis le premier jour.
 *
 * Le Bénin est dans le même cas depuis son passage à dix chiffres.
 *
 * ## Ce que cette liste vaut, et ce qu'elle ne vaut pas
 *
 * `CI` en est absent sur la foi d'une vérification datée. Les autres pays
 * ouest-africains de la liste — Sénégal, Togo, Burkina, Mali, Niger, Guinée,
 * Cameroun — ont des numéros nationaux sans zéro de tête : les inscrire ou non
 * ne change rien à un numéro correctement saisi, et ne pas les inscrire est le
 * choix qui abîme le moins une saisie inhabituelle.
 *
 * Les pays inscrits ci-dessous le sont sur la base de leur plan de numérotation
 * connu. Aucun n'a été vérifié à la source le 2026-09-04 — seul `CI` l'a été,
 * et c'est pour l'en **retirer**. Le jour où un numéro d'un de ces pays sera
 * refusé, c'est ici qu'il faudra regarder, et la vérification manquante est
 * nommée plutôt que supposée faite.
 */
const PREFIXE_NATIONAL: ReadonlySet<string> = new Set([
  'FR',
  'MA',
  'DZ',
  'NG',
  'GH',
  'MG',
  'CD',
]);

/** Retire le zéro de tête **seulement** là où le plan de numérotation en a un. */
function sansZeroDeTete(national: string, pays: string): string {
  return PREFIXE_NATIONAL.has(pays) ? national.replace(/^0+/, '') : national;
}

/**
 * Le numéro national, ou la chaîne vide s'il n'y en a pas.
 *
 * `sansZeroDeTete` tenait lieu de garde tant qu'elle rabotait tous les zéros :
 * « 000 » devenait « », et le champ restait vide. En cessant de raboter pour la
 * Côte d'Ivoire, cette garde a disparu par effet de bord et « 000 » composait
 * « +225000 ». Un test l'a dit ; elle est maintenant écrite pour elle-même,
 * indépendante du pays.
 */
function nationalDe(local: string, pays: string): string {
  const bruts = chiffres(local);
  if (!bruts || /^0+$/.test(bruts)) return '';
  return sansZeroDeTete(bruts, pays);
}

/** Compose l'E.164. Rend une chaîne vide si le pays n'est pas dans la liste. */
export function composerE164(pays: string, local: string): string {
  const trouve = PAYS_TELEPHONE.find((p) => p.code === pays);
  if (!trouve) return '';
  const national = nationalDe(local, pays);
  if (!national) return '';
  return `+${trouve.indicatif}${national}`;
}

/**
 * L'inverse de `composerE164` : d'un numéro international vers le couple
 * (pays, numéro national) que ce champ manipule.
 *
 * Sert à **pré-remplir** le champ depuis une fiche déjà enregistrée. Sans elle,
 * l'appelant serait tenté de poser l'E.164 tel quel dans `local` — et
 * `composerE164` recomposerait alors « +225 » devant un numéro qui porte déjà
 * son indicatif, soit un numéro faux que le champ déclarerait valide.
 *
 * Deux refus délibérés, qui rendent `null` plutôt que de deviner :
 *
 * * **Ce qui ne commence pas par `+`.** Un « 0701020304 » national et un
 *   « 2250102030 » sans indicatif ne se distinguent pas de façon sûre, et un
 *   champ pré-rempli faux est pire qu'un champ vide : personne ne relit ce qui
 *   est déjà écrit.
 * * **Un pays absent de la liste.** Le champ ne saurait pas l'afficher.
 *
 * L'indicatif le plus long l'emporte, pour que l'ajout d'un pays dont
 * l'indicatif en prolonge un autre ne change pas silencieusement le sens des
 * numéros déjà enregistrés.
 */
export function separerE164(e164: string): { pays: string; local: string } | null {
  if (!e164.trim().startsWith('+')) return null;

  const brut = chiffres(e164);
  const parIndicatifDecroissant = [...PAYS_TELEPHONE].sort(
    (a, b) => b.indicatif.length - a.indicatif.length,
  );

  for (const pays of parIndicatifDecroissant) {
    if (!brut.startsWith(pays.indicatif)) continue;
    const local = brut.slice(pays.indicatif.length);
    return local ? { pays: pays.code, local } : null;
  }

  return null;
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

/**
 * Les trois formes d'un numéro, à partir d'un pays et d'un numéro national.
 *
 * Sortie du composant pour que la vitrine s'en serve sans lui : son formulaire
 * est sombre et vitré, et y poser un champ dessiné pour l'application donnerait
 * un bloc clair au milieu. Ce qui doit être partagé n'est pas l'apparence,
 * c'est **la règle** — l'E.164 composé, et le seuil qui décide qu'un numéro est
 * complet. Recopiée, cette règle aurait deux valeurs le jour où l'une des deux
 * bougerait, et le formulaire le moins strict laisserait passer ce que l'autre
 * refuse.
 */
export function lireTelephone(pays: string, local: string): ValeurTelephone {
  const national = nationalDe(local, pays);
  return {
    pays,
    local,
    e164: composerE164(pays, local),
    valide: national.length >= LONGUEUR_MIN && national.length <= LONGUEUR_MAX,
  };
}

export function ChampTelephone({ libelle, valeur, onChange, className = '' }: Props) {
  // `useId` plutôt qu'un identifiant passé en propriété : deux formulaires sur
  // un même écran ne peuvent pas se voler leur étiquette par accident.
  const idPays = useId();

  function remonter(pays: string, local: string) {
    onChange(lireTelephone(pays, local));
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
