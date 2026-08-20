import { PALIERS, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone } from '@kolek/ui';
import { useState } from 'react';

import { creerCollecteur } from '../donnees';

/** Assez long pour tenir l'intention écrite dans `config.toml`. Le distant
    applique 8 ; exiger davantage ici ne peut jamais être refusé par le serveur. */
const LONGUEUR_MOT_DE_PASSE = 10;

/**
 * Engendre un mot de passe fort plutôt que d'en laisser inventer un.
 *
 * `crypto.getRandomValues` et non `Math.random` : le second est prévisible, et
 * un mot de passe prévisible sur un compte qui manipule l'épargne d'autrui n'est
 * pas un mot de passe.
 *
 * L'alphabet écarte `l`, `I`, `O`, `0` et `1`. Ces identifiants sont recopiés à
 * la main sur un téléphone, souvent dictés : un zéro pris pour un O produit un
 * collecteur qui n'arrive pas à se connecter et personne pour savoir pourquoi.
 */
function engendrerMotDePasse(): string {
  const alphabet = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const octets = new Uint32Array(16);
  crypto.getRandomValues(octets);
  return Array.from(octets, (n) => alphabet[n % alphabet.length]).join('');
}

/**
 * Création d'un compte collecteur.
 *
 * L'inscription publique est fermée — et doit le rester : personne ne s'inscrit
 * seul sur une plateforme qui manipule l'épargne d'autrui. C'est donc le seul
 * chemin par lequel un collecteur peut exister.
 *
 * Le formulaire vit ici, la création se fait dans une Edge Function : créer un
 * utilisateur exige la clé de service, qui ne doit jamais atteindre un
 * navigateur.
 *
 * Le mot de passe est engendré et affiché **une fois**. Le laisser choisir à
 * l'administrateur produirait, sur vingt collecteurs, vingt variantes du même
 * mot ; et le garder en base pour le relire plus tard reviendrait à stocker un
 * mot de passe en clair. Il est montré, il est recopié, il disparaît.
 */
export function FormulaireCollecteur({
  onAnnuler,
  onCree,
}: {
  onAnnuler: () => void;
  onCree: () => void;
}) {
  const [email, setEmail] = useState('');
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [zone, setZone] = useState('');
  const [palier, setPalier] = useState('essai');
  const [motDePasse, setMotDePasse] = useState(engendrerMotDePasse);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [cree, setCree] = useState(false);

  const pret =
    email.includes('@') &&
    nom.trim().length > 0 &&
    telephone.trim().length > 0 &&
    motDePasse.length >= LONGUEUR_MOT_DE_PASSE;

  async function enregistrer() {
    if (!pret || envoi) return;
    setEnvoi(true);
    setErreur(null);

    const resultat = await creerCollecteur({ email, motDePasse, nom, telephone, zone, palier });

    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.message);
      return;
    }
    setCree(true);
    onCree();
  }

  if (cree) {
    return (
      <Carte className="p-5 border-positive">
        <h2 className="font-headings font-bold text-xl text-ink mb-1">Compte créé</h2>
        <p className="text-sm font-body text-muted-foreground mb-4">
          Remets ces identifiants à {nom} en main propre. Le mot de passe n’est stocké nulle part
          et ne pourra pas être relu.
        </p>
        <div className="bg-canvas border border-hairline rounded-md p-4 mb-4">
          <p className="text-xs font-body uppercase tracking-widest text-muted-foreground mb-1">
            Adresse
          </p>
          <p className="font-body font-semibold text-ink mb-3 break-all">{email}</p>
          <p className="text-xs font-body uppercase tracking-widest text-muted-foreground mb-1">
            Mot de passe
          </p>
          <p className="font-mono font-semibold text-ink break-all">{motDePasse}</p>
        </div>
        <Bouton onClick={onAnnuler}>J’ai noté les identifiants</Bouton>
      </Carte>
    );
  }

  return (
    <Carte className="p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="font-headings font-bold text-xl text-ink">Nouveau collecteur</h2>
        <button
          type="button"
          onClick={onAnnuler}
          aria-label="Fermer le formulaire"
          className="w-9 h-9 rounded-pill flex items-center justify-center cursor-pointer"
        >
          <Icone nom="x" taille={18} className="text-muted-foreground" />
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Champ id="col-nom" libelle="Nom" valeur={nom} onChange={setNom} maxLength={120} />
        <Champ
          id="col-tel"
          libelle="Téléphone"
          valeur={telephone}
          onChange={setTelephone}
          maxLength={64}
          type="tel"
        />
        <Champ
          id="col-email"
          libelle="Adresse électronique"
          valeur={email}
          onChange={setEmail}
          type="email"
        />
        <Champ
          id="col-zone"
          libelle="Zone (optionnel)"
          valeur={zone}
          onChange={setZone}
          maxLength={80}
        />
      </div>

      <div className="mt-4">
        <p className="block text-sm font-body font-semibold text-ink mb-2">Palier</p>
        <div className="flex gap-2 flex-wrap">
          {PALIERS.map((p) => (
            <button
              key={p.cle}
              type="button"
              onClick={() => setPalier(p.cle)}
              className={`px-3 py-2 rounded-pill text-sm font-body font-semibold border cursor-pointer ${
                p.cle === palier
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-surface text-ink border-hairline'
              }`}
            >
              {p.nom} · {p.prix === 0 ? 'gratuit' : `${formatMontant(p.prix)} FCFA`}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <label htmlFor="col-mdp" className="block text-sm font-body font-semibold text-ink mb-1">
          Mot de passe
        </label>
        <div className="flex gap-2">
          <input
            id="col-mdp"
            type="text"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            className="flex-1 min-w-0 bg-surface border border-hairline rounded-md px-3 py-2.5 font-mono text-sm text-ink outline-none focus:border-primary"
          />
          <Bouton
            variante="contour"
            icone="history"
            onClick={() => setMotDePasse(engendrerMotDePasse())}
          >
            Autre
          </Bouton>
        </div>
        <p className="text-xs font-body text-muted-foreground mt-1.5">
          Engendré aléatoirement. Il s’affichera une fois après la création, puis ne sera plus
          jamais lisible.
        </p>
      </div>

      {erreur && (
        <p role="alert" className="text-sm font-body text-negative mt-3">
          {erreur}
        </p>
      )}

      <div className="flex gap-2 mt-5">
        <Bouton disabled={!pret || envoi} onClick={enregistrer}>
          {envoi ? 'Création…' : 'Créer le compte'}
        </Bouton>
        <Bouton variante="contour" onClick={onAnnuler}>
          Annuler
        </Bouton>
      </div>
    </Carte>
  );
}

function Champ({
  id,
  libelle,
  valeur,
  onChange,
  maxLength,
  type = 'text',
}: {
  id: string;
  libelle: string;
  valeur: string;
  onChange: (v: string) => void;
  maxLength?: number;
  type?: string;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-body font-semibold text-ink mb-1">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        maxLength={maxLength}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink outline-none focus:border-primary"
      />
    </div>
  );
}
