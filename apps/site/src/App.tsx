import { Inscription } from "./vitrine/Inscription";
import { Vitrine } from "./vitrine/Vitrine";

/**
 * Le routage du site public.
 *
 * Deux destinations, donc pas de bibliothèque de routage : `react-router`
 * pèserait une quinzaine de kilo-octets pour remplacer les six lignes
 * ci-dessous, sur une page dont le poids est déjà un constat d'audit ouvert.
 *
 * Le chemin est lu une fois, au chargement. Les deux pages ne se répondent que
 * par des liens ordinaires — un `<a href>` qui recharge — et c'est suffisant
 * ici : on ne passe du formulaire à la vitrine qu'une fois, et le rechargement
 * remet la page à zéro, ce qui est exactement ce qu'on veut après un envoi.
 *
 * La redirection `/* → /index.html` du `netlify.toml` est ce qui rend
 * `/inscription` servable : sans elle, Netlify chercherait un fichier de ce nom.
 */
export default function App() {
  const chemin = window.location.pathname.replace(/\/+$/, "");

  if (chemin === "/inscription") return <Inscription />;
  return <Vitrine />;
}
