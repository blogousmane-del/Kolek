// Briques communes des maquettes « Le billet » : gravures, icônes, téléphone, styles.
// Les gravures reprennent exactement le tracé de packages/ui/src/Guilloche.tsx.

export const NNBSP = ' '; // espace fine insécable, celle d'Intl fr-FR
export const montant = (n) => new Intl.NumberFormat('fr-FR').format(n);

export function rosace(petales, excentricite, classe) {
  let s = `<svg class="gravure ${classe}" viewBox="-100 -100 200 200" aria-hidden="true">`;
  for (let i = 0; i < petales; i += 1) {
    s += `<ellipse rx="92" ry="${(92 * excentricite).toFixed(1)}" transform="rotate(${((i * 180) / petales).toFixed(2)})"/>`;
  }
  return `${s}<circle r="92"/></svg>`;
}

export function onde(lignes, classe) {
  let s = `<svg class="gravure ${classe}" viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden="true">`;
  for (let i = 0; i < lignes; i += 1) {
    const phase = (i / lignes) * Math.PI;
    const amplitude = 12 + 10 * Math.sin(phase);
    const d = Array.from({ length: 81 }, (_, x) => {
      const y = 50 + amplitude * Math.sin(x / 4.8 + phase * 2);
      return `${x === 0 ? 'M' : 'L'}${(x * 12.5).toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    s += `<path d="${d}"/>`;
  }
  return `${s}</svg>`;
}

const TRACES = {
  accueil: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  clients: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  billet: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  bilans: '<line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/>',
  profil: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  recherche: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  recus: '<path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z"/><path d="M14 8H8"/><path d="M16 12H8"/><path d="M13 16H8"/>',
  balance: '<path d="m16 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="m2 16 3-8 3 8c-.87.65-1.92 1-3 1s-2.13-.35-3-1Z"/><path d="M7 21h10"/><path d="M12 3v18"/><path d="M3 7h2c2 0 5-1 7-2 2 1 5 2 7 2h2"/>',
  souscrire: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/>',
  retrait: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
  alertes: '<path d="M10.268 21a2 2 0 0 0 3.464 0"/><path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"/>',
  avis: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
  equipe: '<path d="M18 21a8 8 0 0 0-16 0"/><circle cx="10" cy="8" r="5"/><path d="M22 20c0-3.37-2-6.5-4-8a5 5 0 0 0-.45-8.3"/>',
  plus: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  retour: '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
  coche: '<path d="M20 6 9 17l-5-5"/>',
  nuage: '<path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z"/>',
  imprimer: '<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/>',
  partager: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" x2="15.42" y1="13.51" y2="17.49"/><line x1="15.41" x2="8.59" y1="6.51" y2="10.49"/>',
  filtre: '<path d="M3 6h18"/><path d="M7 12h10"/><path d="M10 18h4"/>',
};
export const ic = (nom, classe = '') => `<svg class="ic ${classe}" viewBox="0 0 24 24" aria-hidden="true">${TRACES[nom]}</svg>`;

export const PIECE = '<svg class="piece" viewBox="0 0 100 100" aria-label="Kolek"><circle cx="50" cy="50" r="50" fill="#D2B24C"/><path d="M32 22 V78" stroke="#0E2A1E" stroke-width="12" stroke-linecap="round" fill="none"/><path d="M74 22 L44 50 L74 78" fill="none" stroke="#0E2A1E" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>';

const STATUT_IC = '<span class="statut-ic"><svg viewBox="0 0 18 12" width="17" height="11"><rect x="0" y="8" width="3" height="4" rx=".6"/><rect x="5" y="5.5" width="3" height="6.5" rx=".6"/><rect x="10" y="3" width="3" height="9" rx=".6"/><rect x="15" y="0" width="3" height="12" rx=".6"/></svg><svg viewBox="0 0 26 12" width="24" height="11"><rect x=".5" y=".5" width="22" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="8" rx="1.6"/><rect x="23.5" y="4" width="2" height="4" rx="1" opacity=".45"/></svg></span>';

export function nav(actif) {
  const o = (cle, libelle, icone) =>
    `<span class="onglet${actif === cle ? ' actif' : ''}">${ic(icone)}<span>${libelle}</span></span>`;
  return `<nav class="nav">${o('accueil', 'Accueil', 'accueil')}${o('clients', 'Clients', 'clients')}<span class="touche${actif === 'encaisser' ? ' actif' : ''}">${ic('billet')}<span>Encaisser</span></span>${o('bilans', 'Bilans', 'bilans')}${o('profil', 'Profil', 'profil')}</nav>`;
}

export function telephone({ contenu, actif = 'accueil', statutSombre = false, sansNav = false, calque = '', heure = '11:47' }) {
  return `<div class="tel"><div class="statut${statutSombre ? ' sombre' : ''}"><span>${heure}</span>${STATUT_IC}</div><div class="ecran">${contenu}</div>${sansNav ? '' : nav(actif)}${calque}</div>`;
}

/** Les 31 cases : payées, la prochaine, celles à venir. */
export function cases(faites, total = 31, neuve = 0) {
  return `<div class="cases">${Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const etat = n === neuve ? ' payee neuve' : n <= faites ? ' payee' : n === faites + 1 ? ' prochaine' : '';
    return `<span class="case${etat}"></span>`;
  }).join('')}</div>`;
}

export function jauge(faites, total = 31) {
  return `<span class="jauge">${Array.from({ length: total }, (_, i) => `<i${i < faites ? ' class="p"' : ''}></i>`).join('')}</span>`;
}

/** La carte de collecte, version billet. */
export function billet({ nom, mise, faites, actions = true, serie = 'Cycle 1', neuve = 0, tampon = '', etiquette = 'Solde restituable' }) {
  const solde = (faites - 1) * mise;
  return `<article class="billet">${onde(7, 'onde-fine')}${tampon}
    <div class="billet-tete"><div><p class="nom">${nom}</p><p class="mise"><span class="mono">${montant(mise)}</span> FCFA par jour</p></div><span class="serie">${serie}</span></div>
    ${cases(faites, 31, neuve)}
    <div class="billet-pied"><div><p class="etiquette">${etiquette}</p><p class="solde mono">${montant(solde)}<small>FCFA</small></p></div><p class="compte mono">${faites}<span>/31</span></p></div>
    ${actions ? `<div class="actions"><span class="btn btn-plein">${ic('billet')}Encaisser <span class="mono">${montant(mise)}</span></span><span class="btn btn-filet">Fiche</span></div>` : ''}
  </article>`;
}

export const POLICES = '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400..800&family=IBM+Plex+Mono:wght@400;500;600&family=Instrument+Sans:wght@400..700&display=swap" rel="stylesheet">';

export const STYLES = `<style>
.kb{--coffre:#14402C;--nuit:#0E2E1F;--ink:#171A17;--muet:#666B64;--toile:#F4F5F2;--papier:#FFFFFF;--filet:#E3E5E0;--trait:#D5D8D1;--pointille:#C3C8C0;--or:#D2B24C;--marqueur:#8ED9B0;--positif:#1C7A4B;--negatif:#A8452F;--info:#3D6E8E}
.kb .rangee{display:flex!important;flex-wrap:wrap;gap:28px;align-items:flex-start;margin-top:8px}
.kb .card.choix{width:396px;padding:18px;cursor:pointer}
.kb .card.choix:hover{transform:none}
.kb .tel,.kb .tel *{box-sizing:border-box;margin:0;padding:0}
.kb .tel{width:360px;height:760px;border-radius:34px;background:var(--toile);box-shadow:0 0 0 1px rgba(23,26,23,.16),0 26px 50px -26px rgba(14,46,31,.55);overflow:hidden;display:flex;flex-direction:column;font-family:'Instrument Sans',system-ui,sans-serif;color:var(--ink);font-size:15px;line-height:1.4;-webkit-font-smoothing:antialiased;margin:0 auto;position:relative;text-align:left}
.kb .statut{height:30px;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;padding:0 24px;font-weight:600;font-size:12.5px;color:var(--ink);background:var(--toile)}
.kb .statut.sombre{background:var(--nuit);color:#fff}
.kb .statut.blanc{background:var(--papier)}
.kb .statut-ic{display:flex;gap:5px;align-items:center}
.kb .statut-ic svg{fill:currentColor}
.kb .ecran{flex:1;overflow-y:auto;scrollbar-width:none;padding-bottom:20px}
.kb .ecran::-webkit-scrollbar{display:none}
.kb svg.ic{fill:none;stroke:currentColor;stroke-width:1.75;stroke-linecap:round;stroke-linejoin:round;width:20px;height:20px;flex-shrink:0}
.kb svg.gravure{display:block}
.kb svg.gravure ellipse,.kb svg.gravure circle,.kb svg.gravure path{fill:none;stroke:currentColor;stroke-width:.5;vector-effect:non-scaling-stroke}
.kb .mono{font-family:'IBM Plex Mono',ui-monospace,monospace;font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.kb .piece{width:26px;height:26px;display:block;flex-shrink:0}
.kb .avatar{width:34px;height:34px;border-radius:999px;background:var(--coffre);color:#fff;font-weight:600;font-size:12.5px;display:flex;align-items:center;justify-content:center;letter-spacing:.03em;flex-shrink:0}
.kb .nav{flex-shrink:0;height:66px;padding:0 4px;background:var(--papier);border-top:1px solid var(--filet);display:grid;grid-template-columns:repeat(5,1fr);align-items:stretch}
.kb .onglet{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;font-size:11px;font-weight:500;color:var(--muet);position:relative}
.kb .onglet svg.ic{width:22px;height:22px}
.kb .onglet.actif{color:var(--coffre);font-weight:600}
.kb .onglet.actif::before{content:'';position:absolute;top:0;left:50%;width:22px;margin-left:-11px;height:2px;border-radius:0 0 2px 2px;background:var(--coffre)}
.kb .touche{align-self:center;justify-self:center;width:66px;height:50px;border-radius:10px;background:var(--coffre);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;font-size:10.5px;font-weight:600;box-shadow:inset 0 1px 0 rgba(255,255,255,.1),0 6px 14px -8px rgba(14,46,31,.8)}
.kb .touche svg.ic{width:20px;height:20px}
.kb .h1{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:26px;line-height:1.1;letter-spacing:-.02em}
.kb .h2{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:18px;line-height:1.2;letter-spacing:-.01em}
.kb .date{font-size:13px;color:var(--muet)}
.kb .section{padding:24px 16px 0}
.kb .section-tete{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.kb .lien{font-size:13px;font-weight:600;color:var(--coffre);text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1px;white-space:nowrap}
.kb .aide{font-size:13px;color:var(--muet);margin-top:3px}
/* Le coupon : le total du jour. */
.kb .coupon{position:relative;margin:16px 16px 0;padding:18px 18px 38px;border-radius:12px;background:linear-gradient(160deg,var(--nuit) 0%,var(--coffre) 100%);color:#fff;overflow:hidden}
.kb .coupon::after{content:'';position:absolute;inset:6px;border:1px solid rgba(210,178,76,.3);border-radius:8px;pointer-events:none}
.kb .coupon .rosace{position:absolute;right:-78px;top:-64px;width:236px;color:rgba(210,178,76,.17)}
.kb .coupon .onde{position:absolute;left:7px;right:7px;bottom:10px;height:24px;width:calc(100% - 14px);color:rgba(210,178,76,.34)}
.kb .coupon-haut{position:relative;display:flex;justify-content:space-between;align-items:center;font-size:13px;color:rgba(255,255,255,.74)}
.kb .envoi{display:inline-flex;align-items:center;gap:6px;font-size:12px}
.kb .envoi i{width:7px;height:7px;border-radius:999px;background:var(--marqueur)}
.kb .montant{position:relative;font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:46px;line-height:1;letter-spacing:-.03em;margin-top:12px;font-variant-numeric:tabular-nums}
.kb .montant small{font-family:'Instrument Sans',sans-serif;font-size:15px;font-weight:500;letter-spacing:0;color:rgba(255,255,255,.74);margin-left:6px}
.kb .coupon-detail{position:relative;margin-top:10px;font-size:12px;color:rgba(255,255,255,.64)}
/* La carte de collecte, en billet. */
.kb .billet{position:relative;margin-top:12px;background:var(--papier);border:1px solid var(--filet);border-radius:12px;padding:18px 16px 16px;overflow:hidden}
.kb .billet .onde-fine{position:absolute;left:0;top:0;height:9px;width:100%;color:rgba(20,64,44,.3)}
.kb .billet-tete{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.kb .nom{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:19px;letter-spacing:-.01em;line-height:1.15}
.kb .mise{font-size:12.5px;color:var(--muet);margin-top:4px}
.kb .mise .mono{color:var(--ink);font-weight:500}
.kb .serie{font-size:11px;color:var(--muet);border:1px solid var(--filet);border-radius:999px;padding:3px 9px;white-space:nowrap}
.kb .cases{display:grid;grid-template-columns:repeat(16,1fr);gap:3px;margin-top:16px}
.kb .case{height:18px;border-radius:3px;border:1px solid var(--trait);background:var(--toile)}
.kb .case.payee{background:var(--coffre);border-color:var(--coffre)}
.kb .case.prochaine{background:var(--papier);border:2px solid var(--coffre)}
.kb .billet-pied{display:flex;justify-content:space-between;align-items:flex-end;margin-top:16px}
.kb .etiquette{font-size:12px;color:var(--muet)}
.kb .solde{font-size:23px;font-weight:600;margin-top:3px;line-height:1}
.kb .solde small{font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:500;color:var(--muet);letter-spacing:0;margin-left:5px}
.kb .compte{font-size:15px;font-weight:600}
.kb .compte span{color:var(--muet);font-weight:400}
.kb .actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:16px}
.kb .btn{height:46px;border-radius:6px;font-size:15px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:8px;padding:0 18px;border:1px solid transparent;white-space:nowrap}
.kb .btn svg.ic{width:18px;height:18px}
.kb .btn-plein{background:var(--coffre);color:#fff}
.kb .btn-filet{background:var(--papier);color:var(--ink);border-color:var(--trait)}
/* Le relevé : chiffres de référence, en points de conduite. */
.kb .releve{margin-top:8px}
.kb .ligne{display:flex;align-items:baseline;padding:7px 0}
.kb .ligne dt{font-size:14px;color:var(--muet)}
.kb .ligne .points{flex:1;border-bottom:1.5px dotted var(--pointille);margin:0 8px;transform:translateY(-4px)}
.kb .ligne dd{font-size:15px;font-weight:500}
.kb .ligne dd small{font-family:'Instrument Sans',sans-serif;font-size:12px;color:var(--muet);margin-left:4px}
/* Le registre : ce qu'on ouvre depuis l'accueil. */
.kb .groupe{font-size:12.5px;font-weight:600;color:var(--muet);margin:18px 0 8px}
.kb .groupe:first-of-type{margin-top:10px}
.kb .liste{list-style:none;background:var(--papier);border:1px solid var(--filet);border-radius:10px;overflow:hidden}
.kb .liste li{display:flex;align-items:center;gap:12px;padding:11px 12px;position:relative}
.kb .liste li+li::before{content:'';position:absolute;top:0;left:58px;right:0;height:1px;background:var(--filet)}
.kb .tampon{width:34px;height:34px;flex-shrink:0;border-radius:6px;border:1px solid var(--filet);display:flex;align-items:center;justify-content:center;color:var(--coffre);background:var(--toile)}
.kb .tampon svg.ic{width:18px;height:18px}
.kb .liste .txt{flex:1;min-width:0}
.kb .liste b{display:block;font-size:15px;font-weight:600}
.kb .liste .txt span{display:block;font-size:12.5px;color:var(--muet);margin-top:1px}
.kb .chev{width:16px!important;height:16px!important;color:#9DA39A}
/* Variante B */
.kb .b-tete{position:relative;background:linear-gradient(170deg,var(--nuit) 0%,var(--coffre) 100%);color:#fff;padding:12px 16px 62px;overflow:hidden}
.kb .b-tete .rosace{position:absolute;right:-96px;top:-36px;width:290px;color:rgba(210,178,76,.15)}
.kb .b-tete .onde{position:absolute;left:0;bottom:36px;height:24px;width:100%;color:rgba(210,178,76,.26)}
.kb .b-rang{position:relative;display:flex;justify-content:space-between;align-items:center;gap:12px}
.kb .b-nom{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:22px;letter-spacing:-.02em}
.kb .avatar.clair{background:rgba(255,255,255,.12);box-shadow:inset 0 0 0 1px rgba(255,255,255,.24)}
.kb .b-etiq{position:relative;margin-top:22px;font-size:13px;color:rgba(255,255,255,.74)}
.kb .b-chiffres{position:relative;display:flex;margin-top:18px;padding-top:12px;border-top:1px solid rgba(255,255,255,.16)}
.kb .b-chiffres div{padding-right:14px;margin-right:14px;border-right:1px solid rgba(255,255,255,.16)}
.kb .b-chiffres div:last-child{border-right:0;margin-right:0;padding-right:0}
.kb .b-chiffres b{display:block;font-size:16px;font-weight:500}
.kb .b-chiffres span{display:block;font-size:11.5px;color:rgba(255,255,255,.64);margin-top:2px}
.kb .b-carte{position:relative;z-index:2;margin:-46px 16px 0}
.kb .b-carte .billet{margin-top:0;box-shadow:0 14px 30px -18px rgba(14,46,31,.45)}
.kb .grille{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}
.kb .outil{display:flex;align-items:center;gap:10px;height:52px;padding:0 12px;background:var(--papier);border:1px solid var(--filet);border-radius:10px;font-size:14px;font-weight:600}
.kb .outil svg.ic{width:18px;height:18px;color:var(--coffre)}
/* Variante C */
.kb .c-tete{display:flex;align-items:center;gap:10px;padding:10px 16px 0}
.kb .c-tete .qui{flex:1;font-weight:600;font-size:15px}
.kb .c-jour{position:relative;padding:20px 16px 22px}
.kb .c-total{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:40px;letter-spacing:-.03em;line-height:1;margin-top:8px;font-variant-numeric:tabular-nums}
.kb .c-total small{font-family:'Instrument Sans',sans-serif;font-size:15px;font-weight:500;letter-spacing:0;color:var(--muet);margin-left:6px}
.kb .c-sous{font-size:12px;color:var(--muet);margin-top:9px;display:flex;gap:6px;align-items:center}
.kb .c-sous i{width:7px;height:7px;border-radius:999px;background:var(--positif)}
.kb .c-jour .onde{position:absolute;left:16px;bottom:0;height:14px;width:calc(100% - 32px);color:rgba(20,64,44,.32)}
.kb .recherche{margin:16px 16px 0;height:50px;display:flex;align-items:center;gap:10px;padding:0 14px;background:var(--papier);border:1px solid var(--trait);border-radius:6px;color:var(--muet);font-size:16px}
.kb .c-liste{list-style:none;margin-top:8px}
.kb .c-liste li{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px 12px;padding:12px 0;border-bottom:1px solid var(--filet)}
.kb .c-nom{font-size:15px;font-weight:600}
.kb .c-info{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--muet)}
.kb .c-info .mono{color:var(--ink)}
.kb .jauge{display:inline-flex;gap:1px}
.kb .jauge i{width:2px;height:10px;background:var(--trait);border-radius:1px}
.kb .jauge i.p{background:var(--coffre)}
.kb .btn-mini{grid-row:1 / span 2;grid-column:2;height:38px;padding:0 14px;border-radius:6px;border:1px solid var(--coffre);color:var(--coffre);font-size:13.5px;font-weight:600;display:flex;align-items:center;background:var(--papier)}
/* Bande d'en-tête des écrans secondaires sombres (encaisser) */
.kb .bande{position:relative;background:linear-gradient(170deg,var(--nuit) 0%,var(--coffre) 100%);color:#fff;padding:10px 16px 26px;overflow:hidden}
.kb .bande.recouvre{padding-bottom:70px}
.kb .bande .onde{position:absolute;left:0;bottom:6px;height:18px;width:100%;color:rgba(210,178,76,.28)}
.kb .bande.recouvre .onde{bottom:44px}
.kb .bande-rang{position:relative;display:flex;align-items:center;gap:12px}
.kb .rond{width:38px;height:38px;border-radius:999px;background:rgba(255,255,255,.1);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);display:flex;align-items:center;justify-content:center;flex-shrink:0}
.kb .rond svg.ic{width:18px;height:18px}
.kb .bande-titre{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:21px;letter-spacing:-.02em}
.kb .bande-sous{position:relative;font-size:13px;color:rgba(255,255,255,.74);margin-top:12px}
.kb .recouvre-carte{position:relative;z-index:2;margin:-58px 16px 0}
.kb .recouvre-carte .billet{margin-top:0;box-shadow:0 14px 30px -18px rgba(14,46,31,.45)}
.kb .case.neuve{background:var(--positif);border-color:var(--positif);box-shadow:0 0 0 2px rgba(28,122,75,.25)}
/* Le sélecteur de carte */
.kb .choix-liste{list-style:none;margin:8px 16px 0;background:var(--papier);border:1px solid var(--filet);border-radius:10px;overflow:hidden}
.kb .choix-liste li{display:grid;grid-template-columns:1fr auto;align-items:center;gap:5px 10px;padding:12px 12px 12px 14px;position:relative}
.kb .choix-liste li+li::before{content:'';position:absolute;top:0;left:14px;right:0;height:1px;background:var(--filet)}
.kb .choix-liste .chev{grid-row:1 / span 2;grid-column:2}
.kb .marche{color:var(--muet)}
/* La caisse : montant, bouton sous le pouce */
.kb .caisse{margin:14px 16px 0;padding:16px;background:var(--papier);border:1px solid var(--filet);border-radius:12px}
.kb .caisse-haut{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
.kb .caisse-montant{font-size:32px;font-weight:600;line-height:1;margin-top:6px}
.kb .caisse-montant small{font-family:'Instrument Sans',sans-serif;font-size:14px;font-weight:500;color:var(--muet);margin-left:6px;letter-spacing:0}
.kb .caisse-apres{font-size:12.5px;color:var(--muet);text-align:right;line-height:1.35}
.kb .caisse-apres .mono{color:var(--ink);font-weight:500}
.kb .btn-geant{height:56px;font-size:17px;margin-top:16px;width:100%;border-radius:6px}
.kb .btn-geant svg.ic{width:20px;height:20px}
.kb .note{font-size:12px;color:var(--muet);margin-top:10px;text-align:center}
/* Le tampon « Encaissé » */
.kb .tampon-encaisse{position:absolute;z-index:3;right:10px;top:14px;transform:rotate(-6deg);border:2px solid var(--positif);color:var(--positif);border-radius:6px;padding:6px 11px 5px;text-align:center;background:rgba(255,255,255,.9);box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3px var(--positif)}
.kb .tampon-encaisse b{display:block;font-family:'Bricolage Grotesque',sans-serif;font-weight:800;font-size:15px;letter-spacing:.1em;text-transform:uppercase;line-height:1.1}
.kb .tampon-encaisse span{display:block;font-family:'IBM Plex Mono',monospace;font-size:10.5px;margin-top:2px}
.kb .tampon-encaisse.garde{border-color:var(--info);color:var(--info);box-shadow:inset 0 0 0 2px #fff,inset 0 0 0 3px var(--info)}
.kb .succes{display:flex;gap:10px;align-items:flex-start;margin:14px 16px 0;font-size:14px;line-height:1.4}
.kb .succes .ok{width:22px;height:22px;border-radius:999px;background:var(--positif);color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px}
.kb .succes .ok svg.ic{width:14px;height:14px;stroke-width:2.5}
.kb .succes span.sous{display:block;color:var(--muet);font-size:12.5px;margin-top:2px}
.kb .duo{display:grid;grid-template-columns:1fr auto;gap:8px;margin:16px 16px 0}
.kb .tampon-seul{position:static;display:inline-block;transform:rotate(-4deg);margin:6px 0 2px}
/* En-tête clair des écrans secondaires */
.kb .entete{display:flex;align-items:center;gap:12px;padding:8px 16px 4px}
.kb .rond.clair{background:var(--papier);box-shadow:inset 0 0 0 1px var(--trait);color:var(--ink)}
.kb .entete-titre{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:22px;letter-spacing:-.02em;line-height:1.1}
.kb .entete-sous{font-size:12.5px;color:var(--muet);margin-top:2px}
/* Segments de filtre */
.kb .segments{display:grid;grid-template-columns:repeat(3,1fr);margin:12px 16px 0;padding:3px;background:#E8EAE5;border-radius:10px}
.kb .segments span{height:36px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:13.5px;font-weight:600;color:var(--muet);border-radius:6px;white-space:nowrap}
.kb .segments span.actif{background:var(--papier);color:var(--ink);box-shadow:0 1px 2px rgba(23,26,23,.14)}
.kb .segments .mono{font-weight:500;font-size:12px}
/* Liste de retrait, compacte */
.kb .r-groupe{display:flex;justify-content:space-between;align-items:baseline;font-size:12.5px;font-weight:600;color:var(--muet);margin:18px 16px 8px}
.kb .r-liste{list-style:none;margin:0 16px;background:var(--papier);border:1px solid var(--filet);border-radius:10px;overflow:hidden}
.kb .r-liste li{padding:12px 14px;position:relative}
.kb .r-liste li+li{border-top:1px solid var(--filet)}
.kb .r-liste li.fini::before{content:'';position:absolute;left:0;top:12px;height:20px;width:3px;border-radius:0 2px 2px 0;background:var(--positif)}
.kb .r-ligne{display:grid;grid-template-columns:1fr auto;gap:3px 12px;align-items:baseline}
.kb .r-nom{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kb .r-montant{font-size:16px;font-weight:600;text-align:right;white-space:nowrap}
.kb .r-montant small{font-family:'Instrument Sans',sans-serif;font-size:11.5px;color:var(--muet);font-weight:500;margin-left:4px}
.kb .r-info{font-size:12px;color:var(--muet)}
.kb .r-info .mono{color:var(--ink)}
.kb .r-etiq{font-size:11.5px;color:var(--muet);text-align:right}
.kb .r-ouvert{background:#FBFCFA}
.kb .r-detail{margin-top:10px;padding-top:10px;border-top:1px dashed var(--trait);font-size:12.5px;color:var(--muet);line-height:1.45}
.kb .r-actions{display:grid;grid-template-columns:1fr auto;gap:8px;margin-top:12px}
.kb .btn-moyen{height:42px;font-size:14px;padding:0 14px}
/* Feuille de confirmation */
.kb .voile{position:absolute;inset:30px 0 0 0;background:rgba(6,20,14,.48);z-index:5}
.kb .feuille{position:absolute;left:0;right:0;bottom:0;z-index:6;background:var(--papier);border-radius:12px 12px 0 0;padding:10px 16px 18px;box-shadow:0 -12px 30px -12px rgba(6,20,14,.45);font-family:'Instrument Sans',sans-serif;color:var(--ink)}
.kb .poignee{width:40px;height:4px;border-radius:2px;background:var(--trait);margin:0 auto 16px}
.kb .feuille-titre{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:21px;letter-spacing:-.02em;line-height:1.2}
.kb .decompte{margin-top:14px}
.kb .decompte .ligne{padding:6px 0}
.kb .decompte .total{border-top:3px double var(--ink);margin-top:8px;padding-top:10px}
.kb .decompte .total dt{color:var(--ink);font-weight:600;font-size:15px}
.kb .decompte .total dd{font-size:21px;font-weight:600}
.kb .avertir{font-size:13px;line-height:1.45;color:var(--ink);background:var(--toile);border-radius:6px;padding:10px 12px;margin-top:14px}
.kb .pile-boutons{display:grid;gap:8px;margin-top:14px}
.kb .remise{margin:16px 16px 0}
.kb .remise-titre{font-family:'Bricolage Grotesque',sans-serif;font-weight:700;font-size:21px;letter-spacing:-.02em;line-height:1.25}
.kb .remise-titre .mono{font-family:'IBM Plex Mono',monospace;font-weight:600}
.kb .remise p.sous{font-size:13px;color:var(--muet);margin-top:8px;line-height:1.45}
/* Légendes et planche commune */
.kb .legende{margin-top:18px;color:var(--text-primary)}
.kb .legende .lettre{font-size:.72rem;letter-spacing:.06em;text-transform:uppercase;color:var(--text-secondary);font-weight:600}
.kb .legende .lettre.reco{color:#1C7A4B}
.kb .legende h3{font-size:1.15rem;margin:.2rem 0 .5rem}
.kb .legende p,.kb .legende li{font-size:.86rem;color:var(--text-secondary);line-height:1.5}
.kb .legende ul{margin:.4rem 0 0 1.1rem}
.kb .legende .prix{margin-top:.6rem}
.kb .legende .prix b{color:var(--text-primary)}
.kb .planche{margin-top:36px;display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.kb .planche>div{background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;padding:18px}
.kb .planche h3{font-size:1rem;margin-bottom:.75rem}
.kb .pastilles{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.kb .pastille i{display:block;height:40px;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(0,0,0,.08)}
.kb .pastille b{display:block;font-size:.74rem;margin-top:5px;color:var(--text-primary)}
.kb .pastille span{display:block;font-size:.68rem;color:var(--text-secondary);font-family:'IBM Plex Mono',monospace}
.kb .specimen p{color:var(--text-primary);line-height:1.25}
.kb .specimen .role{font-size:.72rem;color:var(--text-secondary);margin:2px 0 12px;font-family:system-ui,sans-serif}
.kb .planche ul{margin-left:1.1rem}
.kb .planche li{font-size:.86rem;color:var(--text-secondary);line-height:1.6}
</style>`;
