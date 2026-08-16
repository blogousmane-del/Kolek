import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface Etat {
  tombe: boolean;
}

/**
 * Sans filet, une exception de rendu vide le DOM et le dashboard devient un
 * écran blanc sans explication. Le composant est dupliqué depuis
 * `apps/collecteur` plutôt que partagé : `packages/core` est du TypeScript pur,
 * sans React (spec §6.1), et le message diffère d'une application à l'autre.
 */
export class Filet extends Component<Props, Etat> {
  override state: Etat = { tombe: false };

  static getDerivedStateFromError(): Etat {
    return { tombe: true };
  }

  override componentDidCatch(erreur: Error, infos: ErrorInfo): void {
    console.error('Écran interrompu', erreur, infos.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.tombe) return this.props.children;

    return (
      <main
        style={{
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: 'var(--space-20)',
        }}
      >
        <div className="carte" style={{ width: '100%', maxWidth: 'var(--mesure-formulaire)' }}>
          <h1 style={{ fontSize: 'var(--font-titre-carte)', margin: '0 0 var(--space-8)' }}>
            L’application s’est interrompue
          </h1>
          <p style={{ color: 'var(--muted)', margin: '0 0 var(--space-20)' }}>
            Une erreur inattendue a interrompu l’affichage. Recharge la page.
          </p>
          <button className="bouton-primaire" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </div>
      </main>
    );
  }
}
