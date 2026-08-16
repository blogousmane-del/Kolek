import type { ReactNode } from 'react';

/**
 * Écran de blocage : filet de rendu, portillon refusé, vérification
 * impossible. Même forme dans les trois cas — le lecteur reconnaît « quelque
 * chose s'arrête ici » avant même d'avoir lu le titre.
 */
export function EcranMessage({
  titre,
  message,
  children,
}: {
  titre: string;
  message: string;
  children?: ReactNode;
}) {
  return (
    <main className="min-h-dvh grid place-items-center bg-dark-canvas p-5">
      <div className="w-full max-w-formulaire bg-surface rounded-lg border border-hairline shadow-lg p-6">
        <h1 className="font-headings font-bold text-lg text-ink mb-2">{titre}</h1>
        <p className="text-base font-body text-muted-foreground mb-5">{message}</p>
        <div className="flex flex-col gap-2">{children}</div>
      </div>
    </main>
  );
}
