// Écran 2 du compagnon : l'encaissement en trois temps, dans le langage B.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { POLICES, STYLES, billet, ic, jauge, montant, onde, telephone } from './commun.mjs';

const SORTIE = process.argv[2];
if (!SORTIE) throw new Error('Usage : node encaisser.mjs <screen_dir>');

const PILE = `<style>
.kb .pile{min-height:100%;display:flex;flex-direction:column}
.kb .pile .pousse{flex:1;min-height:16px}
.kb .ecran.sans-marge{padding-bottom:16px}
</style>`;

const CARTES = [
  { nom: 'Mariam Traoré', marche: 'Adjamé', mise: 2000, faites: 29 },
  { nom: 'Aya Koffi', marche: 'Treichville', mise: 1000, faites: 27 },
  { nom: 'Adjoua N’Guessan', marche: 'Adjamé', mise: 5000, faites: 24 },
  { nom: 'Fatou Diabaté', marche: 'Abobo', mise: 500, faites: 22 },
  { nom: 'Salimata Ouattara', marche: 'Plateau', mise: 2000, faites: 19 },
  { nom: 'Bintou Coulibaly', marche: 'Adjamé', mise: 1000, faites: 17 },
  { nom: 'Akissi Kouassi', marche: 'Yopougon', mise: 3000, faites: 12 },
];

// ── 1 · Choisir la carte (l'onglet ne mène plus à une impasse) ─────────────
const un = telephone({
  actif: 'encaisser',
  statutSombre: true,
  contenu: `
  <header class="bande">${onde(10, 'onde')}
    <div class="bande-rang"><span class="bande-titre">Encaisser</span></div>
    <p class="bande-sous">Choisis la carte du client.</p>
  </header>
  <label class="recherche">${ic('recherche')}Nom, numéro ou marché…</label>
  <div class="section" style="padding-top:18px"><div class="section-tete"><h2 class="h2">Cartes actives</h2><span class="aide" style="margin:0"><span class="mono">38</span>, les plus avancées d’abord</span></div></div>
  <ul class="choix-liste">${CARTES.map(
    (c) => `<li><span class="c-nom">${c.nom} <span class="marche" style="font-weight:400;font-size:13px">${c.marche}</span></span>${ic('chevron', 'chev')}
      <span class="c-info"><span><span class="mono">${montant(c.mise)}</span>/j</span>${jauge(c.faites)}<span class="mono">${c.faites}/31</span></span></li>`,
  ).join('')}</ul>`,
});

// ── 2 · Confirmer : une carte, un montant, un bouton ───────────────────────
const deux = telephone({
  actif: 'encaisser',
  statutSombre: true,
  contenu: `<div class="pile">
  <header class="bande recouvre">${onde(10, 'onde')}
    <div class="bande-rang"><span class="rond">${ic('retour')}</span><span class="bande-titre">Encaisser une mise</span></div>
  </header>
  <div class="recouvre-carte">${billet({ ...CARTES[0], actions: false })}</div>
  <div class="pousse"></div>
  <section class="caisse">
    <div class="caisse-haut">
      <div><p class="etiquette">Mise du jour, case <span class="mono">30</span></p><p class="caisse-montant mono">${montant(2000)}<small>FCFA</small></p></div>
      <p class="caisse-apres">Solde après<br><span class="mono">${montant(58000)}</span> FCFA</p>
    </div>
    <span class="btn btn-plein btn-geant">${ic('billet')}Encaisser</span>
    <p class="note">Montant fixé à l’ouverture de la carte.</p>
  </section></div>`,
});

// ── 3 · Encaissé : la case se remplit, le tampon se pose ───────────────────
const trois = telephone({
  actif: 'encaisser',
  statutSombre: true,
  contenu: `<div class="pile">
  <header class="bande recouvre">${onde(10, 'onde')}
    <div class="bande-rang"><span class="rond">${ic('retour')}</span><span class="bande-titre">Encaisser une mise</span></div>
  </header>
  <div class="recouvre-carte">${billet({
    ...CARTES[0],
    faites: 30,
    neuve: 30,
    actions: false,
    tampon: '<div class="tampon-encaisse"><b>Encaissé</b><span>02.10 · 11:47</span></div>',
  })}</div>
  <p class="succes"><span class="ok">${ic('coche')}</span><span><b><span class="mono">${montant(2000)}</span> FCFA</b> pour Mariam Traoré, case <span class="mono">30</span>.<span class="sous">Envoyée à <span class="mono">11:47</span> · reçu n° <span class="mono">7F3A21C9</span></span></span></p>
  <div class="pousse"></div>
  <div class="duo"><span class="btn btn-plein">Client suivant</span><span class="btn btn-filet">Reçu</span></div></div>`,
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
  <h2>Encaisser, le geste qui fait vivre Kolek</h2>
  <p class="subtitle">Trois temps, deux touches : la ligne du client, puis « Encaisser ». La structure suit la version B que tu as retenue, avec la bande sombre et la carte posée dessus.</p>

  <div class="cards rangee">
    <div class="card choix" data-choice="1-choisir" onclick="toggleSelect(this)">${un}
      ${legende('Temps 1', 'Choisir la carte', 'Aujourd’hui, l’onglet « Encaisser » ouvert sans carte affiche « Aucune carte choisie » et renvoie vers Clients. Ici il ouvre directement la liste des cartes actives, recherche en tête.', [
        'Nom, marché, mise, avancement : tout ce qu’il faut pour reconnaître la bonne carte.',
        'Toute la ligne se touche, pas seulement un petit bouton.',
      ])}
    </div>
    <div class="card choix" data-choice="2-confirmer" onclick="toggleSelect(this)">${deux}
      ${legende('Temps 2', 'Confirmer', 'Le nom et le montant apparaissaient trois fois (bloc client, carte, encadré « Montant de la mise »). Il reste une carte, un montant, un bouton.', [
        'La prochaine case est cerclée : on voit où tombe la mise.',
        '« Solde après » : ce que le client aura, calculé par le moteur.',
        'Le bouton descend sous le pouce, en bas de l’écran.',
      ])}
    </div>
    <div class="card choix" data-choice="3-encaisse" onclick="toggleSelect(this)">${trois}
      ${legende('Temps 3', 'Encaissé', 'Le succès se lit sur la carte elle-même : la case 30 se remplit et un tampon vient s’y poser, avec la date et l’heure. Le bandeau vert à coche disparaît.', [
        '« Client suivant » ramène à la liste, recherche vidée : la boucle de la tournée.',
        '« Reçu » ouvre les reçus de ce client.',
      ])}
      <div class="legende" style="margin-top:10px"><p class="lettre">Hors ligne, même geste</p>
        <div class="tampon-encaisse garde tampon-seul"><b>Gardée</b><span>02.10 · 11:47</span></div>
        <p style="margin-top:6px">Le tampon passe en bleu « information » et la ligne dit : « Gardée sur ce téléphone. Partira avec le réseau. »</p>
      </div>
    </div>
  </div>
</div>`;

writeFileSync(join(SORTIE, 'encaisser-trois-temps.html'), html);
console.log('écrit :', join(SORTIE, 'encaisser-trois-temps.html'), `${(html.length / 1024).toFixed(1)} ko`);
