import { useState } from 'react';
import { supabase } from './supabase';

export function Connexion() {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e: React.FormEvent) {
    e.preventDefault();
    setEnCours(true);
    setErreur(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password: motDePasse });
    if (error) {
      setErreur(
        error.status === 400 || error.status === 401
          ? 'Identifiants incorrects.'
          : 'Connexion impossible. Vérifie le réseau et réessaie.',
      );
    }
    setEnCours(false);
  }

  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        background: 'var(--dark-canvas)',
        padding: 20,
      }}
    >
      <form className="carte" style={{ width: '100%', maxWidth: 360 }} onSubmit={soumettre}>
        <h1 style={{ fontSize: 'var(--font-titre-page)', margin: '0 0 4px' }}>Kolek · Admin</h1>
        <p style={{ color: 'var(--muted)', margin: '0 0 20px' }}>Pilotage GTCS</p>

        <label style={{ display: 'block', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--font-small)', fontWeight: 600 }}>Email</span>
          <input
            className="champ"
            type="email"
            value={email}
            required
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>

        <label style={{ display: 'block', marginBottom: 20 }}>
          <span style={{ fontSize: 'var(--font-small)', fontWeight: 600 }}>Mot de passe</span>
          <input
            className="champ"
            type="password"
            value={motDePasse}
            required
            onChange={(e) => setMotDePasse(e.target.value)}
          />
        </label>

        {erreur && (
          <p style={{ color: 'var(--negative)', fontSize: 'var(--font-small)' }}>{erreur}</p>
        )}

        <button className="bouton-primaire" type="submit" disabled={enCours}>
          {enCours ? 'Connexion…' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
