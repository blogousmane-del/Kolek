import { Bouton, Carte, CarteStat } from '@kolek/ui';
import { useState } from 'react';

import type { VueGlobale } from '../../donnees';
import type { ActionSuperAdmin, CodePromo, EtatSuperAdmin } from '../../superadmin';
import { dateLisible } from './lisible';

const CHAMP =
  'w-full min-h-11 px-3 bg-surface border border-hairline rounded-md font-body text-champ text-ink outline-none focus:border-primary';
const ETIQUETTE = 'block font-body text-sm font-semibold text-ink mb-1';

const LIBELLE_STATUT: Record<CodePromo['statut'], string> = {
  en_cours: 'En cours',
  programme: 'Programmé',
  expire: 'Expiré',
  quota_epuise: 'Quota épuisé',
};

const TEINTE_STATUT: Record<CodePromo['statut'], string> = {
  en_cours: 'bg-positive-tint text-positive',
  programme: 'bg-secondary text-secondary-foreground',
  expire: 'bg-canvas text-muted-foreground',
  quota_epuise: 'bg-negative-tint text-negative',
};

export function CodesPromo({
  etat,
  vue,
  occupe,
  onCreer,
  onAppliquer,
}: {
  etat: EtatSuperAdmin;
  vue: VueGlobale;
  occupe: boolean;
  onCreer: (demande: Extract<ActionSuperAdmin, { action: 'creer_code' }>) => void;
  onAppliquer: (demande: Extract<ActionSuperAdmin, { action: 'appliquer_code' }>) => void;
}) {
  const [code, setCode] = useState('');
  const [remise, setRemise] = useState('');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [quota, setQuota] = useState('');

  const [collecteur, setCollecteur] = useState('');
  const [codeApplique, setCodeApplique] = useState('');

  const codesApplicables = etat.codes_promo.filter((c) => c.statut === 'en_cours');

  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Codes promo</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Un code réduit le prix du palier d'un collecteur jusqu'à sa date de fin. Seul le Super
        Admin l'applique : le collecteur ne saisit rien.
      </p>

      {/* `codesApplicables` existe deja au-dessus : on le reutilise plutot
          que de refiltrer la meme liste. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <CarteStat
          libelle="Codes en cours"
          valeur={String(codesApplicables.length)}
          precision={`sur ${etat.codes_promo.length} créés`}
          icone="coins"
        />
        <CarteStat
          libelle="Remises qui courent"
          valeur={String(etat.remises.length)}
          precision="collecteurs à tarif réduit"
          icone="circle-dollar-sign"
        />
      </div>

      <Carte className="divide-y divide-hairline mb-4">
        {etat.codes_promo.length === 0 && (
          <p className="p-4 font-body text-sm text-muted-foreground">Aucun code pour l'instant.</p>
        )}
        {etat.codes_promo.map((c) => (
          <div
            key={c.code}
            data-testid={`code-${c.code}`}
            className="p-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <p className="font-body font-semibold text-ink">
                {c.code}
                <span className="ml-2 font-normal text-muted-foreground">−{c.remise_pct} %</span>
              </p>
              <p className="font-body text-sm text-muted-foreground">
                du {dateLisible(c.valide_du)} au {dateLisible(c.valide_au)}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-body text-sm text-ink tabular-nums">
                {c.utilisations} / {c.quota ?? 'illimité'}
              </span>
              <span
                className={`px-2.5 py-1 rounded-pill text-xs font-body font-semibold whitespace-nowrap ${TEINTE_STATUT[c.statut]}`}
              >
                {LIBELLE_STATUT[c.statut]}
              </span>
            </div>
          </div>
        ))}
      </Carte>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Carte className="p-5">
          <h3 className="font-headings font-bold text-base text-ink mb-3">Créer un code</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="promo-code" className={ETIQUETTE}>
                Code
              </label>
              <input
                id="promo-code"
                className={CHAMP}
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-remise" className={ETIQUETTE}>
                Remise (%)
              </label>
              <input
                id="promo-remise"
                type="number"
                min={1}
                max={100}
                className={CHAMP}
                value={remise}
                onChange={(e) => setRemise(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-du" className={ETIQUETTE}>
                Valide du
              </label>
              <input
                id="promo-du"
                type="date"
                className={CHAMP}
                value={du}
                onChange={(e) => setDu(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-au" className={ETIQUETTE}>
                Au
              </label>
              <input
                id="promo-au"
                type="date"
                className={CHAMP}
                value={au}
                onChange={(e) => setAu(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="promo-quota" className={ETIQUETTE}>
                Quota (vide = illimité)
              </label>
              <input
                id="promo-quota"
                type="number"
                min={1}
                className={CHAMP}
                value={quota}
                onChange={(e) => setQuota(e.target.value)}
              />
            </div>
          </div>

          <div className="mt-4">
            <Bouton
              icone="plus"
              disabled={occupe || !code || !remise || !du || !au}
              onClick={() => {
                onCreer({
                  action: 'creer_code',
                  code: code.trim().toUpperCase(),
                  remise_pct: Number(remise),
                  valide_du: du,
                  valide_au: au,
                  quota: quota === '' ? null : Number(quota),
                });
                setCode('');
                setRemise('');
                setDu('');
                setAu('');
                setQuota('');
              }}
            >
              Créer le code
            </Bouton>
          </div>
        </Carte>

        <Carte className="p-5">
          <h3 className="font-headings font-bold text-base text-ink mb-3">
            Appliquer un code à un collecteur
          </h3>
          <div className="flex flex-col gap-3">
            <div>
              <label htmlFor="promo-collecteur" className={ETIQUETTE}>
                Collecteur
              </label>
              <select
                id="promo-collecteur"
                className={`${CHAMP} cursor-pointer`}
                value={collecteur}
                onChange={(e) => setCollecteur(e.target.value)}
              >
                <option value="">Choisir…</option>
                {vue.collecteurs.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="promo-applique" className={ETIQUETTE}>
                Code à appliquer
              </label>
              <select
                id="promo-applique"
                className={`${CHAMP} cursor-pointer`}
                value={codeApplique}
                onChange={(e) => setCodeApplique(e.target.value)}
              >
                <option value="">Choisir…</option>
                {codesApplicables.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.code} (−{c.remise_pct} %)
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Bouton
                disabled={occupe || !collecteur || !codeApplique}
                onClick={() => {
                  onAppliquer({
                    action: 'appliquer_code',
                    collecteur,
                    code: codeApplique,
                  });
                  setCollecteur('');
                  setCodeApplique('');
                }}
              >
                Appliquer
              </Bouton>
            </div>
          </div>
        </Carte>
      </div>
    </section>
  );
}

/* ================================ Remises ================================ */

export function Remises({ etat }: { etat: EtatSuperAdmin }) {
  return (
    <section>
      <h2 className="font-headings font-bold text-xl text-ink mb-1">Remises en cours</h2>
      <p className="font-body text-sm text-muted-foreground mb-3">
        Ce que la plateforme offre aujourd'hui. Une remise échue disparaît d'ici : elle n'est plus
        une dépense, elle appartient au journal.
      </p>

      <Carte className="divide-y divide-hairline">
        {etat.remises.length === 0 && (
          <p className="p-4 font-body text-sm text-muted-foreground">Aucune remise en cours.</p>
        )}
        {etat.remises.map((r) => (
          <div
            key={r.collecteur_id}
            data-testid={`remise-${r.collecteur_id}`}
            className="p-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between"
          >
            <p className="font-body font-semibold text-ink truncate">{r.nom}</p>
            <p className="font-body text-sm text-muted-foreground">
              <span className="font-semibold text-ink">{r.promo_code}</span>
              {' · '}
              <span className="text-ink">−{r.remise_pct} %</span>
              {' · '}
              jusqu'au {dateLisible(r.remise_fin)}
            </p>
          </div>
        ))}
      </Carte>
    </section>
  );
}
