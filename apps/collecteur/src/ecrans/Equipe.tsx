import { COLLABORATEURS_MAX, formatMontant } from '@kolek/core';
import { Bouton, Carte, Icone, SqueletteLigne, useEnLigne } from '@kolek/ui';
import { useState } from 'react';

import { useDonnees } from '../cache';
import { creerCollaborateur } from '../ecritures-ecrans';
import { chargerEquipe, type MembreEquipe } from '../lectures-ecrans';
import { useAbonnementActif } from './commission';
import { CorpsEcran, EnTeteEcran } from './EnTeteEcran';

/**
 * « Mon équipe » — ce que le titulaire voit de ses collaborateurs.
 *
 * ## D'où viennent ces chiffres
 *
 * De `equipe_vue()`, et de nulle part ailleurs. Aucune policy RLS n'a été
 * élargie pour cet écran : par PostgREST, le titulaire ne voit toujours que ses
 * propres clients, ses propres cartes, ses propres mises. C'est une fonction
 * `security definer` **sans paramètre** qui ouvre la porte, et qui la referme —
 * elle lit `auth.uid()` elle-même, donc on ne peut pas demander l'équipe d'un
 * autre.
 *
 * ## Ce que l'écran ne dit pas
 *
 * Il ne montre **pas** la caisse comme déclarée quand elle ne l'est pas.
 * `cash_attendu` existe toujours côté serveur, mais tant que le collaborateur
 * n'a pas compté, il n'y a pas d'écart : afficher « 0 FCFA d'écart » serait un
 * chiffre inventé, et le titulaire le lirait comme « tout va bien ».
 */
export function Equipe({
  revision,
  onRetour,
  onOuvrir,
}: {
  revision: number;
  onRetour: () => void;
  /** Ouvre la tournée d'un coéquipier. Le nom voyage avec l'identifiant : le
      bandeau de l'écran suivant doit le porter même quand la liste est vide. */
  onOuvrir: (id: string, nom: string) => void;
}) {
  const { donnees: equipe, erreur } = useDonnees('equipe', chargerEquipe, {
    revision,
    messageErreur: 'Équipe indisponible. Vérifie le réseau.',
  });
  const abonnementActif = useAbonnementActif();
  const [formulaireOuvert, setFormulaireOuvert] = useState(false);

  const membres = equipe ?? [];
  const restantes = COLLABORATEURS_MAX - membres.length;
  const commissionsEquipe = membres.reduce((total, m) => total + m.commissions, 0);

  return (
    <div className="flex-1 flex flex-col">
      <EnTeteEcran
        titre="Mon équipe"
        sousTitre="Tes collaborateurs, leurs tournées et leur caisse du soir"
        onRetour={onRetour}
      />

      <CorpsEcran
        enfants={
          <>
            {erreur && (
              <p role="alert" className="text-sm font-body text-negative">
                {erreur}
              </p>
            )}

            {equipe === null && !erreur && (
              <>
                <SqueletteLigne />
                <SqueletteLigne />
                <SqueletteLigne />
              </>
            )}

            {membres.map((membre) => (
              <CarteCollaborateur
                key={membre.id}
                membre={membre}
                onOuvrir={() => onOuvrir(membre.id, membre.nom)}
              />
            ))}

            {equipe !== null && membres.length > 0 && (
              <Carte className="p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="font-body text-sm text-muted-foreground">
                    Commissions de l’équipe
                  </span>
                  <span className="font-headings font-bold text-lg text-positive tabular-nums">
                    {formatMontant(commissionsEquipe)}{' '}
                    <span className="text-xs font-body font-semibold">FCFA</span>
                  </span>
                </div>
                {/* La contrepartie de la ligne retirée du Bilan des
                    collaborateurs : la commission ne disparaît pas, elle change
                    de poche. */}
                <p className="font-body text-xs text-muted-foreground mt-1">
                  La première mise de chaque carte de l’équipe te revient.
                </p>
              </Carte>
            )}

            {equipe !== null && (
              <Places
                restantes={restantes}
                abonnementActif={abonnementActif}
                ouvert={formulaireOuvert}
                onOuvrir={() => setFormulaireOuvert(true)}
                onFermer={() => setFormulaireOuvert(false)}
              />
            )}
          </>
        }
      />
    </div>
  );
}

/** Un collaborateur, sa tournée et sa caisse du soir. */
function CarteCollaborateur({ membre, onOuvrir }: { membre: MembreEquipe; onOuvrir: () => void }) {
  return (
    <Carte className="p-0 overflow-hidden">
      <button
        type="button"
        onClick={onOuvrir}
        className="anim-pression w-full text-left p-4 cursor-pointer"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="min-w-0">
            <p className="font-headings font-bold text-base text-ink truncate">{membre.nom}</p>
            {membre.telephone && (
              <p className="font-body text-xs text-muted-foreground truncate">{membre.telephone}</p>
            )}
          </div>
          <Icone nom="chevron-right" taille={18} className="text-muted-foreground shrink-0" />
        </div>

        <div className="grid grid-cols-3 gap-2 text-center p-2 rounded-xl bg-muted/40 border border-hairline/60">
          <Chiffre libelle="Clients" valeur={String(membre.clients)} />
          <Chiffre libelle="Cartes" valeur={String(membre.cartesActives)} />
          <Chiffre libelle="Encours" valeur={formatMontant(membre.encours)} />
        </div>

        <p className="font-body text-xs text-muted-foreground mt-2">
          {membre.derniereDeclaration === null ? (
            'Caisse du soir : pas encore comptée'
          ) : (
            <>
              Caisse déclarée : {formatMontant(membre.cashDeclare ?? 0)} FCFA ·{' '}
              <span className={membre.ecart === 0 ? 'text-positive' : 'text-negative'}>
                écart {formatMontant(membre.ecart ?? 0)} FCFA
              </span>
            </>
          )}
        </p>
      </button>
    </Carte>
  );
}

