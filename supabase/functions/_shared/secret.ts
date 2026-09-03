/**
 * La comparaison d'un secret reçu à un secret attendu.
 *
 * Sortie de `chariow.ts` le 2026-09-03, sans changer une ligne du corps. Elle y
 * était née pour le webhook de paiement, mais elle ne parle ni de paiement ni de
 * Chariow : `envoyer-avis` en a besoin pour reconnaître son appelant planifié, et
 * lui faire importer le module du contrat de paiement pour trente lignes de
 * cryptographie aurait attaché deux sujets qui n'ont rien à se dire.
 */

/**
 * Comparaison de secret à temps constant.
 *
 * Une comparaison de chaînes JavaScript s'arrête au premier caractère différent
 * et fuit donc la longueur du préfixe correct — de quoi reconstituer un secret
 * caractère par caractère. On compare les empreintes, de longueur fixe, en
 * accumulant les écarts sans jamais sortir de la boucle.
 */
export async function secretValide(recu: string | null, attendu: string): Promise<boolean> {
  if (!attendu) return false;

  const encodeur = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encodeur.encode(recu ?? '')),
    crypto.subtle.digest('SHA-256', encodeur.encode(attendu)),
  ]);

  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  let ecart = 0;
  for (let i = 0; i < ua.length; i += 1) ecart |= (ua[i] as number) ^ (ub[i] as number);
  return ecart === 0;
}
