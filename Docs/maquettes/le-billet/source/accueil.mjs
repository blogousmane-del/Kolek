// Écran 1 du compagnon : l'accueil du collecteur, trois structures, un même langage.
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NNBSP, POLICES, PIECE, STYLES, billet, ic, jauge, montant, onde, rosace, telephone } from './commun.mjs';

const SORTIE = process.argv[2];
if (!SORTIE) throw new Error('Usage : node accueil.mjs <screen_dir>');

const fcfa = (n) => `${montant(n)}`;
const CARTES = [
  { nom: 'Mariam Traoré', mise: 2000, faites: 29 },
  { nom: 'Aya Koffi', mise: 1000, faites: 27 },
  { nom: 'Adjoua N’Guessan', mise: 5000, faites: 24 },
  { nom: 'Fatou Diabaté', mise: 500, faites: 22 },
  { nom: 'Salimata Ouattara', mise: 2000, faites: 19 },
  { nom: 'Bintou Coulibaly', mise: 1000, faites: 17 },
];

const registre = (lignes) =>
  `<ul class="liste">${lignes
    .map(([icone, titre, aide]) => `<li><span class="tampon">${ic(icone)}</span><span class="txt"><b>${titre}</b><span>${aide}</span></span>${ic('chevron', 'chev')}</li>`)
    .join('')}</ul>`;

// ── A · Le coupon ───────────────────────────────────────────────────────────
const a = telephone({
  contenu: `
  <div class="c-tete" style="padding-top:12px">${PIECE}<span class="qui"></span><span class="avatar">AK</span></div>
  <div style="padding:14px 16px 0"><p class="date">Vendredi 2 octobre</p><h1 class="h1" style="margin-top:2px">Awa Koné</h1></div>
  <section class="coupon">${rosace(22, 0.38, 'rosace')}
    <div class="coupon-haut"><span>Encaissé aujourd’hui</span><span class="envoi"><i></i>Tout est envoyé</span></div>
    <p class="montant">${fcfa(47500)}<small>FCFA</small></p>
    <p class="coupon-detail"><span class="mono">23</span> mises · dernière à <span class="mono">11:42</span></p>
    ${onde(10, 'onde')}
  </section>
  <section class="section" style="padding-top:22px">
    <div class="section-tete"><h2 class="h2">À finir en premier</h2><span class="lien">Toutes les cartes</span></div>
    <p class="aide">La plus avancée de tes 38 cartes actives.</p>
    ${billet(CARTES[0])}
  </section>
  <section class="section">
    <h2 class="h2">Relevé</h2>
    <dl class="releve">
      <div class="ligne"><dt>Clients</dt><span class="points"></span><dd class="mono">41</dd></div>
      <div class="ligne"><dt>Cartes actives</dt><span class="points"></span><dd class="mono">38</dd></div>
      <div class="ligne"><dt>Encours</dt><span class="points"></span><dd class="mono">${fcfa(1284000)}<small>FCFA</small></dd></div>
    </dl>
  </section>
  <section class="section">
    <h2 class="h2">Registre</h2>
    <p class="groupe">Caisse</p>
    ${registre([
      ['balance', 'Rapprochement du soir', 'Compter la caisse et clore la journée'],
      ['recus', 'Reçus', 'Chaque mise encaissée, jour par jour'],
    ])}
    <p class="groupe">Clients</p>
    ${registre([
      ['souscrire', 'Souscrire', 'Ouvrir la carte d’un nouveau client'],
      ['retrait', 'Retrait', 'Rendre le solde d’une carte terminée'],
      ['equipe', 'Équipe', 'Tes collecteurs et leurs clients'],
    ])}
    <p class="groupe">Messages et compte</p>
    ${registre([
      ['alertes', 'Alertes', 'Opérations refusées, rappels'],
      ['avis', 'Avis', 'Écrire à l’équipe Kolek'],
      ['plus', 'Plus', 'Abonnement, conditions, aide'],
    ])}
  </section>`,
});

