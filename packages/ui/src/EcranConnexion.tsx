import { useState } from 'react';

import { Bouton } from './Bouton';
import { Champ } from './Champ';

interface Props {
  titre: string;
  sousTitre: string;
  /** Renvoie le message à afficher, ou `null` si la connexion a réussi. */
  onSoumettre: (email: string, motDePasse: string) => Promise<string | null>;
}

/**
 * Les deux applications avaient le même formulaire recopié, à deux chaînes
 * près. Une seule version ici : c'est la porte d'entrée du produit, et deux
 * portes qui divergent finissent par ne plus traiter les erreurs de la même
 * façon.
 */
export function EcranConnexion({ titre, sousTitre, onSoumettre }: Props) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(evenement: React.FormEvent) {
    evenement.preventDefault();
    setEnCours(true);
    setErreur(null);
    setErreur(await onSoumettre(email, motDePasse));
    setEnCours(false);
  }

  return (
    <main className="min-h-dvh grid place-items-center bg-dark-canvas p-5">
      <form
        onSubmit={soumettre}
        className="w-full max-w-formulaire bg-surface rounded-lg border border-hairline shadow-lg p-6"
      >
        <div className="flex items-center gap-3 mb-5">
          <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-headings font-bold text-base">K</span>
          </div>
          <div>
            <h1 className="font-headings font-bold text-xl text-ink leading-tight">{titre}</h1>
            <p className="text-sm font-body text-muted-foreground">{sousTitre}</p>
          </div>
        </div>

        <Champ
          libelle="Email"
          type="email"
          valeur={email}
          onChange={setEmail}
          requis
          autoComplete="username"
          className="mb-3"
        />
        <Champ
          libelle="Mot de passe"
          type="password"
          valeur={motDePasse}
          onChange={setMotDePasse}
          requis
          autoComplete="current-password"
          className="mb-5"
        />

        {erreur && (
          <p role="alert" className="text-sm font-body text-negative mb-3">
            {erreur}
          </p>
        )}

        <Bouton type="submit" pleineLargeur disabled={enCours}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </Bouton>
      </form>
    </main>
  );
}
