import { PALIERS, formatMontant, type Palier } from '@kolek/core';
import { Onde, Rosace } from '@kolek/ui';
import { useState } from 'react';

import { entree, useAnimations } from './animation';
import { envoyerDemande, palierDepuisAdresse } from './demande';
import { APP_COLLECTEUR, CONTACT_DEMO } from './liens';

/**
 * Le formulaire d'ouverture de compte.
 *
 * ## Ce qu'il est, et ce qu'il n'est pas
 *
 * Ce n'est **pas** une inscription en libre-service, et le texte de l'écran le
 * dit au visiteur plutôt que de le lui faire découvrir. Kolek se vend à des
 * collecteurs qui paient un abonnement ; le compte est ouvert par GTCS après un
 * appel. Un formulaire qui promettrait un accès immédiat mentirait, et le
 * mensonge se découvrirait à la seconde d'après — quand rien ne s'ouvrirait.
 *
 * Ce qu'il fait, c'est **enregistrer les informations**. Avant lui, un visiteur
 * intéressé tombait sur un `mailto:` — qui ne produit rien de visible sur une
 * machine sans client de messagerie configuré. Il repartait sans laisser de
 * trace, et GTCS ne savait même pas qu'il était venu.
 *
 * ## Le choix du palier
 *
 * Il arrive par l'adresse (`/inscription?palier=pro`) quand on vient de la
 * grille tarifaire, et reste modifiable ici. Le serveur revalide : un palier
 * inconnu est refusé, jamais ramené en silence à une valeur par défaut.
 */

const CHAMP_SOMBRE =
  'w-full min-h-11 rounded-md border-[1.5px] border-white/15 bg-white/5 px-3.5 font-body text-base text-white outline-none placeholder:text-white/25 focus:border-or';

function Etiquette({ pour, children }: { pour: string; children: React.ReactNode }) {
  return (
    <label htmlFor={pour} className="mb-1.5 block font-body text-sm font-semibold text-white/70">
      {children}
    </label>
  );
}

