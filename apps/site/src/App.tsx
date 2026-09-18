import { Inscription } from './vitrine/Inscription';
import { Vitrine } from './vitrine/Vitrine';
import { Confidentialite } from './vitrine/legal/Confidentialite';
import { Conditions } from './vitrine/legal/Conditions';
import { MentionsLegales } from './vitrine/legal/MentionsLegales';
import { CONDITIONS, CONFIDENTIALITE, MENTIONS_LEGALES } from './vitrine/liens';

/**
 * Le routage du site public.
 *
 * Cinq destinations, donc pas de bibliothèque de routage : `react-router`
 * pèserait une quinzaine de kilo-octets pour remplacer les cinq lignes
 * ci-dessous, sur une page dont le poids est déjà un constat d'audit ouvert.
 *
 * Le chemin est lu une fois, au chargement. Les deux pages ne se répondent que
 * par des liens ordinaires — un `<a href>` qui recharge — et c'est suffisant
 * ici : on ne passe du formulaire à la vitrine qu'une fois, et le rechargement
 * remet la page à zéro, ce qui est exactement ce qu'on veut après un envoi.
 *
 * La règle nommée `/inscription` du `netlify.toml` (`:82-85`) est ce qui rend
 * cette page servable : sans elle, Netlify chercherait un fichier de ce nom.
 */
export default function App() {
  const chemin = window.location.pathname.replace(/\/+$/, '');

  if (chemin === '/inscription') return <Inscription />;
  if (chemin === MENTIONS_LEGALES) return <MentionsLegales />;
  if (chemin === CONDITIONS) return <Conditions />;
  if (chemin === CONFIDENTIALITE) return <Confidentialite />;
  return <Vitrine />;
}
