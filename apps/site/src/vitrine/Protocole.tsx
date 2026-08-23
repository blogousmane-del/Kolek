import { Rosace } from '@kolek/ui';

import { gsap, useAnimations } from './animation';

/**
 * L'archive empilée — le protocole en trois actes.
 *
 * Trois cartes plein écran épinglées : quand la suivante monte, la précédente
 * recule, se floute et s'éteint. C'est la seule section « lourde » de la page,
 * et elle raconte la seule chose qui compte : le chemin d'un franc dans Kolek.
 *
 * Chaque carte porte une animation dessinée — rosace lente, balayage laser sur
 * grille, onde ECG — parce que les trois gestes du métier ont chacun leur
 * rythme : la collecte tourne, le rapprochement scanne, la restitution bat.
 */

const ETAPES = [
  {
    numero: '01',
    titre: 'Encaisser',
    detail:
      'Trois gestes sur le téléphone, un reçu numéroté, la case du jour cochée. Hors ligne aussi : la mise part quand le réseau revient, sans jamais compter deux fois.',
    animation: 'rosace',
  },
  {
    numero: '02',
    titre: 'Rapprocher',
    detail:
      'Le soir, le serveur calcule le cash attendu depuis les mises du jour. Tu comptes ce que tu as en main, tu déclares — l’écart est nommé, expliqué, daté.',
    animation: 'balayage',
  },
  {
    numero: '03',
    titre: 'Restituer',
    detail:
      'Cycle bouclé : le solde à rendre est affiché avant confirmation, calculé par le serveur, inscrit au journal. Ta commission — la première mise — est déjà à part.',
    animation: 'onde',
  },
] as const;

/** Grille de points balayée par une ligne laser. */
function Balayage() {
  const points = Array.from({ length: 96 }, (_, i) => ({
    x: 12 + (i % 12) * 16,
    y: 12 + Math.floor(i / 12) * 16,
  }));
  return (
    <svg aria-hidden viewBox="0 0 200 140" className="h-full w-full text-or">
      {points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={1.3} fill="currentColor" opacity={0.35} />
      ))}
      <line data-laser x1={0} y1={0} x2={0} y2={140} stroke="currentColor" strokeWidth={1.5} />
    </svg>
  );
}

/** Onde style ECG, tracée puis effacée en boucle par `stroke-dashoffset`. */
function OndePouls() {
  const chemin =
    'M0,70 L40,70 L52,70 L60,38 L70,96 L80,58 L88,70 L120,70 L132,70 L140,44 L150,90 L160,62 L168,70 L200,70';
  return (
    <svg aria-hidden viewBox="0 0 200 140" className="h-full w-full text-or">
      <path
        data-pouls
        d={chemin}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
    </svg>
  );
}

export function Protocole() {
  const ref = useAnimations<HTMLElement>(() => {
    const cartes = gsap.utils.toArray<HTMLElement>('[data-carte-protocole]');

    cartes.forEach((carte, i) => {
      if (i === cartes.length - 1) return;
      // Quand la carte suivante recouvre celle-ci, celle-ci recule.
      gsap.to(carte, {
        scale: 0.9,
        filter: 'blur(20px)',
        opacity: 0.5,
        ease: 'none',
        scrollTrigger: {
          trigger: cartes[i + 1],
          start: 'top bottom',
          end: 'top top',
          scrub: true,
        },
      });
    });

    // Le laser balaie la grille, aller-retour.
    gsap.to('[data-laser]', {
      attr: { x1: 200, x2: 200 },
      duration: 2.6,
      ease: 'power2.inOut',
      repeat: -1,
      yoyo: true,
    });

    // L'ECG se trace puis s'efface.
    const pouls = document.querySelector<SVGPathElement>('[data-pouls]');
    if (pouls) {
      const longueur = pouls.getTotalLength();
      gsap.set(pouls, { strokeDasharray: longueur, strokeDashoffset: longueur });
      gsap.to(pouls, {
        strokeDashoffset: -longueur,
        duration: 4,
        ease: 'power1.inOut',
        repeat: -1,
      });
    }
  });

  return (
    <section ref={ref} className="bg-canvas px-4 pb-20 pt-20 sm:px-8 sm:pb-24 sm:pt-24">
      <div className="mx-auto max-w-5xl">
        <p className="mb-3 font-mono text-xs tracking-widest text-primary">LE PROTOCOLE</p>
        <h2 className="mb-16 max-w-2xl font-headings text-3xl font-bold text-ink sm:text-4xl">
          Le chemin d’un franc
        </h2>

        {ETAPES.map((etape) => (
          <div
            key={etape.numero}
            data-carte-protocole
            className="sticky top-16 mb-8 grid min-h-[62dvh] items-center gap-8 rounded-[1.75rem] border border-white/8 bg-sidebar p-6 shadow-lg sm:mb-10 sm:min-h-[70dvh] sm:gap-10 sm:rounded-[2.5rem] sm:p-14 lg:grid-cols-2"
          >
            <div>
              <p className="mb-4 font-mono text-sm text-or">{etape.numero}</p>
              <h3 className="mb-5 font-headings text-4xl font-bold text-white sm:text-5xl">
                {etape.titre}
              </h3>
              <p className="max-w-md font-body text-base leading-relaxed text-white/60">
                {etape.detail}
              </p>
            </div>
            <div className="mx-auto h-56 w-full max-w-sm sm:h-72">
              {etape.animation === 'rosace' && (
                <Rosace petales={16} excentricite={0.5} animee className="h-full w-full text-or/70" />
              )}
              {etape.animation === 'balayage' && <Balayage />}
              {etape.animation === 'onde' && <OndePouls />}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
