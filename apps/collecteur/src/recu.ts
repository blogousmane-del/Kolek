/**
 * Le numéro d'un reçu : les huit premiers signes de l'identifiant de la mise,
 * en capitales.
 *
 * L'identifiant est fabriqué sur le téléphone au moment de l'encaissement,
 * et devient celui de la ligne au serveur : le numéro existe donc dès le
 * geste, hors ligne compris. Écrit dans `Recus.tsx` ; extrait le 2026-10-02
 * pour que l'encaissement montre le même numéro que la liste des reçus.
 */
export function numeroDeRecu(id: string): string {
  return id.slice(0, 8).toUpperCase();
}
