import { Bouton, Champ, Onde, Rosace } from '@kolek/ui';
import { useEffect, useState } from 'react';

import { poserMotDePasse, sessionOuverte } from '../motDePasse';

/**
 * Choisir son mot de passe.
 *
 * ## Un écran pour deux parcours
 *
 * L'invité qui ouvre son compte et le collecteur qui a oublié le sien
 * atterrissent tous deux ici, et demandent exactement la même chose. Deux
 * écrans divergeraient à la première correction.
 *
 * ## Ce que fait le lien avant que cet écran s'affiche
 *
 * Le clic passe par `/auth/v1/verify`, qui vérifie le jeton et redirige ici en
 * accrochant la session à l'adresse. `supabase-js` la lit à l'initialisation —
 * d'où l'attente au montage plutôt qu'un rendu immédiat. Sans elle,
 * `updateUser` échouerait, et le collecteur lirait un message anglais sur un
 * compte qu'il croirait perdu.
 *
 * ## La confirmation n'est pas du zèle
 *
 * Le champ est masqué. Une faute de frappe ne se voit pas, et sans seconde
 * saisie le collecteur se retrouve dehors avec un mot de passe qu'il croit
 * connaître — sur un téléphone, au marché, sans personne pour l'aider.
 */
export function NouveauMotDePasse() {
  const [session, setSession] = useState<boolean | null>(null);
  const [motDePasse, setMotDePasse] = useState('');
  const [repetition, setRepetition] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [pose, setPose] = useState(false);

  useEffect(() => {
    let vivant = true;
    void sessionOuverte().then((ouverte) => {
      if (vivant) setSession(ouverte);
    });
    return () => {
      vivant = false;
    };
  }, []);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    if (motDePasse !== repetition) {
      // Refusé ici, sans aller-retour : le serveur ne peut pas voir cette
      // erreur-là, il ne reçoit qu'une seule valeur.
      setErreur('Les deux saisies ne sont pas identiques.');
      return;
    }

    setEnvoi(true);
    setErreur(null);
    const issue = await poserMotDePasse(motDePasse);
    setEnvoi(false);

    if (issue.ok) {
      setPose(true);
      return;
    }
    setErreur(issue.message);
  }

  return (
    <main className="relative min-h-dvh overflow-hidden bg-[image:var(--degrade-hero)] grid place-items-center p-5">
      <Rosace
        petales={20}
        excentricite={0.4}
        animee
        className="pointer-events-none absolute -right-[20%] top-1/2 w-[80vmin] -translate-y-1/2 text-or/15"
      />
      <Onde
        lignes={8}
        className="pointer-events-none absolute bottom-0 left-0 h-32 w-full text-or/10"
      />

      <form
        onSubmit={soumettre}
        className="relative z-10 w-full max-w-formulaire rounded-[1.5rem] border border-white/10 bg-white/[0.04] p-6 shadow-lg backdrop-blur-xl"
      >
        <h1 className="mb-2 font-headings text-xl font-bold leading-tight text-white">
          Choisis ton mot de passe
        </h1>

        {session === false && (
          <>
            <p className="mb-4 font-body text-sm text-white/60">
              Ce lien n’est plus valable — il ne sert qu’une fois, et vaut une heure.
            </p>
            <a
              href="/mot-de-passe-oublie"
              className="block text-center font-body text-sm text-or underline underline-offset-2"
            >
              Demander un nouveau lien
            </a>
          </>
        )}

        {session === true && pose && (
          <>
            <p className="mb-4 rounded-md bg-or/10 p-3 font-body text-sm text-white/70">
              C’est fait. Tu peux entrer dans Kolek.
            </p>
            {/* Une navigation franche plutôt qu'un `<a>` autour du bouton : un
                `<button>` dans un `<a>` est un imbriquement invalide, et les
                lecteurs d'écran y annoncent deux contrôles pour un. */}
            <Bouton
              pleineLargeur
              onClick={() => {
                window.location.href = '/';
              }}
            >
              Ouvrir Kolek
            </Bouton>
          </>
        )}

        {session === true && !pose && (
          <>
            <p className="mb-6 font-body text-sm text-white/50">
              Au moins 10 caractères. Évite un mot de passe déjà utilisé ailleurs.
            </p>

            <Champ
              libelle="Nouveau mot de passe"
              type="password"
              valeur={motDePasse}
              onChange={setMotDePasse}
              requis
              autoComplete="new-password"
              className="mb-3"
              sombre
            />
            <Champ
              libelle="Répète-le"
              type="password"
              valeur={repetition}
              onChange={setRepetition}
              requis
              autoComplete="new-password"
              className="mb-5"
              sombre
            />

            {erreur && (
              <p
                role="alert"
                className="mb-4 rounded-md bg-negative/15 p-3 font-body text-sm text-negative-tint"
              >
                {erreur}
              </p>
            )}

            <Bouton type="submit" pleineLargeur disabled={envoi}>
              {envoi ? 'Enregistrement…' : 'Enregistrer'}
            </Bouton>
          </>
        )}
      </form>
    </main>
  );
}