export function Inscription() {
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [zone, setZone] = useState('');
  const [message, setMessage] = useState('');
  const [palier, setPalier] = useState<Palier>(() =>
    palierDepuisAdresse(window.location.search),
  );

  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [envoyee, setEnvoyee] = useState(false);

  const ref = useAnimations<HTMLElement>(() => {
    entree('[data-entree]', { delay: 0.1 });
  });

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    setEnvoi(true);
    setErreur(null);

    const resultat = await envoyerDemande({ nom, telephone, email, zone, palier, message });

    setEnvoi(false);
    if (resultat.ok) {
      setEnvoyee(true);
      window.scrollTo(0, 0);
      return;
    }
    setErreur(resultat.message);
  }

  const choisi = PALIERS.find((p) => p.cle === palier);

  return (
    <main
      ref={ref}
      className="relative min-h-dvh overflow-hidden bg-[image:var(--degrade-hero)] px-5 py-16 sm:px-8"
    >
      <Rosace
        petales={20}
        excentricite={0.4}
        animee
        className="pointer-events-none absolute -right-[25%] top-1/3 w-[80vmin] text-or/12"
      />
      <Onde
        lignes={8}
        className="pointer-events-none absolute bottom-0 left-0 h-28 w-full text-or/10"
      />

      <div className="relative z-10 mx-auto max-w-xl">
        <a
          href="/"
          className="mb-8 inline-flex items-center gap-2 font-body text-sm text-white/50 transition-colors hover:text-white"
        >
          ← Retour à l’accueil
        </a>

        {envoyee ? (
          <div className="rounded-[2rem] border border-or/30 bg-white/[0.04] p-8 backdrop-blur-xl">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-pill bg-or">
              <span className="text-2xl text-dark-canvas">✓</span>
            </div>
            <h1 className="mb-3 font-headings text-3xl font-bold text-white">Demande enregistrée</h1>
            <p className="mb-6 font-body text-base leading-relaxed text-white/60">
              GTCS te rappelle sur le <strong className="text-white">{telephone}</strong> pour
              ouvrir ton compte et te montrer l’application. Ton accès partira ensuite sur{' '}
              <strong className="text-white">{email}</strong> — garde ton téléphone à portée et
              surveille tes courriels.
            </p>
            <p className="font-body text-sm text-white/40">
              Tu as déjà un compte ?{' '}
              <a href={APP_COLLECTEUR} className="font-semibold text-or underline underline-offset-2">
                Connecte-toi
              </a>
              .
            </p>
          </div>
        ) : (
          <>
            <p data-entree className="mb-3 font-mono text-xs tracking-widest text-or">
              OUVRIR UN COMPTE
            </p>
            <h1
              data-entree
              className="mb-3 font-headings text-4xl font-bold leading-tight text-white sm:text-5xl"
            >
              Laisse-nous tes informations
            </h1>
            {/* Dire le fonctionnement ici, pas après l'envoi. Un formulaire qui
                laisse croire à un accès immédiat se dément à la seconde
                suivante, quand rien ne s'ouvre. */}
            <p data-entree className="mb-8 font-body text-base leading-relaxed text-white/60">
              Les comptes Kolek sont ouverts par l’équipe GTCS, après un appel. Remplis ce
              formulaire : on te rappelle, on ouvre ton compte, et tu encaisses dès le lendemain.
              Le premier mois est un essai.
            </p>

            <form
              data-entree
              onSubmit={soumettre}
              className="rounded-[2rem] border border-white/10 bg-white/[0.04] p-6 backdrop-blur-xl sm:p-8"
            >
              <div className="mb-4">
                <Etiquette pour="nom">Ton nom complet</Etiquette>
                <input
                  id="nom"
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                  maxLength={120}
                  autoComplete="name"
                  placeholder="Mariam Koné"
                  className={CHAMP_SOMBRE}
                />
              </div>

              <div className="mb-4">
                <Etiquette pour="telephone">Ton numéro</Etiquette>
                {/* `tel` : sur un téléphone, il ouvre le pavé numérique sans les
                    flèches d'incrément, que personne ne veut sur un numéro. */}
                <input
                  id="telephone"
                  type="tel"
                  value={telephone}
                  onChange={(e) => setTelephone(e.target.value)}
                  required
                  maxLength={64}
                  autoComplete="tel"
                  placeholder="+225 07 01 02 03 04"
                  className={CHAMP_SOMBRE}
                />
                <p className="mt-1.5 font-body text-xs text-white/30">
                  C’est le numéro sur lequel GTCS te rappelle.
                </p>
              </div>

              <div className="mb-4">
                <Etiquette pour="email">Ton adresse e-mail</Etiquette>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  maxLength={160}
                  autoComplete="email"
                  placeholder="mariam@exemple.ci"
                  className={CHAMP_SOMBRE}
                />
                {/* Dire à quoi elle sert au moment où on la demande. Un
                    formulaire qui réclame une adresse sans expliquer pourquoi
                    fait hésiter, et l'hésitation coûte des demandes. */}
                <p className="mt-1.5 font-body text-xs text-white/30">
                  C’est là que tu recevras ton accès quand GTCS aura ouvert ton compte.
                </p>
              </div>

              <div className="mb-5">
                <Etiquette pour="zone">Ta zone de collecte</Etiquette>
                <input
                  id="zone"
                  value={zone}
                  onChange={(e) => setZone(e.target.value)}
                  maxLength={80}
                  placeholder="Adjamé, Marché Gouro…"
                  className={CHAMP_SOMBRE}
                />
              </div>

              <fieldset className="mb-5">
                <legend className="mb-2 font-body text-sm font-semibold text-white/70">
                  L’offre qui t’intéresse
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {PALIERS.map((p) => (
                    <button
                      key={p.cle}
                      type="button"
                      aria-pressed={p.cle === palier}
                      onClick={() => setPalier(p.cle)}
                      className={`cursor-pointer rounded-md border px-3 py-2.5 text-left font-body transition-colors ${
                        p.cle === palier
                          ? 'border-or bg-or/15 text-white'
                          : 'border-white/10 text-white/50 hover:border-white/25'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{p.nom}</span>
                      <span className="block font-mono text-xs tabular-nums text-white/40">
                        {p.prix === 0 ? 'Gratuit' : `${formatMontant(p.prix)} F/${p.periode}`}
                      </span>
                    </button>
                  ))}
                </div>
                {choisi && (
                  <p className="mt-2 font-body text-xs text-white/40">
                    {choisi.limite} — {choisi.accroche}
                  </p>
                )}
              </fieldset>

              <div className="mb-5">
                <Etiquette pour="message">Un mot sur ton activité (facultatif)</Etiquette>
                <textarea
                  id="message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={500}
                  rows={3}
                  placeholder="Je collecte au marché depuis six ans, une soixantaine de clients."
                  className={`${CHAMP_SOMBRE} min-h-24 resize-y py-2.5`}
                />
              </div>

              {erreur && (
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-negative/15 p-3 font-body text-sm text-negative-tint"
                >
                  {erreur}
                </p>
              )}

              <button
                type="submit"
                disabled={envoi}
                className="magnetique w-full overflow-hidden rounded-pill bg-or py-3.5 font-body text-base font-semibold text-dark-canvas disabled:opacity-60"
              >
                <span className="relative z-10">
                  {envoi ? 'Envoi…' : 'Envoyer ma demande'}
                </span>
                <span aria-hidden className="voile-or" />
              </button>

              {/* La seule donnée qui part est celle de ce formulaire. Le dire
                  sur une page qui demande un numéro et une adresse n'est pas du
                  décor : c'est ce que le visiteur a le droit de savoir.

                  La phrase a été corrigée le 2026-08-27, quand le champ e-mail
                  est apparu. Elle disait « Nom, numéro et zone uniquement » —
                  une promesse devenue fausse est pire qu'une promesse absente,
                  surtout sur une page qui collecte des données personnelles. */}
              <p className="mt-4 text-center font-body text-xs text-white/30">
                Nom, numéro, adresse e-mail et zone. Aucun mot de passe, aucun paiement à cette
                étape.
              </p>

              {/* Le repli, toujours visible. Un formulaire est un point unique
                  de défaillance : réseau coupé, service indisponible, variable
                  de build absente. Offrir la voie du courriel à côté — plutôt
                  qu'à la place — coûte une ligne et garantit qu'aucun visiteur
                  ne se retrouve devant une impasse. */}
              <p className="mt-3 text-center font-body text-xs text-white/30">
                Tu préfères écrire ?{' '}
                <a href={CONTACT_DEMO} className="text-or/70 underline underline-offset-2">
                  Envoyer un courriel à GTCS
                </a>
              </p>
            </form>

            <p data-entree className="mt-6 text-center font-body text-sm text-white/40">
              Tu as déjà un compte ?{' '}
              <a
                href={APP_COLLECTEUR}
                className="font-semibold text-or underline underline-offset-2"
              >
                Connecte-toi
              </a>
              .
            </p>
          </>
        )}
      </div>
    </main>
  );
}
