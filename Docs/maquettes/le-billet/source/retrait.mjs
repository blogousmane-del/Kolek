// Écran 3 du compagnon : le retrait, liste compacte, décompte, clôture.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NNBSP, POLICES, STYLES, billet, ic, montant, telephone } from './commun.mjs';

const SORTIE = process.argv[2];
if (!SORTIE) throw new Error('Usage : node retrait.mjs <screen_dir>');

const PILE = `<style>
.kb .pile{min-height:100%;display:flex;flex-direction:column}
.kb .pile .pousse{flex:1;min-height:16px}
</style>`;

const restituable = (faites, mise) => Math.max(faites - 1, 0) * mise;
const TERMINEES = [
  { nom: 'Rokia Sangaré', mise: 1000, faites: 31 },
  { nom: 'Awa Bamba', mise: 2000, faites: 31 },
  { nom: 'Kadiatou Cissé', mise: 500, faites: 31 },
];
const EN_COURS = [
  { nom: 'Mariam Traoré', mise: 2000, faites: 29 },
  { nom: 'Aya Koffi', mise: 1000, faites: 27 },
  { nom: 'Adjoua N’Guessan', mise: 5000, faites: 24 },
  { nom: 'Fatou Diabaté', mise: 500, faites: 22 },
  { nom: 'Salimata Ouattara', mise: 2000, faites: 19 },
  { nom: 'Bintou Coulibaly', mise: 1000, faites: 17 },
];

const ligne = (c, { fini = false, ouvert = false } = {}) => `
  <li class="${fini ? 'fini' : ''}${ouvert ? ' r-ouvert' : ''}">
    <div class="r-ligne">
      <span class="r-nom">${c.nom}</span>
      <span class="r-montant mono">${montant(restituable(c.faites, c.mise))}<small>FCFA</small></span>
      <span class="r-info"><span class="mono">${c.faites}/31</span> · <span class="mono">${montant(c.mise)}</span>/j</span>
      <span class="r-etiq">à rendre</span>
    </div>
    ${
      ouvert
        ? `<div class="r-detail">${c.faites} mises encaissées, moins la première, qui est ta commission (<span class="mono">${montant(c.mise)}</span> FCFA).</div>
    <div class="r-actions"><span class="btn btn-plein btn-moyen">Faire le retrait</span><span class="btn btn-filet btn-moyen">Nouvelle carte</span></div>`
        : ''
    }
  </li>`;

const entete = (titre, sous) => `<header class="entete"><span class="rond clair">${ic('retour')}</span><div><p class="entete-titre">${titre}</p><p class="entete-sous">${sous}</p></div></header>`;

const liste = (ouvrir) => `
  ${entete('Retrait', 'Clôturer une carte et rendre le solde')}
  <label class="recherche" style="margin-top:12px">${ic('recherche')}Nom du client…</label>
  <div class="segments"><span class="actif">Toutes <span class="mono">38</span></span><span>Terminées <span class="mono">3</span></span><span>En cours <span class="mono">35</span></span></div>
  <p class="r-groupe"><span>Cycle terminé</span><span class="mono" style="font-weight:500">3</span></p>
  <ul class="r-liste">${TERMINEES.map((c, i) => ligne(c, { fini: true, ouvert: ouvrir && i === 0 })).join('')}</ul>
  <p class="r-groupe"><span>En cours</span><span class="mono" style="font-weight:500">35</span></p>
  <ul class="r-liste">${EN_COURS.map((c) => ligne(c)).join('')}</ul>`;

// ── 1 · La liste, une ligne dépliée ─────────────────────────────────────────
const un = telephone({ actif: 'accueil', heure: '14:05', contenu: liste(true) });