// ── B · Le billet plein ─────────────────────────────────────────────────────
const b = telephone({
  statutSombre: true,
  contenu: `
  <header class="b-tete">${rosace(22, 0.38, 'rosace')}${onde(10, 'onde')}
    <div class="b-rang"><span class="b-nom">Awa Koné</span><span class="avatar clair">AK</span></div>
    <p class="b-etiq">Encaissé aujourd’hui · <span class="mono">23</span> mises</p>
    <p class="montant" style="margin-top:8px">${fcfa(47500)}<small>FCFA</small></p>
    <div class="b-chiffres">
      <div><b class="mono">41</b><span>Clients</span></div>
      <div><b class="mono">38</b><span>Cartes actives</span></div>
      <div><b class="mono">${fcfa(1284000)}</b><span>Encours, FCFA</span></div>
    </div>
  </header>
  <div class="b-carte">${billet(CARTES[0])}</div>
  <section class="section">
    <div class="section-tete"><h2 class="h2">Outils</h2></div>
    <div class="grille">
      <span class="outil">${ic('souscrire')}Souscrire</span>
      <span class="outil">${ic('retrait')}Retrait</span>
      <span class="outil">${ic('balance')}Rapprochement</span>
      <span class="outil">${ic('recus')}Reçus</span>
      <span class="outil">${ic('alertes')}Alertes</span>
      <span class="outil">${ic('avis')}Avis</span>
      <span class="outil">${ic('equipe')}Équipe</span>
      <span class="outil">${ic('plus')}Plus</span>
    </div>
  </section>`,
});

// ── C · La tournée ──────────────────────────────────────────────────────────
const lignesTournee = CARTES.map(
  (c) => `<li><span class="c-nom">${c.nom}</span><span class="btn-mini">Encaisser</span>
    <span class="c-info"><span><span class="mono">${montant(c.mise)}</span>/j</span>${jauge(c.faites)}<span class="mono">${c.faites}/31</span></span></li>`,
).join('');
const c = telephone({
  contenu: `
  <div class="c-tete" style="padding-top:12px">${PIECE}<span class="qui">Awa Koné</span><span class="avatar">AK</span></div>
  <section class="c-jour">
    <p class="date">Vendredi 2 octobre · encaissé aujourd’hui</p>
    <p class="c-total">${fcfa(47500)}<small>FCFA</small></p>
    <p class="c-sous"><i></i><span><span class="mono">23</span> mises · tout est envoyé</span></p>
    ${onde(8, 'onde')}
  </section>
  <label class="recherche">${ic('recherche')}Chercher un client</label>
  <section class="section" style="padding-top:20px">
    <div class="section-tete"><h2 class="h2">Cartes actives</h2><span class="aide" style="margin:0"><span class="mono">38</span>, les plus avancées d’abord</span></div>
    <ul class="c-liste">${lignesTournee}</ul>
    <p style="margin-top:14px"><span class="lien">Voir les 38 cartes</span></p>
  </section>`,
});

const legende = (lettre, reco, titre, pitch, points, prix) => `
  <div class="legende">
    <p class="lettre${reco ? ' reco' : ''}">${lettre}${reco ? ' · recommandée' : ''}</p>
    <h3>${titre}</h3>
    <p>${pitch}</p>
    <ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul>
    <p class="prix"><b>Ce que ça coûte :</b> ${prix}</p>
  </div>`;

const pastille = (couleur, nom, valeur) => `<div class="pastille"><i style="background:${couleur}"></i><b>${nom}</b><span>${valeur}</span></div>`;

