import { useId } from 'react';

interface Props {
  libelle: string;
  type?: 'text' | 'email' | 'password' | 'tel';
  valeur: string;
  onChange: (valeur: string) => void;
  requis?: boolean;
  autoComplete?: string;
  className?: string;
}

export function Champ({
  libelle,
  type = 'text',
  valeur,
  onChange,
  requis = false,
  autoComplete,
  className = '',
}: Props) {
  // `useId` plutôt qu'un identifiant passé en propriété : deux formulaires sur
  // un même écran ne peuvent pas se voler leur étiquette par accident.
  const id = useId();

  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-body font-semibold text-ink mb-1.5">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        value={valeur}
        required={requis}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        className="w-full min-h-11 px-3.5 bg-input border-[1.5px] border-hairline rounded-md text-base font-body text-ink outline-none focus:border-primary"
      />
    </div>
  );
}
