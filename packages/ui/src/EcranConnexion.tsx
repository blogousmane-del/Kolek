import { useState } from 'react';

import { Bouton } from './Bouton';
import { Champ } from './Champ';
import { Onde, Rosace } from './Guilloche';

/** Le bouton d'un fournisseur d'identité. Optionnel : l'administration n'en a
    pas, et n'en veut pas — un compte d'administration se protège par un mot de
    passe qu'on maîtrise, pas par la session Google d'un poste partagé. */
export interface ConnexionFederee {
  /** Renvoie le message à afficher, ou `null` si la redirection est partie. */
  onActiver: () => Promise<string | null>;
  libelle: string;
}

interface Props {
  titre: string;
  sousTitre: string;
  /** Renvoie le message à afficher, ou `null` si la connexion a réussi. */
  onSoumettre: (email: string, motDePasse: string) => Promise<string | null>;
  federee?: ConnexionFederee;
  /** Lien de retour vers la vitrine. Absent sur l'administration, qui ne se
      présente à personne. */
  retourAccueil?: string;
}

/** Le « G » de Google, tracé. Un fichier d'image serait bloqué par la CSP des
    deux applications (`img-src 'self'`), et un appel au CDN de Google sur une
    page de connexion annoncerait le compte avant même qu'on s'y connecte. */
function LogoGoogle() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5 shrink-0">
      <path
        fill="#4285F4"
        d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.8Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.9-3a7.2 7.2 0 0 1-10.7-3.8h-4v3.1A12 12 0 0 0 12 24Z"
      />
      <path fill="#FBBC05" d="M5.3 14.3a7.1 7.1 0 0 1 0-4.6v-3.1h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path
        fill="#EA4335"
        d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.5-3.5A12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z"
      />
    </svg>
  );
}

/**
 * La porte d'entrée des deux applications.
 *
 * Elle a été refaite le 2026-08-23 pour parler la même langue que la vitrine :
 * fond vert coffre, rosace guillochée, accent or. Un visiteur qui clique
 * « Se connecter » depuis la page de vente arrive ici ; s'il change de monde
 * visuel au passage, il doute d'être au bon endroit — et sur un produit qui
 * manipule l'épargne d'autrui, ce doute coûte cher.
 *
 * Le formulaire reste unique pour les deux applications. Deux portes qui
 * divergent finissent par ne plus traiter les erreurs de la même façon.
 */
export function EcranConnexion({
  titre,
  sousTitre,
  onSoumettre,
  federee,
  retourAccueil,
}: Props) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);
  const [redirection, setRedirection] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEnCours(true);
    setErreur(null);
    setErreur(await onSoumettre(email, motDePasse));
    setEnCours(false);
  }

  async function federer() {
    if (!federee || redirection) return;
    setRedirection(true);
    setErreur(null);
    const message = await federee.onActiver();
    // Succès : le navigateur part chez le fournisseur, ce composant disparaît.
    // On ne relâche l'état qu'en cas d'échec, sinon le bouton se réactiverait
    // une fraction de seconde avant la redirection.
    if (message) {
      setErreur(message);
      setRedirection(false);
    }
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
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-or">
            <span className="font-headings text-base font-bold text-dark-canvas">K</span>
          </div>
          <div>
            <h1 className="font-headings text-xl font-bold leading-tight text-white">{titre}</h1>
            <p className="font-body text-sm text-white/50">{sousTitre}</p>
          </div>
        </div>

        {federee && (
          <>
            <button
              type="button"
              onClick={federer}
              disabled={redirection}
              className="mb-4 flex w-full cursor-pointer items-center justify-center gap-3 rounded-pill bg-white px-4 py-3 font-body text-sm font-semibold text-ink transition-transform duration-300 hover:-translate-y-px disabled:opacity-60"
            >
              <LogoGoogle />
              {redirection ? 'Ouverture…' : federee.libelle}
            </button>

            <div className="mb-4 flex items-center gap-3">
              <span className="h-px flex-1 bg-white/10" />
              <span className="font-mono text-[10px] tracking-widest text-white/30">OU</span>
              <span className="h-px flex-1 bg-white/10" />
            </div>
          </>
        )}

        <Champ
          libelle="Email"
          type="email"
          valeur={email}
          onChange={setEmail}
          requis
          autoComplete="username"
          className="mb-3"
          sombre
        />
        <Champ
          libelle="Mot de passe"
          type="password"
          valeur={motDePasse}
          onChange={setMotDePasse}
          requis
          autoComplete="current-password"
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

        <Bouton type="submit" pleineLargeur disabled={enCours}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </Bouton>

        {retourAccueil && (
          <a
            href={retourAccueil}
            className="mt-5 block text-center font-body text-sm text-white/40 transition-colors hover:text-white/70"
          >
            ← Retour à l’accueil
          </a>
        )}
      </form>
    </main>
  );
}
