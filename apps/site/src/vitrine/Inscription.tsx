import { PALIERS, formatMontant, type Palier } from '@kolek/core';
import { Onde, PAYS_TELEPHONE, Rosace, lireTelephone } from '@kolek/ui';
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
 *
 * ## Ce que l'amendement « payer vaut accord » change ici
 *
 * Depuis le 2026-09-03, un palier **payant** ne mène plus à un rappel : il mène
 * au paiement, et le règlement confirmé ouvre le compte tout seul. Le visiteur
 * choisit donc son mot de passe **avant** de payer — refuser un mot de passe
 * après l'encaissement serait le pire moment possible — et le formulaire part
 * vers la page du fournisseur au lieu d'afficher « on te rappelle ».
 *
 * **L'essai n'a pas changé.** Il vaut zéro franc, il n'y a rien à encaisser, et
 * il attend l'accord d'un humain comme avant. C'est aussi ce qui garde une porte
 * d'entrée pour qui n'a pas de moyen de paiement en ligne — d'où deux textes
 * d'écran, et non un seul qui mentirait à la moitié des visiteurs.
 *
 * ## Le téléphone en deux morceaux
 *
 * Le fournisseur de paiement veut un pays et un numéro national **séparés** :
 * un E.164 brut lui revient en « 400 Invalid phone number ». Le champ n'emprunte
 * pas `ChampTelephone` — dessiné pour l'application, clair, il jurerait au
 * milieu de ce formulaire vitré — mais il emprunte sa **règle**,
 * `lireTelephone`, pour que le seuil qui décide qu'un numéro est complet reste
 * unique.
 */

/**
 * Le gabarit des champs du formulaire.
 *
 * Pas de `outline-none` ici, et c'est une règle, pas un oubli : l'anneau de
 * focus vit dans `packages/core/src/base.css` sur `:focus-visible`, et aucun
 * composant n'a le droit de l'éteindre — c'est la règle du 2026-08-23, que
 * `Champ.test.tsx` et `ChampTelephone.test.tsx` font déjà respecter côté
 * application. Elle valait pour la vitrine aussi ; personne ne la surveillait
 * ici, et les cinq champs l'éteignaient depuis leur écriture.
 *
 * `styles.css` retourne les deux couleurs de l'anneau pour le fond sombre.
 */
const CHAMP_SOMBRE =
  'w-full min-h-11 rounded-md border-[1.5px] border-white/40 bg-white/5 px-3.5 font-body text-base text-white placeholder:text-white/55 focus:border-or';

function Etiquette({ pour, children }: { pour: string; children: React.ReactNode }) {
  return (
    <label htmlFor={pour} className="mb-1.5 block font-body text-sm font-semibold text-white/70">
      {children}
    </label>
  );
}

