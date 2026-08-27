import { describe, expect, it } from 'vitest';

import { ATTENDUS, manquesDns, normaliser } from './verifier-dns.mjs';

// Le script interroge le réseau : ce qui se teste ici, c'est la fonction qui
// décide si ce qu'on a observé est conforme. Elle reçoit des relevés en clair,
// jamais une résolution réelle — sinon le test dépendrait du DNS du poste, et
// tomberait dans un train ou un avion.

/** Un relevé complet et conforme, dont chaque test dégrade une seule ligne. */
function releve(remplacements = {}) {
  return {
    'kolek.cash': { A: ['75.2.60.5'] },
    'www.kolek.cash': { CNAME: ['kolek-site.netlify.app'] },
    'app.kolek.cash': { CNAME: ['kolek-collecteur.netlify.app'] },
    'admin.kolek.cash': { CNAME: ['kolek-admin.netlify.app'] },
    ...remplacements,
  };
}

describe('normaliser', () => {
  it('retire le point final et la casse', () => {
    // Un résolveur rend le nom pleinement qualifié, avec le point de la racine.
    // Comparer sans normaliser ferait échouer un DNS parfaitement juste.
    expect(normaliser('Kolek-Site.Netlify.App.')).toBe('kolek-site.netlify.app');
  });
});

describe('manquesDns', () => {
  it('ne trouve rien à redire à un relevé conforme', () => {
    expect(manquesDns(releve())).toEqual([]);
  });

  it('déclare les quatre enregistrements attendus', () => {
    // Le tableau est la seule source : un enregistrement oublié ici ne serait
    // jamais contrôlé, et l'absence ne se verrait qu'en production.
    expect(ATTENDUS.map((a) => a.hote)).toEqual([
      'kolek.cash',
      'www.kolek.cash',
      'app.kolek.cash',
      'admin.kolek.cash',
    ]);
  });

  it('signale un enregistrement qui ne résout pas encore', () => {
    const observe = releve();
    delete observe['app.kolek.cash'];
    expect(manquesDns(observe)).toContain('app.kolek.cash — CNAME introuvable');
  });

  it('traite une réponse vide comme une absence', () => {
    // `resolveCname` peut rendre un tableau vide plutôt que lever. Les deux
    // disent la même chose et doivent produire le même message.
    const manques = manquesDns(releve({ 'admin.kolek.cash': { CNAME: [] } }));
    expect(manques).toContain('admin.kolek.cash — CNAME introuvable');
  });

  it('signale une valeur qui ne correspond pas', () => {
    const manques = manquesDns(releve({ 'app.kolek.cash': { CNAME: ['kolek-admin.netlify.app'] } }));
    expect(manques.some((m) => m.startsWith('app.kolek.cash — CNAME vaut'))).toBe(true);
  });

  it('signale plusieurs enregistrements sur l’apex — le parking Hostinger', () => {
    // Le piège réel : Hostinger pose un `A` vers sa page d'attente, et le
    // laisser en place donne deux `A` sur l'apex. Le visiteur tombe une fois
    // sur deux sur « domaine réservé », sans qu'aucun message n'explique rien.
    const manques = manquesDns(releve({ 'kolek.cash': { A: ['75.2.60.5', '84.32.84.32'] } }));
    expect(manques.some((m) => m.includes('2 enregistrements A'))).toBe(true);
  });

  it('tolère le point final et la casse rendus par un résolveur', () => {
    const manques = manquesDns(releve({ 'www.kolek.cash': { CNAME: ['Kolek-Site.Netlify.App.'] } }));
    expect(manques).toEqual([]);
  });
});
