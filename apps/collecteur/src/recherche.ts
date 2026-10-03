/**
 * Ce que deux personnes tapent pareil : minuscules, sans accents.
 *
 * « Adjamé » est saisi avec son accent dans la fiche, et personne ne compose un
 * accent sur un clavier de téléphone au marché. Sans ce repli, chercher
 * « traore » ne trouve pas « Traoré », et le collecteur cesse d'essayer la
 * recherche — ce qui la rend pire qu'absente, puisqu'elle lui a menti une fois.
 *
 * Vit ici et non dans un écran depuis le 2026-09-19 : trois écrans cherchent un
 * client par son nom — la liste des clients, les reçus et le retrait — et la
 * copie qui vivait dans `Clients.tsx` ne servait qu'à lui. Les reçus, eux,
 * comparaient en `toLocaleLowerCase` seul : « Traoré » y était introuvable.
 */
export function nu(texte: string): string {
  return (
    texte
      .normalize('NFD')
      // Les diacritiques combinants, que `NFD` vient de détacher de leur lettre.
      //
      // Écrits en échappements, et c'est la seule forme sûre : une classe posée
      // en caractères bruts se fait réécrire au premier outil qui touche au
      // fichier. Le 2026-09-09, une substitution en avait fait `[0300-036f]` —
      // qui n'est plus une plage de diacritiques mais un ensemble de chiffres
      // et de lettres, mangeant les 0, 3 et 6, donc la recherche par numéro.
      // Le commentaire de `Clients.tsx` le disait déjà ; le fichier, lui,
      // portait de nouveau les caractères bruts au moment de cette extraction.
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('fr')
  );
}

/** Les chiffres seuls, séparateurs et indicatifs de mise en forme retirés. */
function chiffres(texte: string): string {
  return texte.replace(/\D/g, '');
}

/**
 * Les trois clefs d'un client, dans l'ordre où le collecteur s'en sert : le
 * nom, le marché, le numéro.
 *
 * Le nom seul ne suffisait pas : il s'écrit de plusieurs façons, il se
 * prononce autrement qu'il ne s'écrit, et deux clients d'un même marché le
 * partagent. Le numéro, lui, est exact ; il s'écrit « 07 08 09 10 11 » dans la
 * fiche et se tape « 0708 » dans la recherche, d'où la comparaison des
 * chiffres aux chiffres. Le marché est ce qui organise la tournée.
 *
 * Écrite dans `Clients.tsx` ; déplacée ici le 2026-10-02 pour servir aussi à
 * l'onglet « Encaisser ».
 */
export function correspondClient(
  client: { nom: string; marche: string | null; telephone: string | null },
  terme: string,
): boolean {
  if (!terme) return true;
  const cherche = nu(terme);

  if (nu(client.nom).includes(cherche)) return true;
  if (client.marche !== null && nu(client.marche).includes(cherche)) return true;

  if (client.telephone !== null) {
    if (nu(client.telephone).includes(cherche)) return true;
    const chiffresCherches = chiffres(terme);
    if (chiffresCherches && chiffres(client.telephone).includes(chiffresCherches)) return true;
  }

  return false;
}
