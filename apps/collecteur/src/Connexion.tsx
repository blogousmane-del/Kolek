import { EcranConnexion } from '@kolek/ui';

import { supabase } from './supabase';

/** La vitrine, pour le lien de retour. En dur plutôt qu'en variable
    d'environnement : c'est une adresse publique et stable, et une variable
    manquante au build donnerait un lien mort — pire qu'une constante. */
const VITRINE = 'https://kolek-site.netlify.app';

/**
 * La connexion du collecteur.
 *
 * ## Pourquoi Google est sûr ici, et ce qui le rend sûr
 *
 * Kolek n'a pas d'inscription libre : les comptes sont ouverts par GTCS, qui
 * facture l'abonnement. Un bouton « connexion en un clic » pourrait donc
 * ressembler à une porte dérobée vers un compte gratuit. Il ne l'est pas, et
 * **trois verrous indépendants** l'en empêchent — vérifiés en production le
 * 2026-08-23 :
 *
 * 1. **`disable_signup` est vrai** sur le projet. GoTrue refuse de créer un
 *    utilisateur pour une adresse inconnue, y compris par un fournisseur
 *    externe. Le refus arrive avant toute session.
 * 2. **`collecteurs` n'a aucune politique `INSERT`**, et `authenticated` n'a
 *    pas le droit d'y écrire. Personne ne peut se fabriquer une fiche.
 * 3. **Les clés étrangères** : `clients`, `cartes`, `mises`, `retraits`,
 *    `caisses_jour` référencent toutes `collecteurs(id)`. Sans fiche, chaque
 *    écriture échoue en `23503`, quelle que soit la politique RLS.
 *
 * Autrement dit, une adresse Gmail quelconque n'obtient rien. Une adresse déjà
 * enregistrée par GTCS obtient sa propre session — Supabase rattache
 * automatiquement une identité Google à un compte existant lorsque l'adresse
 * est vérifiée chez le fournisseur, ce que Google garantit.
 *
 * Le garde-fou du cas orphelin vit malgré tout dans `App.tsx`. Non parce qu'on
 * doute des trois verrous, mais parce qu'un réglage de tableau de bord peut
 * changer sans que ce fichier soit relu — `disable_signup` se décoche en deux
 * clics.
 */
export function Connexion() {
  return (
    <EcranConnexion
      titre="Kolek"
      sousTitre="Chaque mise compte"
      retourAccueil={VITRINE}
      federee={{
        libelle: 'Continuer avec Google',
        onActiver: async () => {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              // Retour sur l'application elle-même. `window.location.origin`
              // plutôt qu'une constante : la même construction sert en local,
              // en pré-production et en production, et une adresse figée
              // renverrait le développeur vers le site en ligne.
              redirectTo: window.location.origin,
            },
          });
          if (!error) return null;

          const message = error.message ?? '';

          // GoTrue répond en anglais. Les deux refus que le collecteur peut
          // réellement rencontrer sont nommés ; le reste passe tel quel, parce
          // qu'un message générique fait recommencer la même chose.
          if (/signups? not allowed|signup is disabled/i.test(message)) {
            return "Cette adresse Google n'est rattachée à aucun compte Kolek. Demande à GTCS d'ouvrir ton compte.";
          }
          if (/provider is not enabled|unsupported provider/i.test(message)) {
            return 'La connexion Google n’est pas encore activée sur ce projet.';
          }
          return 'Connexion Google impossible. Vérifie le réseau et réessaie.';
        },
      }}
      onSoumettre={async (email, motDePasse) => {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: motDePasse,
        });
        if (!error) return null;
        return error.status === 400 || error.status === 401
          ? 'Identifiants incorrects.'
          : 'Connexion impossible. Vérifie le réseau et réessaie.';
      }}
    />
  );
}
