import { useId } from 'react';

interface Props {
  libelle: string;
  type?: 'text' | 'email' | 'password' | 'tel';
  valeur: string;
  onChange: (valeur: string) => void;
  requis?: boolean;
  autoComplete?: string;
  className?: string;
  /** Rendu sur fond sombre. Les deux écrans de connexion sont passés au vert
      coffre le 2026-08-23 ; un champ blanc à bordure claire y devient une
      tache, et son étiquette en `text-ink` disparaît. La variante est portée
      ici plutôt que par des classes passées de l'extérieur, sinon chaque
      appelant réinvente son propre contraste. */
  sombre?: boolean;
}

export function Champ({
  libelle,
  type = 'text',
  valeur,
  onChange,
  requis = false,
  autoComplete,
  className = '',
  sombre = false,
}: Props) {
  // `useId` plutôt qu'un identifiant passé en propriété : deux formulaires sur
  // un même écran ne peuvent pas se voler leur étiquette par accident.
  const id = useId();

  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`block text-sm font-body font-semibold mb-1.5 ${
          sombre ? 'text-white/70' : 'text-ink'
        }`}
      >
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        required={requis}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full min-h-11 px-3.5 border-[1.5px] rounded-md text-base font-body outline-none ${
          sombre
            ? 'bg-white/5 border-white/15 text-white focus:border-or'
            : 'bg-input border-hairline text-ink focus:border-primary'
        }`}
      />
    </div>
  );
}
