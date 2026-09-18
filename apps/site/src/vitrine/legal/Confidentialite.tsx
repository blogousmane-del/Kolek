import { Champ, PageLegale, TitreSection } from './PageLegale';
import { IDENTITE } from './identite';

/**
 * La politique de confidentialité — `/confidentialite`.
 *
 * Le plan suit l’article 9 de la loi n° 2013-450, dans l’ordre repris par
 * `Docs/specs/2026-09-18-mentions-cgu-confidentialite-design.md` §5.3 : qui
 * est responsable, ce qui est collecté, pourquoi, sur quel fondement, pendant
 * combien de temps, qui y accède, les destinataires et sous-traitants, le
 * transfert hors CEDEAO, les droits et comment les exercer, la sécurité,
 * l’autorité, la modification.
 *
 * Trois faits que ce fichier ne doit jamais trahir, vérifiés dans le code
 * avant d’écrire :
 * - aucune photo n’est collectée — `clients.photo_url` existe en base mais
 *   n’est écrite nulle part dans `apps/collecteur/src`, et l’exploitant a
 *   décidé de la retirer par une migration séparée ;
 * - l’effacement se fait par anonymisation, jamais par suppression : aucune
 *   politique `for delete` n’existe dans la base, et une mise est une pièce
 *   comptable que l’acte uniforme OHADA impose de conserver dix ans — le nom
 *   et le numéro sont remplacés par une mention neutre, les montants restent ;
 * - aucune autorisation ARTCI n’existe encore, et aucun écran ne permet
 *   d’exercer ses droits soi-même : chaque demande se traite à la main, par
 *   courriel.
 *
 * Le fondement légal est le consentement, jamais un « intérêt légitime » —
 * une notion que le droit ivoirien ne connaît pas comme fondement d’un
 * traitement (la loi n° 2013-450 ne l’emploie qu’à l’article 27, à propos des
 * objectifs statutaires des responsables).
 */