// ── 2 · Le décompte, avant le geste qui ne se défait pas ────────────────────
const r = TERMINEES[0];
const aRendre = restituable(r.faites, r.mise);
const deux = telephone({
  actif: 'accueil',
  heure: '14:05',
  contenu: liste(false),
  calque: `<div class="voile"></div>
  <div class="feuille">
    <div class="poignee"></div>
    <p class="feuille-titre">Rendre <span class="mono" style="font-weight:600">${montant(aRendre)}</span> FCFA à ${r.nom}&#8239;?</p>
    <dl class="releve decompte">
      <div class="ligne"><dt><span class="mono">31</span> mises × <span class="mono">${montant(r.mise)}</span></dt><span class="points"></span><dd class="mono">${montant(31 * r.mise)}</dd></div>
      <div class="ligne"><dt>Ta commission, case 1</dt><span class="points"></span><dd class="mono">−${NNBSP}${montant(r.mise)}</dd></div>
      <div class="ligne total"><dt>À rendre</dt><span class="points" style="border:0"></span><dd class="mono">${montant(aRendre)}<small>FCFA</small></dd></div>
    </dl>
    <p class="avertir">La carte se clôture. C’est définitif : le retrait ne pourra pas être défait.</p>
    <div class="pile-boutons"><span class="btn btn-plein btn-geant" style="margin-top:0">Oui, rendre <span class="mono">${montant(aRendre)}</span> FCFA</span><span class="btn btn-filet">Annuler</span></div>
  </div>`,
});

// ── 3 · Clôturée : le tampon, et ce qu'il reste à faire de la main ─────────
const trois = telephone({
  actif: 'accueil',
  heure: '14:05',
  contenu: `<div class="pile">
  ${entete('Retrait', 'Carte clôturée')}
  <div style="margin:12px 16px 0">${billet({
    ...r,
    actions: false,
    etiquette: 'Rendu au client',
    tampon: '<div class="tampon-encaisse"><b>Clôturée</b><span>02.10 · 14:05</span></div>',
  })}</div>
  <div class="remise">
    <p class="remise-titre">Remets <span class="mono">${montant(aRendre)}</span> FCFA à ${r.nom}, en main propre.</p>
    <p class="sous">Le retrait est inscrit au journal. Il ne peut plus être défait.</p>
  </div>
  <div class="pousse"></div>
  <div class="duo"><span class="btn btn-plein">Retour aux cartes</span><span class="btn btn-filet">Nouvelle carte</span></div></div>`,
});

const legende = (lettre, titre, texte, points = []) => `
  <div class="legende">
    <p class="lettre">${lettre}</p>
    <h3>${titre}</h3>
    <p>${texte}</p>
    ${points.length ? `<ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
  </div>`;

const html = `${POLICES}${STYLES}${PILE}
<div class="kb">
  <h2>Retrait : rendre le solde, sans se tromper</h2>
  <p class="subtitle">Ta capture montrait des cartes de 240 px, la même phrase répétée sur chacune, et des cartes à 0 FCFA aussi grosses que celles à rendre. Ici : une ligne par carte, le détail quand on le demande, et un décompte avant le geste qui ne se défait pas.</p>

  <div class="cards rangee">
    <div class="card choix" data-choice="1-liste" onclick="toggleSelect(this)">${un}
      ${legende('Temps 1', 'La liste', 'Une ligne par carte : nom, avancement, mise, et le montant à rendre aligné à droite. Neuf cartes à l’écran au lieu de trois.', [
        'Les cycles terminés passent devant, marqués d’un trait vert.',
        'Les filtres deviennent trois segments qui disent leur compte.',
        'Toucher une ligne la déplie : l’explication de la commission et les deux gestes.',
      ])}
    </div>
    <div class="card choix" data-choice="2-decompte" onclick="toggleSelect(this)">${deux}
      ${legende('Temps 2', 'Le décompte', 'La confirmation devient un vrai décompte de caisse : les mises, la commission, le total sous un double trait. Le collecteur peut le lire au client avant de payer.', [
        'Le bouton répète le montant : on sait ce qu’on confirme.',
        'Hors ligne, rien ne change ici : le retrait demande toujours le réseau.',
      ])}
    </div>
    <div class="card choix" data-choice="3-cloturee" onclick="toggleSelect(this)">${trois}
      ${legende('Temps 3', 'Clôturée', 'Le même tampon que l’encaissement, « Clôturée », sur la carte pleine. La phrase dit ce qu’il reste à faire de la main : remettre l’argent.', [
        '« Nouvelle carte » rouvre un cycle pour le même client, mise reprise : aujourd’hui ce bouton n’existe qu’avant le retrait.',
      ])}
    </div>
  </div>
</div>`;

writeFileSync(join(SORTIE, 'retrait-trois-temps.html'), html);
console.log('écrit :', join(SORTIE, 'retrait-trois-temps.html'), `${(html.length / 1024).toFixed(1)} ko`);
