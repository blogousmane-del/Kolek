import { useEffect, useState } from 'react';
import { Coquille } from './Coquille';
import { supabase } from './supabase';

type Etat = 'verification' | 'admin' | 'refuse' | 'indisponible';

/**
 * Une session valide ne suffit pas à entrer : un collecteur possède des
 * identifiants Kolek parfaitement légitimes, et n'a rien à faire ici.
 *
 * La réponse vient de `est_admin()`, une fonction serveur qui n'ouvre aucune
 * ligne d'`admins` — c'est un portillon, pas un accès aux données. La vue
 * globale du dashboard passe toujours par les Edge Functions (spec §5.3).
 *
 * En cas d'erreur réseau, l'état est `indisponible`, jamais `admin` : un
 * portillon qui s'ouvre quand il ne sait pas n'est pas un portillon.
 */
export function Portillon() {
  const [etat, setEtat] = useState<Etat>('verification');

  useEffect(() => {
    let vivant = true;

    // Enveloppe `try` et non `.catch()` : le constructeur de requête de
    // supabase-js est un « thenable », pas une Promise.
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('est_admin');
        if (!vivant) return;
        setEtat(error ? 'indisponible' : data === true ? 'admin' : 'refuse');
      } catch {
        if (vivant) setEtat('indisponible');
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  if (etat === 'verification') return null;
  if (etat === 'admin') return <Coquille />;

  return (
    <Barrage
      titre={etat === 'refuse' ? 'Accès réservé' : 'Vérification impossible'}
      message={
        etat === 'refuse'
          ? 'Ce compte n’est pas un compte d’administration GTCS. Les collecteurs utilisent l’application Kolek, pas ce tableau de bord.'
          : 'Impossible de vérifier tes droits d’accès. Vérifie le réseau et réessaie.'
      }
      reessayer={etat === 'indisponible'}
    />
  );
}

function Barrage({
  titre,
  message,
  reessayer,
}: {
  titre: string;
  message: string;
  reessayer: boolean;
}) {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--dark-canvas)',
        padding: 'var(--space-20)',
      }}
    >
      <div className="carte" style={{ width: '100%', maxWidth: 'var(--mesure-formulaire)' }}>
        <h1 style={{ fontSize: 'var(--font-titre-carte)', margin: '0 0 var(--space-8)' }}>
          {titre}
        </h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 var(--space-20)' }}>{message}</p>

        {reessayer && (
          <button
            className="bouton-primaire"
            style={{ marginBottom: 'var(--space-12)' }}
            onClick={() => window.location.reload()}
          >
            Réessayer
          </button>
        )}

        <button className="bouton-fantome" onClick={() => supabase.auth.signOut()}>
          Se déconnecter
        </button>
      </div>
    </main>
  );
}
