import { useEffect, useState } from 'react';
import { supabase } from './supabase';

interface LigneClient {
  id: string;
  nom: string;
  marche: string | null;
}

export function MesClients({ onDeconnexion }: { onDeconnexion: () => void }) {
  const [clients, setClients] = useState<LigneClient[] | null>(null);

  useEffect(() => {
    supabase
      .from('clients')
      .select('id, nom, marche')
      .order('nom')
      .then(({ data }) => setClients(data ?? []));
  }, []);

  return (
    <main style={{ padding: 16, maxWidth: 640, margin: '0 auto' }}>
      <header
        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
      >
        <h1 style={{ fontSize: 'var(--font-titre-page)' }}>Mes clients</h1>
        <button
          onClick={() => supabase.auth.signOut().then(onDeconnexion)}
          style={{
            border: 'none',
            background: 'none',
            color: 'var(--green-700)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Déconnexion
        </button>
      </header>

      {clients === null && <p style={{ color: 'var(--muted)' }}>Chargement…</p>}

      {clients?.length === 0 && (
        <div className="carte">
          <p style={{ margin: 0 }}>Aucun client pour l’instant.</p>
          <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 'var(--font-small)' }}>
            La souscription arrive au jalon J2.
          </p>
        </div>
      )}

      {clients?.map((c) => (
        <div className="carte" key={c.id} style={{ marginBottom: 12 }}>
          <strong>{c.nom}</strong>
          {c.marche && (
            <div style={{ color: 'var(--muted)', fontSize: 'var(--font-small)' }}>{c.marche}</div>
          )}
        </div>
      ))}
    </main>
  );
}
