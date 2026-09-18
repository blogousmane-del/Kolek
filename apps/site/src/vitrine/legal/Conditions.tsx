import { PALIERS, formatMontant } from '@kolek/core';

import { CONFIDENTIALITE } from '../liens';
import { PageLegale, TitreSection } from './PageLegale';
import { IDENTITE } from './identite';

/**
 * Les conditions générales — `/conditions`.
 *
 * Les prix et les fonctions de chaque palier viennent de `PALIERS`, jamais
 * recopiés : un tarif recopié qui diverge du produit est une clause qu'on
 * perd, et une fonction recopiée qui n'est pas livrée est une promesse qu'on
 * ne tient pas. La page ne liste que les fonctions dont `incluse` vaut
 * `true`, quelles qu'elles soient : c'est la règle, et elle ne dépend
 * d'aucun palier ni d'aucune date.
 *
 * Le prix se rend par `formatMontant` (`packages/core/src/format.ts`),
 * jamais `palier.prix` brut : la page de tarifs et l'écran d'administration
 * affichent déjà « 2 500 FCFA » avec ce même séparateur. Un contrat qui
 * écrirait « 2500 FCFA » ne changerait rien au montant dû, mais un écart de
 * présentation entre la page de vente et le contrat est un détail qu'un
 * adversaire relève.
 *
 * La section « Obligations du collecteur » porte le risque de l'article 28
 * de la loi n° 2013-450 : aucun écran ne permet aujourd'hui à un client du
 * collecteur de refuser de figurer au fichier, donc l'obligation passe par
 * le contrat — voir `Docs/specs/2026-09-18-mentions-cgu-confidentialite-design.md`,
 * §2.5.
 */