export function Inscription() {
  const [nom, setNom] = useState('');
  // Le pays du pilote par défaut. Le visiteur d'un autre pays le change ; celui
  // de Côte d'Ivoire, qui est la quasi-totalité, n'a rien à faire.
  const [paysTelephone, setPaysTelephone] = useState('CI');
  const [telephoneLocal, setTelephoneLocal] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
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

  const choisi = PALIERS.find((p) => p.cle === palier);
  const payant = (choisi?.prix ?? 0) > 0;
  const telephone = lireTelephone(paysTelephone, telephoneLocal);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    setEnvoi(true);
    setErreur(null);

    const resultat = await envoyerDemande({
      nom,
      telephone: telephone.e164,
      paysTelephone,
      telephoneLocal,
      email,
      zone,
      palier,
      message,
      // Vide pour un essai : le serveur n'en veut pas, et `validerDemande` ne
      // retient rien d'un mot de passe qui n'ouvrira aucun compte.
      motDePasse: payant ? motDePasse : '',
    });

    if (resultat.ok) {
      // Navigation de premier niveau, et non `fetch` : la page de paiement est
      // hébergée par le fournisseur, et la CSP ne l'autoriserait pas en
      // `connect-src`. `envoi` reste vrai — le bouton doit rester désarmé
      // pendant que le navigateur s'en va.
      if (resultat.checkoutUrl) {
        window.location.assign(resultat.checkoutUrl);
        return;
      }
      setEnvoi(false);
      setEnvoyee(true);
      window.scrollTo(0, 0);
      return;
    }
    setEnvoi(false);
    setErreur(resultat.message);
  }

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
              GTCS te rappelle sur le <strong className="text-white">{telephone.e164}</strong> pour
              ouvrir ton compte et te montrer l’application. Ton accès partira ensuite sur{' '}
              <strong className="text-white">{email}</strong>. Garde ton téléphone à portée
              et surveille tes courriels.
            </p>
            <p className="font-body text-sm text-white/55">
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
              {payant
                ? 'Choisis ta formule, règle par Mobile Money, et ton compte s’ouvre dès le paiement confirmé — sans attendre de rappel.'
                : 'L’essai est gratuit et se demande ici : GTCS te rappelle, ouvre ton compte, et tu encaisses dès le lendemain.'}
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
                {/* Deux contrôles et non un : le fournisseur de paiement veut le
                    pays et le numéro national séparés — un E.164 brut lui revient
                    en « 400 Invalid phone number ». Le serveur reçoit les deux
                    formes et tranche lui-même. */}
                {/* La piste de chaque contrôle est portée par son conteneur, et
                    non par une classe de largeur ajoutée à `CHAMP_SOMBRE`.
                    Corrigé le 2026-09-04 : le `select` recevait
                    `${CHAMP_SOMBRE} w-32`, donc `w-full` et `w-32` sur le même
                    élément. L'ordre dans la chaîne ne tranche pas — c'est
                    l'ordre de la feuille Tailwind, et `w-full` l'emportait. Le
                    pays prenait toute la ligne, le numéro se repliait sur son
                    minimum : un carré de 44 px où l'on ne pouvait rien lire de
                    ce qu'on tapait. `ChampTelephone`, dans `packages/ui`, porte
                    ce découpage depuis le début. */}
                <div className="flex gap-2">
                  <div className="w-32 shrink-0">
                    <select
                      aria-label="Pays"
                      value={paysTelephone}
                      onChange={(e) => setPaysTelephone(e.target.value)}
                      className={CHAMP_SOMBRE}
                    >
                      {PAYS_TELEPHONE.map((p) => (
                        <option key={p.code} value={p.code} className="text-dark-canvas">
                          {p.code} +{p.indicatif}
                        </option>
                      ))}
                    </select>
                  </div>
                  {/* `min-w-0` : sans lui, la largeur minimale par défaut d'un
                      élément flex est son contenu, et le champ refuserait de
                      descendre sous la largeur du gabarit. */}
                  <div className="min-w-0 flex-1">
                    {/* `tel` : sur un téléphone, il ouvre le pavé numérique sans
                        les flèches d'incrément, que personne ne veut sur un
                        numéro. */}
                    <input
                      id="telephone"
                      type="tel"
                      value={telephoneLocal}
                      onChange={(e) => setTelephoneLocal(e.target.value)}
                      required
                      maxLength={24}
                      autoComplete="tel-national"
                      placeholder="07 01 02 03 04"
                      className={CHAMP_SOMBRE}
                    />
                  </div>
                </div>
                <p className="mt-1.5 font-body text-xs text-white/55">
                  {payant
                    ? 'C’est le numéro qui règle l’abonnement.'
                    : 'C’est le numéro sur lequel GTCS te rappelle.'}
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
                <p className="mt-1.5 font-body text-xs text-white/55">
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
                          : 'border-white/40 text-white/70 hover:border-white/70'
                      }`}
                    >
                      <span className="block text-sm font-semibold">{p.nom}</span>
                      <span className="block font-mono text-xs tabular-nums text-white/55">
                        {p.prix === 0 ? 'Gratuit' : `${formatMontant(p.prix)} F/${p.periode}`}
                      </span>
                    </button>
                  ))}
                </div>
                {choisi && (
                  <p className="mt-2 font-body text-xs text-white/55">
                    {choisi.limite} · {choisi.accroche}
                  </p>
                )}
              </fieldset>

              {/* Sous le choix du palier, et non plus haut : c'est ce choix qui
                  le fait apparaître, et un champ qui surgit au-dessus de ce
                  qu'on vient de cliquer se remarque mal.

                  Il n'existe que pour un palier payant. Un essai attend l'accord
                  d'un humain : aucun compte ne naîtra de la demande seule, et
                  garder une empreinte dont personne ne se servira serait un
                  secret gardé pour rien. */}
              {payant && (
                <div className="mb-5">
                  <Etiquette pour="motDePasse">Ton mot de passe</Etiquette>
                  <input
                    id="motDePasse"
                    type="password"
                    value={motDePasse}
                    onChange={(e) => setMotDePasse(e.target.value)}
                    required
                    minLength={10}
                    maxLength={200}
                    autoComplete="new-password"
                    placeholder="Au moins 10 caractères"
                    className={CHAMP_SOMBRE}
                  />
                  <p className="mt-1.5 font-body text-xs text-white/55">
                    C’est celui avec lequel tu ouvriras l’application. Ton compte se crée dès le
                    paiement confirmé — personne ne te rappellera pour te donner un accès.
                  </p>
                </div>
              )}

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
                  {envoi
                    ? payant
                      ? 'Ouverture du paiement…'
                      : 'Envoi…'
                    : payant
                      ? 'Payer et ouvrir mon compte'
                      : 'Envoyer ma demande'}
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
              {/* Une promesse devenue fausse est pire qu'une promesse absente,
                  et celle-ci l'est devenue le 2026-09-03 pour un palier payant :
                  il y a désormais un mot de passe, et un paiement. La corriger
                  pour les deux cas plutôt que de la retirer — un formulaire qui
                  demande un numéro et une adresse doit dire ce qu'il en fait. */}
              <p className="mt-4 text-center font-body text-xs text-white/55">
                {payant
                  ? 'Ton mot de passe ne nous parvient jamais en clair : il est transformé avant d’être rangé, et le paiement se fait sur la page sécurisée de notre encaisseur.'
                  : 'Nom, numéro, adresse e-mail et zone. Aucun mot de passe, aucun paiement à cette étape.'}
              </p>

              {/* Le repli, toujours visible. Un formulaire est un point unique
                  de défaillance : réseau coupé, service indisponible, variable
                  de build absente. Offrir la voie du courriel à côté — plutôt
                  qu'à la place — coûte une ligne et garantit qu'aucun visiteur
                  ne se retrouve devant une impasse. */}
              <p className="mt-3 text-center font-body text-xs text-white/55">
                Tu préfères écrire ?{' '}
                <a href={CONTACT_DEMO} className="text-or/70 underline underline-offset-2">
                  Envoyer un courriel à GTCS
                </a>
              </p>
            </form>

            <p data-entree className="mt-6 text-center font-body text-sm text-white/55">
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
