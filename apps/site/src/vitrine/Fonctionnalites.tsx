import { MISES_PAR_CYCLE } from '@kolek/core';
import { useEffect, useState } from 'react';

import { useMouvementAccepte } from './animation';

/**
 * Trois artefacts fonctionnels — pas trois cartes marketing.
 *
 * Chaque carte est une micro-interface qui *fait* ce que le produit fait, avec
 * les vrais objets du métier : la carte de 31 cases, le journal des reçus, la
 * caisse du soir. Les montants sont réalistes (des mises de 300 à 1 000 FCFA,
 * celles du terrain) mais les noms sont inventés — aucune donnée réelle ne
 * sort jamais vers ce site, sa CSP l'interdit d'ailleurs.
 */

/* ------------------------- 1. Le mélangeur de cartes ---------------------- */

interface CarteDemo {
  nom: string;
  mise: number;
  jour: number;
}

const CARTES_INITIALES: CarteDemo[] = [
  { nom: 'Mariam K.', mise: 500, jour: 18 },
  { nom: 'Adama T.', mise: 1000, jour: 7 },
  { nom: 'Fatou D.', mise: 300, jour: 26 },
];

function MelangeurCartes() {
  const [cartes, setCartes] = useState(CARTES_INITIALES);
  const anime = useMouvementAccepte();

  useEffect(() => {
    if (!anime) return;
    const minuterie = setInterval(() => {
      setCartes((prec) => {
        const suiv = [...prec];
        const derniere = suiv.pop();
        if (derniere) suiv.unshift(derniere);
        return suiv;
      });
    }, 3000);
    return () => clearInterval(minuterie);
  }, [anime]);

  return (
    <div className="relative h-56">
      {cartes.map((carte, i) => (
        <div
          key={carte.nom}
          className="absolute inset-x-0 rounded-[1.25rem] border border-hairline bg-surface p-4 shadow-md transition-all duration-700 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]"
          style={{
            top: `${i * 26}px`,
            zIndex: 3 - i,
            transform: `scale(${1 - i * 0.05})`,
            opacity: 1 - i * 0.25,
          }}
        >
          <div className="mb-3 flex items-baseline justify-between">
            <p className="font-headings text-base font-bold text-ink">{carte.nom}</p>
            <p className="font-mono text-xs text-muted-foreground">
              {carte.jour}/{MISES_PAR_CYCLE}
            </p>
          </div>
          {/* La carte de collecte en miniature : ses cases, sa progression. */}
          <div className="mb-3 grid grid-cols-16 gap-0.5">
            {Array.from({ length: MISES_PAR_CYCLE }, (_, c) => (
              <div
                key={c}
                className={`h-2 rounded-[2px] ${c < carte.jour ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>
          <p className="font-mono text-sm font-medium text-primary tabular-nums">
            {carte.mise.toLocaleString('fr-FR')} FCFA / jour
          </p>
        </div>
      ))}
    </div>
  );
}

/* --------------------- 2. La machine à écrire télémétrie ------------------ */

const JOURNAL = [
  '18:02  mise encaissée      500 FCFA   reçu 7F3A',
  '18:04  mise encaissée    1 000 FCFA   reçu 91CE',
  '18:09  mise encaissée      300 FCFA   reçu 04B7',
  '18:31  caisse attendue  12 500 FCFA',
  '18:32  caisse déclarée  12 500 FCFA',
  '18:32  écart                 0 FCFA   ✓ caisse juste',
] as const;

function MachineTelemetrie() {
  const anime = useMouvementAccepte();
  // Sans mouvement, le journal est montré fini : la carte doit rester
  // informative, pas devenir vide. C'est la règle de toute la vitrine — on
  // retire l'animation, jamais le contenu.
  const [lignes, setLignes] = useState<string[]>(anime ? [] : [...JOURNAL].slice(-5));
  const [courante, setCourante] = useState('');

  useEffect(() => {
    if (!anime) return;
    let ligne = 0;
    let caractere = 0;
    const minuterie = setInterval(() => {
      const texte = JOURNAL[ligne];
      if (texte === undefined) {
        // Fin du journal : on repart, comme un vrai flux.
        ligne = 0;
        caractere = 0;
        setLignes([]);
        setCourante('');
        return;
      }
      caractere += 1;
      setCourante(texte.slice(0, caractere));
      if (caractere >= texte.length) {
        setLignes((prec) => [...prec.slice(-4), texte]);
        setCourante('');
        ligne += 1;
        caractere = 0;
      }
    }, 34);
    return () => clearInterval(minuterie);
  }, [anime]);

  return (
    <div className="flex h-56 flex-col rounded-[1.25rem] border border-hairline bg-dark-canvas p-4">
      <p className="mb-3 flex items-center gap-2 font-mono text-[10px] tracking-widest text-or">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-pill bg-or" />
        FLUX EN DIRECT — CAISSE DU SOIR
      </p>
      <div className="flex-1 overflow-hidden font-mono text-xs leading-6 text-white/70">
        {lignes.map((l) => (
          <p key={l} className={l.includes('✓') ? 'text-chart-mint' : undefined}>
            {l}
          </p>
        ))}
        {anime && (
          <p className="text-white">
            {courante}
            <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-or align-middle" />
          </p>
        )}
      </div>
    </div>
  );
}

/* ----------------------- 3. Le planificateur à curseur -------------------- */

const JOURS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'] as const;

/** Étapes de la chorégraphie : position du curseur, jour actif, pression. */
type Etape =
  | { type: 'repos' }
  | { type: 'survol'; jour: number }
  | { type: 'clic'; jour: number }
  | { type: 'sauvegarde' };

const CHOREGRAPHIE: Etape[] = [
  { type: 'repos' },
  { type: 'survol', jour: 2 },
  { type: 'clic', jour: 2 },
  { type: 'survol', jour: 5 },
  { type: 'clic', jour: 5 },
  { type: 'sauvegarde' },
];

function PlanificateurTournee() {
  const anime = useMouvementAccepte();
  const [pas, setPas] = useState(0);
  // Au repos : les deux jours déjà choisis, comme à la fin de la chorégraphie.
  const [actifs, setActifs] = useState<number[]>(anime ? [] : [2, 5]);

  useEffect(() => {
    if (!anime) return;
    const minuterie = setInterval(() => {
      setPas((p) => {
        const suivant = (p + 1) % CHOREGRAPHIE.length;
        const etape = CHOREGRAPHIE[suivant];
        if (suivant === 0) setActifs([]);
        else if (etape.type === 'clic') setActifs((a) => [...a, etape.jour]);
        return suivant;
      });
    }, 1400);
    return () => clearInterval(minuterie);
  }, [anime]);

  const etape = CHOREGRAPHIE[pas];
  const jourVise = etape.type === 'survol' || etape.type === 'clic' ? etape.jour : null;
  const surSauvegarde = etape.type === 'sauvegarde';

  return (
    <div className="relative flex h-56 flex-col justify-between rounded-[1.25rem] border border-hairline bg-surface p-4">
      <p className="font-mono text-[10px] tracking-widest text-muted-foreground">
        TA TOURNÉE — JOURS DE CLÔTURE
      </p>
      <div className="grid grid-cols-7 gap-1.5">
        {JOURS.map((jour, i) => (
          <div
            key={i}
            className={`flex h-12 items-center justify-center rounded-md border font-mono text-sm transition-all duration-300 ${
              actifs.includes(i)
                ? 'border-or bg-or/15 font-bold text-primary'
                : 'border-hairline text-muted-foreground'
            } ${jourVise === i && etape.type === 'clic' ? 'scale-95' : ''}`}
          >
            {jour}
          </div>
        ))}
      </div>
      <button
        type="button"
        tabIndex={-1}
        aria-hidden
        className={`self-end rounded-pill px-4 py-2 font-body text-sm font-semibold transition-all duration-300 ${
          surSauvegarde ? 'scale-95 bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        }`}
      >
        Sauvegarder
      </button>
      {/* Le curseur. Positionné par étape ; disparaît au repos. */}
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        className="absolute z-10 h-5 w-5 text-ink drop-shadow-md transition-all duration-500 ease-out"
        style={{
          left: surSauvegarde ? '78%' : jourVise !== null ? `${8 + jourVise * 12.5}%` : '45%',
          top: surSauvegarde ? '74%' : jourVise !== null ? '48%' : '30%',
          opacity: !anime || etape.type === 'repos' ? 0 : 1,
          transform: etape.type === 'clic' || surSauvegarde ? 'scale(0.85)' : 'scale(1)',
        }}
      >
        <path fill="currentColor" d="M5.5 3.2 19 10.4l-6 1.6-3.2 5.4z" />
      </svg>
    </div>
  );
}

/* --------------------------------- Section ------------------------------- */

const ARTEFACTS = [
  {
    titre: 'Le carnet, sans le papier',
    detail:
      'La carte de 31 cases que tes clients connaissent — digitale, impossible à perdre, impossible à raturer.',
    rendu: <MelangeurCartes />,
  },
  {
    titre: 'La caisse, rapprochée chaque soir',
    detail:
      'Le serveur calcule ce que tu dois avoir en main. Tu comptes, tu déclares, l’écart est nommé avant qu’il grossisse.',
    rendu: <MachineTelemetrie />,
  },
  {
    titre: 'L’argent reste dans ta main',
    detail:
      'Kolek compte, il ne touche pas. Aucun franc de tes clients ne transite par la plateforme — c’est écrit dans son code.',
    rendu: <PlanificateurTournee />,
  },
] as const;

export function Fonctionnalites() {
  return (
    <section id="produit" className="bg-canvas px-6 py-24 sm:px-12 lg:px-20">
      <p className="mb-3 font-mono text-xs tracking-widest text-primary">LE PRODUIT</p>
      <h2 className="mb-12 max-w-2xl font-headings text-3xl font-bold text-ink sm:text-4xl">
        Trois instruments, un métier
      </h2>
      <div className="grid gap-6 lg:grid-cols-3">
        {ARTEFACTS.map((artefact) => (
          <article
            key={artefact.titre}
            className="rounded-[2rem] border border-hairline bg-paper p-6 shadow-sm transition-transform duration-300 hover:-translate-y-1"
          >
            {artefact.rendu}
            <h3 className="mb-2 mt-5 font-headings text-xl font-bold text-ink">{artefact.titre}</h3>
            <p className="font-body text-sm leading-relaxed text-muted-foreground">
              {artefact.detail}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