function Chiffre({ libelle, valeur }: { libelle: string; valeur: string }) {
  return (
    <div>
      <p className="font-headings font-bold text-sm text-ink tabular-nums">{valeur}</p>
      <p className="font-body text-[0.65rem] text-muted-foreground">{libelle}</p>
    </div>
  );
}

/**
 * Les places restantes, et le formulaire d'ajout.
 *
 * Le compte est écrit en clair. Le déduire de la présence d'un bouton
 * demanderait au titulaire de compter ses collaborateurs pour savoir combien il
 * peut encore en activer — sur un forfait qu'il paie pour ça.
 */
function Places({
  restantes,
  abonnementActif,
  ouvert,
  onOuvrir,
  onFermer,
}: {
  restantes: number;
  abonnementActif: boolean;
  ouvert: boolean;
  onOuvrir: () => void;
  onFermer: () => void;
}) {
  // Le serveur refuse un titulaire suspendu, et il a raison. Ce qu'il ne peut
  // pas faire, c'est empêcher l'écran d'avoir promis le contraire : le
  // 2026-09-03, un titulaire lisait « Il te reste 3 places » avant de se voir
  // refuser. La place existe bien ; c'est l'abonnement qui manque, et c'est ce
  // qu'il faut dire — avant le formulaire, pas après l'envoi.
  if (!abonnementActif) {
    return (
      <p className="font-body text-sm text-muted-foreground text-center py-2">
        Ton abonnement n’est plus actif. Tes {COLLABORATEURS_MAX} places restent, mais tu ne peux
        pas activer de collaborateur tant qu’il ne l’est pas. Contacte GTCS.
      </p>
    );
  }

  if (restantes <= 0) {
    return (
      <p className="font-body text-sm text-muted-foreground text-center py-2">
        Équipe complète — {COLLABORATEURS_MAX} collaborateurs sur {COLLABORATEURS_MAX}.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <p className="font-body text-sm text-muted-foreground text-center">
        {restantes === 1 ? 'Il te reste 1 place' : `Il te reste ${restantes} places`} sur les{' '}
        {COLLABORATEURS_MAX} de ton forfait.
      </p>
      {ouvert ? (
        <FormulaireCollaborateur onAnnuler={onFermer} onCree={onFermer} />
      ) : (
        <Bouton onClick={onOuvrir} pleineLargeur>
          Ajouter un collaborateur
        </Bouton>
      )}
    </div>
  );
}

/**
 * Le formulaire d'ajout.
 *
 * Il exige le réseau, et le dit. Créer un compte passe par une Edge Function :
 * il n'y a pas de file de synchro derrière, donc un bouton actif hors ligne
 * échouerait sans rien réparer plus tard.
 */
function FormulaireCollaborateur({
  onAnnuler,
  onCree,
}: {
  onAnnuler: () => void;
  onCree: () => void;
}) {
  const enLigne = useEnLigne();
  const [nom, setNom] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [zone, setZone] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const pret =
    nom.trim().length > 0 && email.trim().length > 0 && motDePasse.length >= 10 && enLigne;

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    const resultat = await creerCollaborateur({
      email: email.trim(),
      motDePasse,
      nom: nom.trim(),
      telephone: telephone.trim(),
      ...(zone.trim() ? { zone: zone.trim() } : {}),
    });
    setEnvoi(false);
    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    onCree();
  }

  return (
    <Carte className="p-4 space-y-3">
      <p className="font-headings font-bold text-base text-ink">Nouveau collaborateur</p>
      <p className="font-body text-xs text-muted-foreground">
        Il aura ses propres clients et sa propre caisse. Tu pourras encaisser à sa place.
      </p>

      <Champ libelle="Nom" valeur={nom} onSaisir={setNom} />
      <Champ libelle="Téléphone" valeur={telephone} onSaisir={setTelephone} type="tel" />
      <Champ libelle="Adresse de connexion" valeur={email} onSaisir={setEmail} type="email" />
      <Champ
        libelle="Mot de passe (10 caractères au moins)"
        valeur={motDePasse}
        onSaisir={setMotDePasse}
        type="password"
      />
      <Champ libelle="Zone (facultatif)" valeur={zone} onSaisir={setZone} />

      {!enLigne && (
        <p className="font-body text-sm text-negative">
          Créer un collaborateur demande une connexion. Ta tournée, elle, fonctionne hors ligne.
        </p>
      )}
      {erreur && (
        <p role="alert" className="font-body text-sm text-negative">
          {erreur}
        </p>
      )}

      <div className="flex gap-2">
        <Bouton onClick={enregistrer} disabled={!pret || envoi}>
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
  libelle,
  valeur,
  onSaisir,
  type = 'text',
}: {
  libelle: string;
  valeur: string;
  onSaisir: (valeur: string) => void;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="block text-sm font-body text-muted-foreground mb-1">{libelle}</span>
      <input
        type={type}
        value={valeur}
        onChange={(e) => onSaisir(e.target.value)}
        className="w-full bg-surface border border-hairline rounded-md px-3 py-2.5 text-base font-body text-ink outline-none focus:border-primary"
      />
    </label>
  );
}