const html = `${POLICES}${STYLES}
<div class="kb">
  <h2>L’accueil du collecteur, trois façons de le construire</h2>
  <p class="subtitle">Même langage pour les trois : vert coffre, gravure de billet, chiffres de caisse. Seul l’ordre des choses change. Fais défiler dans chaque téléphone, puis clique celui qui sert le mieux la tournée.</p>

  <div class="cards rangee">
    <div class="card choix" data-choice="a-coupon" onclick="toggleSelect(this)">${a}
      ${legende('A', true, 'Le coupon', 'Le total du jour devient un coupon de billet, la carte à finir vient juste dessous, et les neuf tuiles deviennent un registre.', [
        'Un seul aplat vert foncé dans l’écran : le coupon. Cadre fin, gravure, rien d’autre.',
        'Ce qu’on fait avant ce qu’on a fait : la carte et son bouton passent avant les chiffres.',
        'Les chiffres de référence en relevé à points de conduite, comme un carnet.',
        'Le registre range en trois rubriques ; chaque ligne garde son icône et dit à quoi elle sert.',
      ], 'l’écran est plus long ; le registre se lit au lieu de se reconnaître d’un coup d’œil.')}
    </div>
    <div class="card choix" data-choice="b-billet-plein" onclick="toggleSelect(this)">${b}
      ${legende('B', false, 'Le billet plein', 'L’en-tête sombre de la vitrine, pleine largeur, porte le total et les trois chiffres ; la carte vient se poser dessus.', [
        'La structure d’aujourd’hui, gardée telle quelle : rien à réapprendre.',
        'Les tuiles pastel deviennent des boutons neutres sur deux colonnes.',
      ], 'c’est l’écran actuel, mieux habillé. Le moins de rupture, et le moins de gain.')}
    </div>
    <div class="card choix" data-choice="c-tournee" onclick="toggleSelect(this)">${c}
      ${legende('C', false, 'La tournée', 'L’accueil devient la liste de travail : chercher un client, encaisser depuis sa ligne.', [
        'Le total tient en une ligne ; la gravure passe en filet sous le chiffre.',
        'Les autres écrans partent dans « Plus ».',
      ], 'le plus gros changement. L’accueil lit les cartes actives (une lecture de plus) et fait doublon avec l’écran Clients.')}
    </div>
  </div>

  <div class="planche">
    <div>
      <h3>Couleurs</h3>
      <div class="pastilles">
        ${pastille('#14402C', 'Vert coffre', '#14402C')}
        ${pastille('#0E2E1F', 'Nuit', '#0E2E1F')}
        ${pastille('#171A17', 'Encre', '#171A17')}
        ${pastille('#666B64', 'Encre douce', '#666B64')}
        ${pastille('#F4F5F2', 'Toile', '#F4F5F2')}
        ${pastille('#FFFFFF', 'Papier', '#FFFFFF')}
        ${pastille('#E3E5E0', 'Filet', '#E3E5E0')}
        ${pastille('#D2B24C', 'Or', 'marque seulement')}
      </div>
      <p class="role" style="font-size:.8rem;color:var(--text-secondary);margin-top:12px">L’or ne touche jamais un montant : la pièce du logo et la gravure, rien d’autre. Rouge, bleu et vert clair restent pour dire un état (erreur, information, envoyé), jamais pour décorer.</p>
    </div>
    <div class="specimen">
      <h3>Trois familles, trois métiers</h3>
      <p style="font-family:'Bricolage Grotesque';font-weight:700;font-size:1.6rem;letter-spacing:-.02em">À finir en premier</p>
      <p class="role">Bricolage Grotesque · titres et total du jour</p>
      <p style="font-family:'Instrument Sans';font-size:1rem">Ouvrir la carte d’un nouveau client</p>
      <p class="role">Instrument Sans · texte, boutons, libellés</p>
      <p style="font-family:'IBM Plex Mono';font-weight:500;font-size:1.25rem">56${NNBSP}000 FCFA · 29/31</p>
      <p class="role">IBM Plex Mono · tout montant qu’on compte : soldes, mises, reçus</p>
    </div>
    <div>
      <h3>Ce qui part</h3>
      <ul>
        <li>Les neuf tuiles pastel et leurs quatre familles de couleur</li>
        <li>L’icône « $ » : on compte en FCFA, l’icône devient un billet</li>
        <li>Le bouton rond qui flotte au-dessus de la barre</li>
        <li>Le verre dépoli et le dégradé pastel de la carte de collecte</li>
        <li>Les trois chiffres dans trois cases égales</li>
        <li>La rosace qui tourne sans rien dire</li>
      </ul>
      <h3 style="margin-top:14px">Ce qui reste</h3>
      <ul>
        <li>La carte de 31 cases, au centre de tout</li>
        <li>Le bandeau hors ligne et la file d’envoi</li>
        <li>Des cibles tactiles de 44 px et plus, du texte lisible au soleil</li>
      </ul>
    </div>
  </div>
</div>`;

writeFileSync(join(SORTIE, 'accueil-structures.html'), html);
console.log('écrit :', join(SORTIE, 'accueil-structures.html'), `${(html.length / 1024).toFixed(1)} ko`);
