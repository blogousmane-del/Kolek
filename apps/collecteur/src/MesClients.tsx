import { useEffect, useState } from 'react';
import { supabase } from './supabase';

interface LigneClient {
  id: string;
  nom: string;
  marche: string | null;
}

export function MesClients({ onDeconnexion }: { onDeconnexion: () => void }) {
  const [clients, setClients] = useState<LigneClient[] | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    let vivant = true;

    // Le `try` n'est pas décoratif : le constructeur de requête de supabase-js
    // est un « thenable », pas une Promise — il n'a pas de `.catch()`. Sans
    // cette enveloppe, un rejet (réseau coupé, exception dans le callback)
    // laisse `clients` à null : « Chargement… » figé pour toujours, sans issue
    // et sans message. C'est le pire état pour un collecteur en marché — il ne
    // sait pas s'il doit attendre ou recommencer.
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('clients')
          .select('id, nom, marche')
          .order('nom');

        if (!vivant) return;
        if (error) {
          setErreur('Impossible de charger tes clients.');
          setClients([]);
          return;
        }
        setClients(data ?? []);
      } catch {
        if (!vivant) return;
        setErreur('Impossible de charger tes clients.');
        setClients([]);
      }
    })();

    return () => {
      vivant = false;
    };
  }, []);

  async function deconnecter() {
    const { error } = await supabase.auth.signOut();
    if (error) {
      setErreur('Déconnexion impossible. Vérifie le réseau et réessaie.');
      return;
    }
    onDeconnexion();
  }

  return (
    <main
      style={{
        padding: 'var(--space-16)',
        maxWidth: 'var(--mesure-liste)',
        margin: '0 auto',
      }}
    >
      <header
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
      >
        <h1 style={{ fontSize: 'var(--font-titre-page)' }}>Mes clients</h1>
        <button className="bouton-fantome" onClick={deconnecter}>
          Déconnexion
        </button>
      </header>

      {erreur && (
        <div
          className="carte"
          style={{ borderColor: 'var(--negative)', marginBottom: 'var(--space-12)' }}
        >
          <p style={{ margin: 0, color: 'var(--negative)' }}>{erreur}</p>
        </div>
      )}

      {clients === null && <p style={{ color: 'var(--muted)' }}>Chargement…</p>}

      {!erreur && clients?.length === 0 && (
        <div className="carte">
          <p style={{ margin: 0 }}>Aucun client pour l’instant.</p>
          <p
            style={{
              margin: 'var(--space-4) 0 0',
              color: 'var(--muted)',
              fontSize: 'var(--font-small)',
            }}
          >
            La souscription arrive au jalon J2.
          </p>
        </div>
      )}

      {clients?.map((c) => (
        <div className="carte" key={c.id} style={{ marginBottom: 'var(--space-12)' }}>
          <strong>{c.nom}</strong>
          {c.marche && (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--font-small)' }}>{c.marche}</div>
          )}
        </div>
      ))}
    </main>
  );
}
