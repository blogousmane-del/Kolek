// Fichier engendré par scripts/generer-cgu.mjs — ne pas modifier à la main.
// La source est le texte rendu de Conditions.tsx et Confidentialite.tsx.
// Relancer : npm run generer:cgu
//
// Cette constante est la preuve : c'est elle qu'on enregistre avec chaque
// acceptation, et elle désigne l'instantané de Docs/legal/ qu'on produirait
// devant un tribunal. Trois copies engendrées par le même passage — la vitrine,
// l'application du collecteur, les Edge Functions — et npm run verifier:cgu
// échoue si l'une diverge.

export const VERSION_CONDITIONS = '2f8fc714bfccffa1';

/** L'application du collecteur vit sur app.kolek.cash : un chemin
    relatif mènerait à une page qui n'existe pas. Les chemins viennent de
    apps/site/src/vitrine/liens.ts, l'origine est nommée dans le générateur. */
export const URL_CONDITIONS = 'https://kolek.cash/conditions';
export const URL_CONFIDENTIALITE = 'https://kolek.cash/confidentialite';
