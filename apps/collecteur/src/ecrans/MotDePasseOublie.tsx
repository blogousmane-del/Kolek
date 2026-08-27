import { Bouton, Champ, Onde, Rosace } from '@kolek/ui';
import { useState } from 'react';

import { demanderReinitialisation } from '../motDePasse';

/**
 * Redemander un accès.
 *
 * ## Le message de confirmation est le point délicat
 *
 * Il ne dit **jamais** si un compte porte cette adresse. C'est la moitié
 * visible de la règle tenue par l'Edge Function : une réponse qui distinguerait
 * « adresse inconnue » de « courriel envoyé » serait un annuaire des
 * collecteurs de GTCS, interrogeable à la seconde. Le serveur ne le dit pas,
 * cet écran non plus, et les deux tiennent ensemble ou pas du tout.
 *
 * L'écran reprend le vert coffre des deux portes du produit. Un collecteur qui
 * clique « Mot de passe oublié ? » et change de monde visuel doute d'être au
 * bon endroit — et sur un produit qui manipule l'épargne d'autrui, ce doute
 * coûte cher.
 */
export function MotDePasseOublie() {
  const [email, setEmail] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [parti, setParti] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (envoi) return;

    setEnvoi(true);
    setErreur(null);
    const issue = await demanderReinitialisation(email);
    setEnvoi(false);

    if (issue.ok) {
      setParti(true);
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
          Mot de passe oublié
        </h1>
        <p className="mb-6 font-body text-sm text-white/50">
          Saisis l’adresse de ton compte. On t’envoie un lien pour en choisir un nouveau.
        </p>

        {parti ? (
          <p className="mb-4 rounded-md bg-or/10 p-3 font-body text-sm text-white/70">
            Si un compte porte cette adresse, le lien vient de partir. Regarde tes courriels — il
            vaut une heure.
          </p>
        ) : (
          <>
            <Champ
              libelle="Email"
              type="email"
              valeur={email}
              onChange={setEmail}
              requis
              autoComplete="username"
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
              {envoi ? 'Envoi…' : 'Envoyer le lien'}
            </Bouton>
          </>
        )}

        <a
          href="/"
          className="mt-5 block text-center font-body text-sm text-white/40 transition-colors hover:text-white/70"
        >
          ← Retour à la connexion
        </a>
      </form>
    </main>
  );
}
