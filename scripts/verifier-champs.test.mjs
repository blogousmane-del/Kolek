import { describe, expect, it } from 'vitest';

import {
  chercherChampsTropPetits,
  chercherDansLeDepot,
  sources,
  tousLesChamps,
} from './verifier-champs.mjs';

/**
 * Le garde-fou de la taille des champs.
 *
 * Il existe parce que le défaut est invisible sur le poste où on l'écrit : un
 * champ en 13 px se lit très bien sur un écran de bureau, et ce n'est qu'au
 * doigt, sur un iPhone, que Safari zoome la page et laisse le collecteur
 * pincer pour ressortir. Aucune revue ne voit ça, aucun test d'interface non
 * plus — d'où un contrôle qui lit la source.
 */
describe('taille des champs de saisie', () => {
  it('signale un champ sous les 16 px', () => {
    const source = `<input className="w-full text-sm font-body" />`;

    expect(chercherChampsTropPetits(source, 'exemple.tsx')).toEqual([
      { chemin: 'exemple.tsx', ligne: 1, balise: 'input', taille: 'text-sm' },
    ]);
  });

  it('accepte un champ portant la taille de champ', () => {
    const source = `<input className="w-full text-champ font-body" />`;

    expect(chercherChampsTropPetits(source, 'exemple.tsx')).toEqual([]);
  });

  it('accepte une taille explicitement plus grande', () => {
    // Un champ de montant en `text-2xl` est au-dessus de 16 px : il n'a pas
    // besoin du jeton de champ, et le lui imposer le rapetisserait.
    const source = `<textarea className="text-2xl" />`;

    expect(chercherChampsTropPetits(source, 'exemple.tsx')).toEqual([]);
  });

  it('ne confond pas l’étiquette voisine avec le champ', () => {
    // Le piège du contrôle naïf : `text-sm` appartient au `label`, pas à
    // l'`input`. Un garde-fou qui crie ici serait désarmé dans la semaine.
    const source = [
      '<label className="text-sm">Nom</label>',
      '<input className="text-champ" />',
    ].join('\n');

    expect(chercherChampsTropPetits(source, 'exemple.tsx')).toEqual([]);
  });

  it('ne regarde que les champs, pas le texte autour', () => {
    const source = `<p className="text-xs">Trois clients</p>`;

    expect(chercherChampsTropPetits(source, 'exemple.tsx')).toEqual([]);
  });

  it('donne la ligne, pour qu’on n’ait pas à chercher', () => {
    const source = ['<div>', '  <select className="text-base" />', '</div>'].join('\n');

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 2, balise: 'select', taille: 'text-base' },
    ]);
  });

  it('lit au-delà d’une fonction fléchée', () => {
    // Le premier `>` de cette balise appartient à `=>`, pas à la fermeture.
    // Un contrôle qui s'arrête là ne voit jamais `className`, et rend vert
    // tout champ dont le `onChange` précède la classe — c'est-à-dire presque
    // tous. Défaut trouvé le 2026-09-09 par ce test, pas par la relecture.
    const source = [
      '<input',
      '  onChange={(e) => onChange(e.target.value)}',
      '  className="text-base"',
      '/>',
    ].join('\n');

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, balise: 'input', taille: 'text-base' },
    ]);
  });

  it('suit une classe rangée dans une constante du fichier', () => {
    // L'angle mort du 2026-09-09 : la vitrine range les classes de ses sept
    // champs dans un seul `const CHAMP_SOMBRE`. Un contrôle qui ne lit que
    // l'intérieur de la balise les déclarait tous conformes, et le formulaire
    // d'ouverture de compte — la page qui demande un mot de passe — zoomait
    // sur chacun de ses champs.
    const source = [
      "const CHAMP = 'w-full text-base font-body';",
      '<input className={CHAMP} />',
    ].join('\n');

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 2, balise: 'input', taille: 'text-base' },
    ]);
  });

  it('suit la constante même quand elle est complétée sur place', () => {
    const source = [
      "const CHAMP = 'w-full text-sm';",
      '<textarea className={`${CHAMP} min-h-24`} />',
    ].join('\n');

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 2, balise: 'textarea', taille: 'text-sm' },
    ]);
  });

  it('lit au-delà d’un « > » posé dans une chaîne', () => {
    // Le même défaut que la flèche, sous un autre déguisement : le `>` de
    // l'invite ferme la balise pour un lecteur naïf, et `className` n'est
    // jamais atteint.
    const source = '<input placeholder="a > b" className="text-base" />';

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, balise: 'input', taille: 'text-base' },
    ]);
  });

  it('refuse un champ qui ne déclare aucune taille', () => {
    // Le trou le plus discret : sans classe de taille, le champ n'hérite pas
    // d'une valeur neutre — la préflight de Tailwind lui donne `font: inherit`,
    // donc les 15 px du corps de texte, donc le zoom d'iOS. Un champ muet est
    // aussi fautif qu'un champ en `text-sm`, et il passait.
    const source = '<input className="w-full border" />';

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, balise: 'input', taille: 'aucune' },
    ]);
  });

  it('laisse tranquilles les cases à cocher et les boutons radio', () => {
    // Ils ne reçoivent pas de saisie : iOS ne zoome pas dessus, et leur imposer
    // 16 px de police n'aurait aucun sens — c'est leur taille de boîte qui
    // compte, pas leur police.
    const source = [
      '<input type="checkbox" className="w-4 h-4" />',
      '<input type="radio" className="w-4 h-4" />',
      '<input type="hidden" name="jeton" />',
    ].join('\n');

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([]);
  });

  it('ne prend pas une couleur pour une taille', () => {
    // `text-ink` et `text-muted-foreground` commencent tous deux par `text-`.
    // Les compter comme des tailles déclarerait conforme un champ qui n'en
    // porte aucune.
    const source = '<input className="w-full text-ink placeholder:text-muted-foreground" />';

    expect(chercherChampsTropPetits(source, 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, balise: 'input', taille: 'aucune' },
    ]);
  });

  it('mesure une taille écrite en valeur arbitraire', () => {
    expect(chercherChampsTropPetits('<input className="text-[14px]" />', 'a.tsx')).toEqual([
      { chemin: 'a.tsx', ligne: 1, balise: 'input', taille: 'text-[14px]' },
    ]);
    expect(chercherChampsTropPetits('<input className="text-[16px]" />', 'a.tsx')).toEqual([]);
  });

  it('lit bien quelque chose — sinon il serait vert sur un dépôt vide', () => {
    // Le contrôle du contrôle. Sans lui, une expression rationnelle cassée
    // rendrait le test suivant vert en ne trouvant aucun champ du tout.
    expect(sources().length).toBeGreaterThan(0);
    expect(tousLesChamps().length).toBeGreaterThanOrEqual(30);
  });

  it('aucun champ du dépôt ne passe sous les 16 px', () => {
    expect(chercherDansLeDepot()).toEqual([]);
  });
});