export function Confidentialite() {
  return (
    <PageLegale titre="Politique de confidentialité" miseAJour="2026-09-18">
      <section>
        <TitreSection>1. Qui est responsable du traitement</TitreSection>
        <p className="mt-2">
          <strong>{IDENTITE.exploitant}</strong>, personne physique exerçant sous l’enseigne{' '}
          {IDENTITE.enseigne}, est seul responsable du traitement décrit par la présente
          politique, y compris pour les données des clients du collecteur — des personnes qui
          n’ont pas de compte Kolek et n’ont rien signé directement avec l’exploitant. Compte
          contribuable : {IDENTITE.compteContribuable}. Contact : {IDENTITE.contact}.
        </p>
      </section>

      <section>
        <TitreSection>2. Ce qui est collecté, et d’où ça vient</TitreSection>
        <p className="mt-2">Kolek traite les catégories de données suivantes :</p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Compte collecteur</strong> : nom, numéro de téléphone, zone, courriel — saisis
            par le collecteur lui-même à l’ouverture de son compte.
          </li>
          <li>
            <strong>Clients du collecteur</strong> : nom, numéro de téléphone, marché, activité —
            saisis par le collecteur, jamais directement par la personne concernée.
          </li>
          <li>
            <strong>Données de collecte</strong> : cartes, mises, retraits, caisses du jour.
          </li>
          <li>
            <strong>Demandes d’ouverture</strong> : les informations fournies dans le formulaire,
            avant la création d’un compte.
          </li>
          <li>
            <strong>Journal d’audit</strong> : les actions effectuées dans Kolek, horodatées.
          </li>
          <li>
            <strong>Avis envoyés par SMS</strong> : les messages adressés aux clients du
            collecteur.
          </li>
        </ul>
      </section>

      <section>
        <TitreSection>3. Pourquoi ces données sont traitées</TitreSection>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>Le compte collecteur sert à ouvrir et administrer l’accès du collecteur à Kolek.</li>
          <li>Les données des clients du collecteur servent à tenir leur carte de collecte.</li>
          <li>
            Les données de collecte servent à enregistrer et suivre les mises, au fil de la
            tournée.
          </li>
          <li>Les demandes d’ouverture servent à instruire l’ouverture d’un compte collecteur.</li>
          <li>Le journal d’audit sert à la sécurité et à la traçabilité des actions.</li>
          <li>Les avis par SMS servent à informer un client du collecteur d’un encaissement.</li>
        </ul>
      </section>

      <section>
        <TitreSection>4. Sur quel fondement</TitreSection>
        <p className="mt-2">
          Le fondement est le consentement, au sens de la loi n° 2013-450 : « manifestation de
          volonté expresse, non équivoque, libre, spécifique et informée ». Le collecteur le donne
          à l’ouverture de son compte. Pour les clients du collecteur, ce consentement est
          recueilli par le collecteur lui-même — les conditions générales l’y obligent, avant
          toute inscription.
        </p>
        <p className="mt-2">
          Il faut le dire franchement : la trace de ce consentement n’est pas conservée
          aujourd’hui. C’est un chantier ouvert, pas un fait acquis.
        </p>
      </section>

      <section>
        <TitreSection>5. Combien de temps ces données sont conservées</TitreSection>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-hairline">
                <th className="py-2 pr-3 font-headings">Donnée</th>
                <th className="py-2 pr-3 font-headings">Base</th>
                <th className="py-2 font-headings">Durée</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td className="py-2 pr-3">Compte collecteur (nom, téléphone, zone)</td>
                <td className="py-2 pr-3">Exécution du contrat</td>
                <td className="py-2">Durée de la relation, puis archivage comptable</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">
                  Clients du collecteur (nom, téléphone, marché, activité)
                </td>
                <td className="py-2 pr-3">Consentement recueilli par le collecteur</td>
                <td className="py-2">
                  Anonymisation à la fermeture du compte du collecteur, ou sur demande
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Mises, cartes, retraits, caisses du jour</td>
                <td className="py-2 pr-3">Obligation comptable OHADA</td>
                <td className="py-2">10 ans, accès restreint</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Paiements d’abonnement</td>
                <td className="py-2 pr-3">Obligation comptable et fiscale</td>
                <td className="py-2">10 ans</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Demandes d’ouverture non converties</td>
                <td className="py-2 pr-3">
                  Consentement du demandeur, donné en remplissant le formulaire
                </td>
                <td className="py-2">1 an</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Journal d’audit</td>
                <td className="py-2 pr-3">Sécurité</td>
                <td className="py-2">1 an</td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Avis clients envoyés (SMS)</td>
                <td className="py-2 pr-3">Exécution du service</td>
                <td className="py-2">1 an</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <TitreSection>6. Qui accède à ces données</TitreSection>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            Le collecteur, pour sa propre tournée — la sécurité au niveau des lignes (RLS)
            l’empêche de voir celle d’un autre collecteur.
          </li>
          <li>Ses collaborateurs, dans la limite des droits que le collecteur leur accorde.</li>
          <li>L’exploitant, pour l’administration du service et le support.</li>
        </ul>
      </section>

      <section>
        <TitreSection>7. Les destinataires et les sous-traitants</TitreSection>
        <p className="mt-2">Kolek s’appuie sur les sous-traitants suivants, nommés un par un :</p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Supabase</strong> — hébergement de la base de données, de l’authentification
            et des fonctions, à Paris.
          </li>
          <li>
            <strong>Netlify</strong> — hébergement du site et des applications.
          </li>
          <li>
            <strong>Twilio</strong> — envoi des avis par SMS.
          </li>
          <li>
            <strong>Resend</strong> — envoi des courriels.
          </li>
          <li>
            <strong>Chariow</strong> — traitement du paiement des abonnements.
          </li>
          <li>
            <strong>Google</strong> — connexion facultative au compte.
          </li>
        </ul>
      </section>

      <section>
        <TitreSection>8. Le transfert hors CEDEAO</TitreSection>
        <p className="mt-2">
          La loi n° 2013-450 définit un pays tiers comme tout État non membre de la CEDEAO. La
          base de données de Kolek est hébergée à Paris, en France — un pays tiers au sens de la
          loi. Supabase, Netlify, Twilio, Resend, Chariow et Google traitent tous des données hors
          CEDEAO.
        </p>
        <p className="mt-2">
          Ce transfert n’est ni exceptionnel ni ponctuel : il est quotidien et structurel, et
          cette politique l’assume plutôt que de le taire.
        </p>
      </section>

      <section>
        <TitreSection>9. Les droits, et comment les exercer</TitreSection>
        <p className="mt-2">
          Toute personne dont Kolek traite les données dispose des droits suivants :
        </p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Information</strong> — savoir ce qui est traité, et pourquoi.
          </li>
          <li>
            <strong>Accès</strong> — obtenir communication de ses données.
          </li>
          <li>
            <strong>Rectification</strong> — faire corriger une donnée inexacte.
          </li>
          <li>
            <strong>Opposition</strong> — s’opposer à un traitement.
          </li>
          <li>
            <strong>Effacement par anonymisation</strong> — le nom et le numéro de téléphone sont
            remplacés par une mention neutre ; les montants restent, sans rien qui désigne la
            personne, parce que la loi comptable impose de les conserver.
          </li>
        </ul>
        <p className="mt-2">
          Pour exercer l’un de ces droits, écrire à{' '}
          <a
            href={`mailto:${IDENTITE.contact}`}
            className="text-primary underline underline-offset-2"
          >
            {IDENTITE.contact}
          </a>
          . Une réponse est apportée sous{' '}
          <Champ
            valeur={IDENTITE.delaiReponseJoursOuvres}
            nom="délai de réponse en jours ouvrés"
          />{' '}
          jours ouvrés.
        </p>
        <p className="mt-2">
          Il faut le dire franchement : aucun écran ne permet aujourd’hui d’exercer ces droits
          soi-même. Chaque demande est traitée à la main, par courriel.
        </p>
      </section>

      <section>
        <TitreSection>10. La sécurité</TitreSection>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>Chiffrement des données en transit.</li>
          <li>
            Cloisonnement des accès par sécurité au niveau des lignes (RLS) : un collecteur ne
            voit que sa propre tournée.
          </li>
          <li>La clé de service n’est jamais exposée au navigateur.</li>
          <li>Un journal d’audit trace les actions effectuées dans Kolek.</li>
        </ul>
      </section>

      <section>
        <TitreSection>11. L’autorité de protection des données</TitreSection>
        <p className="mt-2">
          L’autorité compétente est l’<strong>ARTCI</strong>. À la date de publication de cette
          page, aucune autorisation n’a encore été délivrée par l’ARTCI pour les traitements
          décrits ici.
        </p>
      </section>

      <section>
        <TitreSection>12. Modification de cette politique</TitreSection>
        <p className="mt-2">
          L’exploitant peut modifier la présente politique. La version en vigueur est celle
          publiée sur cette page ; la date de mise à jour, en tête de page, fait foi.
        </p>
      </section>
    </PageLegale>
  );
}
