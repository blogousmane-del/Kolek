import { PALIERS, PALIER_RECOMMANDE, formatMontant, palierParCle, type Palier } from '@kolek/core';
import { Icone, type NomIcone } from '@kolek/ui';
import { useState } from 'react';

/**
 * Page de tarifs publique — fusion des maquettes « Pricing » bureau et mobile.
 *
 * Les deux écrans Banani décrivaient la même page à deux largeurs. Les tenir
 * comme deux fichiers, c'est garantir qu'un prix corrigé d'un côté reste faux
 * de l'autre : une seule page, des points de rupture Tailwind.
 *
 * Les paliers viennent de `@kolek/core`, comme sur l'écran d'administration.
 *
 * ---
 *
 * AVERTISSEMENT — le tunnel de commande ne commande rien.
 *
 * Le formulaire ne s'envoie nulle part : il n'y a pas de backend public, et
 * surtout l'encaissement Mobile Money ne peut pas se brancher par une simple
 * saisie de numéro. Le cahier §11 est explicite : toute évolution Mobile Money
 * passe par un partenaire agréé. Les champs sont donc là pour la mise en page ;
 * la soumission est désactivée et le dit.
 */
const MODES_PAIEMENT: Array<{ libelle: string; icone: NomIcone }> = [
  { libelle: 'Orange Money', icone: 'smartphone' },
  { libelle: 'MTN MoMo', icone: 'smartphone' },
  { libelle: 'Virement', icone: 'landmark' },
];

const GARANTIES: Array<{ icone: NomIcone; texte: string }> = [
  { icone: 'shield-check', texte: 'Paiement sécurisé Orange Money' },
  { icone: 'refresh-cw', texte: 'Annulable à tout moment' },
  { icone: 'wifi-off', texte: 'Fonctionne hors-ligne dès activation' },
];

const CHAMPS_ORGANISATION = [
  { id: 'organisation', libelle: 'Nom de l’organisation', exemple: 'Ex : Épargne Adjamé', type: 'text' },
  { id: 'responsable', libelle: 'Responsable', exemple: 'Prénom et nom', type: 'text' },
  { id: 'email', libelle: 'Email', exemple: 'contact@organisation.ci', type: 'email' },
  { id: 'telephone', libelle: 'Téléphone', exemple: '+225 …', type: 'tel' },
] as const;

function ChampSombre({
  id,
  libelle,
  exemple,
  type,
  accentue = false,
}: {
  id: string;
  libelle: string;
  exemple: string;
  type: string;
  accentue?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-body font-semibold text-white/60 mb-2 block">
        {libelle}
      </label>
      <input
        id={id}
        type={type}
        placeholder={exemple}
        className={`w-full bg-white/5 rounded-md px-4 py-3 text-base font-body text-white placeholder:text-white/40 outline-none ${
          accentue ? 'border-2 border-positive' : 'border border-white/10'
        }`}
      />
    </div>
  );
}

