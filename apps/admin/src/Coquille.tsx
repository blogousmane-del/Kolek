import { BadgeEuro, Building2, LayoutDashboard, LifeBuoy, Users } from 'lucide-react';
import { supabase } from './supabase';

const NAV = [
  { icone: LayoutDashboard, libelle: 'Tableau de bord', section: 'Pilotage', actif: true },
  { icone: Users, libelle: 'Collecteurs', section: 'Pilotage', actif: false },
  { icone: Building2, libelle: 'Zones & marchés', section: 'Pilotage', actif: false },
  { icone: BadgeEuro, libelle: 'Abonnements', section: 'Monétisation', actif: false },
  { icone: LifeBuoy, libelle: 'Support', section: 'Support', actif: false },
];

export function Coquille() {
  const sections = [...new Set(NAV.map((n) => n.section))];

  return (
    <div className="grille-admin">
      <aside className="sidebar">
        <div style={{ padding: '4px 12px 8px', fontWeight: 700, fontSize: 18 }}>Kolek · Admin</div>
        {sections.map((section) => (
          <div key={section}>
            <div className="overline">{section}</div>
            {NAV.filter((n) => n.section === section).map((n) => (
              <div key={n.libelle} className={`nav-item${n.actif ? ' actif' : ''}`}>
                <n.icone size={20} strokeWidth={1.75} />
                {n.libelle}
              </div>
            ))}
          </div>
        ))}
      </aside>

      <main className="contenu">
        <div className="fil-ariane">Accueil → Tableau de bord</div>
        <div
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}
        >
          <h1 style={{ fontSize: 'var(--font-titre-page)', margin: '0 0 20px' }}>Tableau de bord</h1>
          <button
            onClick={() => supabase.auth.signOut()}
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
        </div>

        <div className="carte" style={{ maxWidth: 520 }}>
          <h2 style={{ fontSize: 'var(--font-titre-carte)', margin: '0 0 6px' }}>Socle en place</h2>
          <p style={{ margin: 0, color: 'var(--muted)' }}>
            Les widgets de supervision arrivent au jalon J4. Cette page fixe la mise en page et le
            langage visuel du Design System.
          </p>
        </div>
      </main>
    </div>
  );
}
