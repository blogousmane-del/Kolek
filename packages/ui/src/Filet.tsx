import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Bouton } from './Bouton';
import { EcranMessage } from './EcranMessage';

interface Props {
  children: ReactNode;
  /** Ce qui rassure dépend de l'application : le collecteur veut savoir que ses
      mises ne sont pas perdues, l'administrateur que rien n'a été écrit. */
  message: string;
}

interface Etat {
  tombe: boolean;
}

/**
 * Sans filet, une exception de rendu vide le DOM : l'utilisateur, en plein
 * marché, voit un écran blanc muet et n'a aucune façon de savoir s'il doit
 * recommencer. On préfère un message et un bouton.
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
      <EcranMessage titre="L’application s’est interrompue" message={this.props.message}>
        <Bouton pleineLargeur onClick={() => window.location.reload()}>
          Recharger
        </Bouton>
      </EcranMessage>
    );
  }
}