export function Conditions() {
  return (
    <PageLegale titre="Conditions générales" miseAJour="2026-09-18">
      <section>
        <TitreSection>1. Objet et définitions</TitreSection>
        <p className="mt-2">
          Les présentes conditions générales régissent l’usage de Kolek, un outil de tenue de
          collecte édité par <strong>{IDENTITE.exploitant}</strong> (ci-après « l’exploitant »),
          personne physique exerçant sous l’enseigne <strong>{IDENTITE.enseigne}</strong>, et le
          collecteur titulaire d’un compte.
        </p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            <strong>Collecteur</strong> : la personne, titulaire d’un compte Kolek ouvert par
            l’exploitant, qui tient sa collecte auprès de ses propres clients.
          </li>
          <li>
            <strong>Client du collecteur</strong> : la personne inscrite par le collecteur, qui
            lui verse ses mises. Elle ne détient pas de compte Kolek et n’est pas partie aux
            présentes conditions.
          </li>
          <li>
            <strong>Tournée</strong> : l’ensemble des cartes que le collecteur gère au jour le
            jour, y compris hors connexion.
          </li>
          <li>
            <strong>Mise</strong> : le versement effectué par un client du collecteur à une
            échéance donnée, enregistré par le collecteur dans Kolek.
          </li>
          <li>
            <strong>Carte</strong> : le support sur lequel Kolek suit les mises d’un client, de
            son ouverture jusqu’à sa clôture.
          </li>
        </ul>
      </section>

      <section>
        <TitreSection>2. Accès au service</TitreSection>
        <p className="mt-2">
          L’accès à Kolek n’est pas libre : il n’existe aucune inscription en libre-service. Deux
          chemins mènent à l’ouverture d’un compte, selon la formule choisie.
        </p>
        <p className="mt-2">
          Pour l’essai, gratuit, un compte est ouvert par l’exploitant après un échange avec le
          collecteur, une fois le formulaire d’ouverture rempli.
        </p>
        <p className="mt-2">
          Sur une formule payante (Standard, Pro ou Illimité), l’acceptation des présentes
          conditions puis le règlement de l’abonnement valent ouverture : le compte naît du
          paiement confirmé, par un traitement automatique, sans intervention humaine.
        </p>
      </section>

      <section>
        <TitreSection>3. Les formules et leurs prix</TitreSection>
        <p className="mt-2">
          Kolek propose {PALIERS.length} formules. Les prix sont mensuels, en FCFA, sans
          commission sur les mises encaissées.
        </p>
        <ul className="mt-2 flex flex-col gap-3 pl-5 list-disc">
          {PALIERS.map((palier) => (
            <li key={palier.cle}>
              <strong>{palier.nom}</strong> :{' '}
              {palier.prix === 0
                ? `Gratuit pendant ${palier.periode}.`
                : `${formatMontant(palier.prix)} FCFA par mois.`}
              <ul className="mt-1 flex flex-col gap-0.5 pl-5 list-disc">
                {palier.fonctions
                  .filter((fonction) => fonction.incluse)
                  .map((fonction) => (
                    <li key={fonction.libelle}>{fonction.libelle}</li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <TitreSection>4. Durée, reconduction, paiement</TitreSection>
        <p className="mt-2">
          L’abonnement est mensuel et se reconduit tacitement chaque mois, sauf résiliation
          (section 6). Le paiement s’effectue par Chariow ; la date d’échéance figure sur le
          compte du collecteur.
        </p>
      </section>

      <section>
        <TitreSection>5. Suspension pour impayé</TitreSection>
        <p className="mt-2">
          À défaut de paiement à l’échéance, l’abonnement est suspendu. La suspension ferme
          l’inscription de nouveaux clients, l’ouverture de nouvelles cartes et l’ajout de
          collaborateurs. Elle ne ferme pas l’encaissement : le collecteur continue de percevoir
          les mises des cartes déjà ouvertes, et la file des encaissements pris hors ligne sur
          ces mêmes cartes continue de se synchroniser. Un encaissement pris hors ligne sur une
          carte ouverte pendant la suspension ne peut pas, lui, être enregistré : l’ouverture
          de la carte étant refusée, l’encaissement qui en dépend l’est aussi. Les données déjà
          enregistrées sont conservées.
        </p>
      </section>

      <section>
        <TitreSection>6. Résiliation</TitreSection>
        <p className="mt-2">
          Le collecteur peut résilier à tout moment, en écrivant à{' '}
          <a
            href={`mailto:${IDENTITE.contact}`}
            className="text-primary underline underline-offset-2"
          >
            {IDENTITE.contact}
          </a>
          . L’exploitant peut résilier en cas de manquement grave aux présentes conditions. Le
          sort des données à la résiliation est décrit dans la{' '}
          <a href={CONFIDENTIALITE} className="text-primary underline underline-offset-2">
            politique de confidentialité
          </a>
          .
        </p>
      </section>

      <section>
        <TitreSection>7. Disponibilité</TitreSection>
        <p className="mt-2">
          L’exploitant met en œuvre les moyens raisonnables pour assurer la disponibilité de
          Kolek, sans garantir un taux de disponibilité chiffré. Des interruptions pour
          maintenance ou cas de force majeure peuvent survenir.
        </p>
      </section>

      <section>
        <TitreSection>8. Obligations du collecteur</TitreSection>
        <p className="mt-2">
          L’exploitant enregistre le nom, le numéro de téléphone, le marché et l’activité des
          clients du collecteur — des personnes qui n’ont pas de compte Kolek et n’ont rien
          signé. Le collecteur s’engage à :
        </p>
        <ul className="mt-2 flex flex-col gap-1 pl-5 list-disc">
          <li>
            informer chaque client, avant de l’inscrire, de l’identité de l’exploitant, des
            finalités du traitement, des catégories de données enregistrées, des destinataires,
            de la durée de conservation, de son droit d’accès et de rectification, du transfert
            de ses données hors de la CEDEAO, et de la possibilité de refuser de figurer au
            fichier ;
          </li>
          <li>ne pas inscrire un client qui refuse d’y figurer ;</li>
          <li>n’inscrire que ce qui sert la collecte ;</li>
          <li>répondre de l’usage qu’il fait de l’envoi d’avis par SMS à ses clients.</li>
                  <li>
            répondre des collaborateurs qu'il rattache à son compte, et leur transmettre les
            obligations des présentes : le collaborateur ne règle aucun abonnement, n'accepte
            donc pas ces conditions pour son propre compte, et engage le titulaire par ce
            qu'il inscrit.
          </li>
        </ul>
      </section>

      <section>
        <TitreSection>9. Propriété intellectuelle</TitreSection>
        <p className="mt-2">
          Le nom Kolek, le logo, l’interface et le code appartiennent à l’exploitant,{' '}
          {IDENTITE.exploitant}. Le collecteur reçoit un simple droit d’usage du service pour la
          durée de son abonnement, sans aucune cession.
        </p>
      </section>

      <section>
        <TitreSection>10. Responsabilité</TitreSection>
        <p className="mt-2">
          L’exploitant n’est pas dépositaire des fonds collectés. Il ne garantit pas les sommes
          que le collecteur encaisse auprès de ses clients, et n’intervient à aucun moment dans
          leur détention. Sa responsabilité se limite à la mise à disposition de l’outil.
        </p>
      </section>

      <section>
        <TitreSection>11. Droit applicable et juridiction</TitreSection>
        <p className="mt-2">
          Les présentes conditions sont soumises au droit ivoirien. Tout litige relatif à leur
          formation, leur exécution ou leur interprétation relève de la compétence des
          juridictions ivoiriennes.
        </p>
      </section>

      <section>
        <TitreSection>12. Modification des conditions</TitreSection>
        <p className="mt-2">
          L’exploitant peut modifier les présentes conditions. La version en vigueur est celle
          publiée sur cette page ; la date de mise à jour, en tête de page, fait foi.
        </p>
      </section>
    </PageLegale>
  );
}
