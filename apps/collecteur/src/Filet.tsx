import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface Etat {
  tombe: boolean;
}

/**
 * Sans filet, une exception de rendu vide le DOM : le collecteur, en plein
 * marché, voit un écran blanc muet et n'a aucune façon de savoir s'il doit
 * recommencer son encaissement. On préfère un message et un bouton.
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
            Rien n’est perdu : les mises déjà enregistrées sur ce téléphone restent en attente de
            synchronisation. Recharge l’écran.
          </p>
          <button className="bouton-primaire" onClick={() => window.location.reload()}>
            Recharger
          </button>
        </div>
      </main>
    );
  }
}