function CartePalier({
  palier,
  recommande,
  choisi,
  onChoisir,
}: {
  palier: (typeof PALIERS)[number];
  recommande: boolean;
  choisi: boolean;
  onChoisir: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col rounded-xl overflow-hidden border ${
        recommande
          ? 'border-transparent ring-2 ring-positive bg-[image:var(--degrade-promo)]'
          : 'border-white/10 bg-white/4'
      } ${choisi && !recommande ? 'ring-2 ring-white/30' : ''}`}
    >
      {recommande && (
        <>
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-gradient-to-r from-chart-teal to-chart-mint" />
          <span className="absolute top-4 right-4 px-2.5 py-1 rounded-pill text-xs font-body font-bold bg-positive text-white">
            Recommandé
          </span>
        </>
      )}

      <div className="p-6 flex flex-col flex-1">
        <div className="mb-5">
          <span
            className="inline-block px-2.5 py-0.5 rounded-md text-xs font-body font-semibold mb-2"
            style={{ background: palier.fond, color: palier.texte }}
          >
            {palier.nom}
          </span>
          <p className="text-white/60 text-sm font-body leading-snug">{palier.accroche}</p>
        </div>

        <div className="mb-6 flex items-end gap-1.5">
          {palier.prix === 0 ? (
            <>
              <span className="font-headings font-bold text-white text-4xl leading-none">
                Gratuit
              </span>
              <span className="text-sm font-body font-medium text-white/50 pb-1">
                · {palier.periode}
              </span>
            </>
          ) : (
            <>
              <span className="font-headings font-bold text-white text-4xl leading-none tabular-nums">
                {formatMontant(palier.prix)}
              </span>
              <span className="text-sm font-body font-medium text-white/50 pb-1">
                FCFA / {palier.periode}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-col gap-2.5 flex-1 mb-6">
          {palier.fonctions.map((fonction) => (
            <div key={fonction.libelle} className="flex items-center gap-2.5">
              <span
                className={`w-4 h-4 rounded-pill flex items-center justify-center flex-shrink-0 ${
                  fonction.incluse ? 'bg-positive/20' : 'bg-white/5'
                }`}
              >
                <Icone
                  nom={fonction.incluse ? 'check' : 'x'}
                  taille={10}
                  className={fonction.incluse ? 'text-chart-mint' : 'text-white/20'}
                />
              </span>
              <span
                className={`text-sm font-body ${
                  fonction.incluse ? 'text-white/80' : 'text-white/25 line-through'
                }`}
              >
                {fonction.libelle}
              </span>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onChoisir}
          aria-pressed={choisi}
          className={`w-full rounded-pill py-3 text-base font-body font-semibold cursor-pointer ${
            palier.prix === 0
              ? 'border border-white/20 text-white/70'
              : recommande
                ? 'bg-positive text-white'
                : 'bg-white/10 text-white'
          }`}
        >
          {palier.prix === 0 ? 'Commencer gratuitement' : `Choisir ${palier.nom}`}
        </button>
      </div>
    </div>
  );
}

export function Tarifs() {
  const [choisi, setChoisi] = useState<Palier>(PALIER_RECOMMANDE);
  const palierChoisi = palierParCle(choisi);
  const incluses = palierChoisi.fonctions.filter((f) => f.incluse);

  return (
    <div className="min-h-dvh bg-dark-canvas font-body">
      {/* Navigation. Les liens de section disparaissent sous `md` : sur un
          téléphone, trois liens morts volent la place du seul bouton utile. */}
      <header className="flex items-center justify-between gap-4 px-5 md:px-16 py-4 md:py-5 border-b border-white/8 md:border-0">
        <a href="/" className="flex items-center gap-2 md:gap-3 flex-shrink-0">
          <span className="w-7 h-7 md:w-9 md:h-9 rounded-md bg-primary flex items-center justify-center">
            <span className="text-primary-foreground font-headings font-bold text-sm md:text-lg">
              K
            </span>
          </span>
          <span className="font-headings font-bold text-white text-lg md:text-xl tracking-tight">
            Kolek
          </span>
        </a>

        <nav className="hidden md:flex items-center gap-6">
          {['Fonctionnalités', 'Tarifs', 'Contact'].map((lien) => (
            <span key={lien} className="text-white/60 text-base font-body font-medium">
              {lien}
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden md:inline text-white/70 text-base font-body font-medium px-4 py-2">
            Se connecter
          </span>
          <button
            type="button"
            className="px-4 md:px-5 py-1.5 md:py-2.5 rounded-pill bg-primary text-primary-foreground text-xs md:text-base font-body font-semibold cursor-pointer"
          >
            Essai gratuit
          </button>
        </div>
      </header>

      {/* Accroche */}
      <section className="text-center px-5 md:px-16 pt-6 md:pt-12 pb-5 md:pb-10">
        <span className="inline-flex items-center gap-2 px-3 md:px-4 py-1 md:py-1.5 rounded-pill border border-white/10 bg-white/5 mb-3 md:mb-5">
          <span className="w-1.5 h-1.5 md:w-2 md:h-2 rounded-pill bg-chart-mint" />
          <span className="text-xs md:text-sm font-body font-medium text-white/70">
            Tarification simple et transparente
          </span>
        </span>
        <h1 className="font-headings font-bold text-white mb-2 md:mb-4 text-3xl md:text-[48px] leading-tight">
          Choisissez votre palier Kolek
        </h1>
        <p className="text-white/50 text-sm md:text-lg font-body max-w-xl mx-auto">
          Collecte journalière, FCFA, terrain. Un abonnement mensuel sans surprise, annulable à tout
          moment.
        </p>
      </section>

      {/* Paliers */}
      <section className="px-4 md:px-16 pb-6 md:pb-10">
        <div className="grid gap-3 md:gap-5 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 max-w-6xl mx-auto">
          {PALIERS.map((palier) => (
            <CartePalier
              key={palier.cle}
              palier={palier}
              recommande={palier.cle === PALIER_RECOMMANDE}
              choisi={palier.cle === choisi}
              onChoisir={() => setChoisi(palier.cle)}
            />
          ))}
        </div>
      </section>

      <div className="px-4 md:px-16 max-w-6xl mx-auto">
        <div className="border-t border-white/8 mb-6 md:mb-10" />
      </div>

      {/* Récapitulatif */}
      <section className="px-4 md:px-16 pb-16 max-w-6xl mx-auto">
        <h2 className="font-headings font-bold text-lg md:text-2xl text-white mb-4 md:mb-6">
          Récapitulatif de votre commande
        </h2>

        <div className="grid gap-4 md:gap-6 grid-cols-1 xl:grid-cols-[1fr_380px]">
          {/* Formulaire */}
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => e.preventDefault()}
            aria-describedby="avis-demonstration"
          >
            <div className="bg-white/5 rounded-xl border border-white/8 p-4 md:p-6 flex flex-col gap-4 md:gap-5">
              <h3 className="font-headings font-bold text-base md:text-lg text-white">
                Informations de l'organisation
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {CHAMPS_ORGANISATION.map((champ) => (
                  <ChampSombre key={champ.id} {...champ} />
                ))}
              </div>

              <div className="border-t border-white/8 pt-5">
                <h3 className="font-headings font-bold text-base md:text-lg text-white mb-4">
                  Paiement
                </h3>

                <p className="text-sm font-body font-semibold text-white/60 mb-2">
                  Mode de paiement
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
                  {MODES_PAIEMENT.map((mode, i) => (
                    <button
                      key={mode.libelle}
                      type="button"
                      aria-pressed={i === 0}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-md border text-sm font-body font-medium cursor-pointer ${
                        i === 0
                          ? 'border-positive bg-positive/10 text-positive'
                          : 'border-white/10 text-white/40'
                      }`}
                    >
                      <Icone nom={mode.icone} taille={14} />
                      {mode.libelle}
                    </button>
                  ))}
                </div>

                <ChampSombre
                  id="numero-orange-money"
                  libelle="Numéro Orange Money"
                  exemple="+225 07 …"
                  type="tel"
                  accentue
                />
              </div>
            </div>
          </form>

          {/* Commande */}
          <aside className="flex flex-col gap-4">
            <div className="rounded-xl border border-positive/30 p-4 md:p-5 bg-[image:var(--degrade-promo)]">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <span
                    className="px-2.5 py-0.5 rounded-md text-xs font-body font-semibold mb-2 inline-block"
                    style={{ background: palierChoisi.fond, color: palierChoisi.texte }}
                  >
                    Palier choisi
                  </span>
                  <p className="font-headings font-bold text-white text-xl md:text-2xl">
                    {palierChoisi.nom}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2 mb-4">
                {incluses.map((fonction) => (
                  <div key={fonction.libelle} className="flex items-center gap-2">
                    <Icone nom="check" taille={12} className="text-chart-mint flex-shrink-0" />
                    <span className="text-sm font-body text-white/70">{fonction.libelle}</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-body text-white/50">Abonnement mensuel</span>
                  <span className="text-base font-body font-semibold text-white tabular-nums">
                    {palierChoisi.prix === 0
                      ? 'Gratuit'
                      : `${formatMontant(palierChoisi.prix)} FCFA`}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-4">
                  <span className="text-sm font-body text-white/50">Premier mois</span>
                  <span className="text-sm font-body font-medium text-positive">
                    Offert (essai)
                  </span>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <span className="text-base font-body font-bold text-white">Aujourd'hui</span>
                  <span className="font-headings font-bold text-white text-xl tabular-nums">
                    0 FCFA
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-white/4 rounded-xl border border-white/8 p-4 flex flex-col gap-3">
              {GARANTIES.map((garantie) => (
                <div key={garantie.texte} className="flex items-center gap-3">
                  <span className="w-7 h-7 rounded-md bg-positive/10 flex items-center justify-center flex-shrink-0">
                    <Icone nom={garantie.icone} taille={14} className="text-positive" />
                  </span>
                  <span className="text-sm font-body text-white/60">{garantie.texte}</span>
                </div>
              ))}
            </div>

            <button
              type="button"
              disabled
              className="w-full rounded-pill bg-positive text-white font-headings font-bold text-base md:text-lg py-4 flex items-center justify-center gap-2 opacity-50 cursor-default"
            >
              <Icone nom="check-circle" taille={20} />
              Activer le palier {palierChoisi.nom}
            </button>
            <p id="avis-demonstration" className="text-center text-xs font-body text-white/30">
              Page de démonstration — aucun paiement n'est encaissé. L'encaissement Mobile Money
              passera par un partenaire agréé.
            </p>
          </aside>
        </div>
      </section>
    </div>
  );
}
