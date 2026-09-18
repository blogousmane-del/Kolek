import { CONDITIONS, MENTIONS_LEGALES } from '../liens';
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
        <p className="mt-2">
          Adresse : {IDENTITE.commune},{' '}
          <Champ valeur={IDENTITE.adressePrecise} nom="adresse précise" />, {IDENTITE.pays}.
        </p>
      </section>

      <section>
        <TitreSection>2. Ce qui est collecté, et d’où ça vient</TitreSection>
        <p className="mt-2">L’exploitant traite les catégories de données suivantes :</p>
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
          <li>
            <strong>Paiements d’abonnement</strong> : identifiant de vente, montant, devise et
            date de règlement, transmis par Chariow lors du paiement ; pourcentage de remise et
            échéances, posés par l’exploitant.
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
          <li>
            Les paiements d’abonnement servent à activer, renouveler et suivre l’abonnement du
            collecteur.
          </li>
        </ul>
      </section>

      <section>
        <TitreSection>4. Sur quel fondement</TitreSection>
        <p className="mt-2">
          Le fondement est le consentement, au sens de la loi n° 2013-450 : « manifestation de
          volonté expresse, non équivoque, libre, spécifique et informée ». Le collecteur le donne
          à l’ouverture de son compte. Pour les clients du collecteur, ce consentement est
          recueilli par le collecteur lui-même — les{' '}
          <a href={CONDITIONS} className="text-primary underline underline-offset-2">
            conditions générales
          </a>{' '}
          l’y obligent, avant toute inscription.
        </p>
        <p className="mt-2">
          Ce consentement fonde la collecte des données, pas tout ce qui suit : la conservation
          des mises repose sur l’obligation comptable OHADA, celle des paiements d’abonnement sur
          l’obligation comptable et fiscale, le compte collecteur sur l’exécution du contrat, le
          journal d’audit sur la sécurité, et les avis SMS sur l’exécution du service — chaque
          fondement est détaillé ligne par ligne dans le tableau de la section 5.
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
                <th scope="col" className="py-2 pr-3 font-headings">
                  Donnée
                </th>
                <th scope="col" className="py-2 pr-3 font-headings">
                  Base
                </th>
                <th scope="col" className="py-2 font-headings">
                  Durée
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td className="py-2 pr-3">Compte collecteur (nom, téléphone, zone)</td>
                <td className="py-2 pr-3">Exécution du contrat</td>
                <td className="py-2">
                  Durée de la relation, puis anonymisation sur demande — pas automatiquement, sauf
                  suppression du compte n’ayant jamais manié d’argent
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3">
                  Clients du collecteur (nom, téléphone, marché, activité)
                </td>
                <td className="py-2 pr-3">Consentement recueilli par le collecteur</td>
                <td className="py-2">
                  Tant que le compte du collecteur existe, puis anonymisation sur demande — pas
                  automatiquement
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
                <td className="py-2">
                  Sans purge automatique, effacement sur demande, sauf si un paiement s’y
                  rattache : elle est alors retenue dix ans, comme lui
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Journal d’audit</td>
                <td className="py-2 pr-3">Sécurité</td>
                <td className="py-2">
                  Immuable par construction : le schéma refuse toute modification et tout
                  effacement, même sous clé de service ; aucune purge n’est prévue.
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-3">Avis clients envoyés (SMS)</td>
                <td className="py-2 pr-3">Exécution du service</td>
                <td className="py-2">Sans purge automatique, effacement sur demande</td>
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
          <li>
            Le titulaire d’un compte, pour les tournées des collaborateurs qu’il a rattachés
            (trois au plus) ; un collaborateur n’accède qu’à sa propre tournée.
          </li>
          <li>L’exploitant, pour l’administration du service et le support.</li>
        </ul>
      </section>

      <section>
        <TitreSection>7. Les destinataires et les sous-traitants</TitreSection>
        <p className="mt-2">L’exploitant s’appuie sur les sous-traitants suivants, nommés un par un :</p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Supabase</strong> — hébergement de la base de données, de l’authentification
            et des fonctions, à Paris.
          </li>
          <li>
            <strong>Netlify</strong> : hébergement du site et des applications.
          </li>
          <li>
            <strong>Twilio</strong> : envoi des avis par SMS.
          </li>
          <li>
            <strong>Resend</strong> : envoi des courriels.
          </li>
          <li>
            <strong>Chariow</strong> : traitement du paiement des abonnements.
          </li>
          <li>
            <strong>Google</strong> : connexion facultative au compte.
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
          Toute personne dont l’exploitant traite les données dispose des droits suivants :
        </p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Information</strong> : savoir ce qui est traité, et pourquoi.
          </li>
          <li>
            <strong>Accès</strong> : obtenir communication de ses données.
          </li>
          <li>
            <strong>Rectification</strong> : faire corriger une donnée inexacte.
          </li>
          <li>
            <strong>Opposition</strong> : s’opposer à un traitement.
          </li>
          <li>
            <strong>Refus de figurer au fichier</strong> — avant son inscription par le
            collecteur, refuser d’y figurer.
          </li>
          <li>
            <strong>Effacement par anonymisation</strong> — la fiche du client et ses cartes ne
            portent plus ni nom ni numéro de téléphone : ils sont remplacés par une mention
            neutre, et les montants restent, parce que la loi comptable impose de les conserver.
            Le journal d’audit, lui, est immuable : il garde la trace des saisies et des
            corrections antérieures, nom et numéro d’origine compris, lisible par l’exploitant
            seul.
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

      <section>
        <TitreSection>Pour aller plus loin</TitreSection>
        <p className="mt-2">
          <a href={CONDITIONS} className="text-primary underline underline-offset-2">
            Conditions générales
          </a>{' '}
          ·{' '}
          <a href={MENTIONS_LEGALES} className="text-primary underline underline-offset-2">
            Mentions légales
          </a>
        </p>
      </section>
    </PageLegale>
  );
}
