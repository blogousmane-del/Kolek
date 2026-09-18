import { CONDITIONS, CONFIDENTIALITE } from '../liens';
import { Champ, PageLegale, TitreSection } from './PageLegale';
import { IDENTITE } from './identite';

/**
 * Les mentions légales — `/mentions-legales`.
 *
 * L'ordre suit l'article 9 de la loi n° 2013-450 : éditeur, directeur de la
 * publication, hébergeur. "Nature du service" et "Propriété intellectuelle"
 * suivent, puis le renvoi vers les deux autres textes. Chaque fait vient de
 * `IDENTITE`, jamais recopié — voir `identite.ts` pour pourquoi.
 */
export function MentionsLegales() {
  return (
    <PageLegale titre="Mentions légales" miseAJour="2026-09-18">
      <section>
        <TitreSection>Éditeur</TitreSection>
        <p className="mt-2">
          Le présent site est édité par <strong>{IDENTITE.exploitant}</strong>, personne
          physique exerçant sous l’enseigne <strong>{IDENTITE.enseigne}</strong> (« GTCS »),
          sous le statut d’entreprenant — un régime qui dispense de l’immatriculation au
          registre du commerce et du crédit mobilier (RCCM).
        </p>
        <p className="mt-2">
          Adresse : {IDENTITE.commune}, <Champ valeur={IDENTITE.adressePrecise} nom="adresse précise" />, {IDENTITE.pays}.
        </p>
        <p className="mt-2">
          Déclaration d’activité :{' '}
          <Champ valeur={IDENTITE.declarationActivite} nom="numéro de déclaration d’activité" />.
        </p>
        <p className="mt-2">Compte contribuable : {IDENTITE.compteContribuable}.</p>
        <p className="mt-2">
          Téléphone :{' '}
          <Champ valeur={IDENTITE.telephone} nom="téléphone" />. Contact : {IDENTITE.contact}.
        </p>
      </section>

      <section>
        <TitreSection>Directeur de la publication</TitreSection>
        <p className="mt-2">{IDENTITE.exploitant}.</p>
      </section>

      <section>
        <TitreSection>Hébergement</TitreSection>
        <p className="mt-2">
          Base de données, authentification et fonctions : <strong>Supabase</strong>, région
          eu-west-3 (Paris, France).
        </p>
        <p className="mt-2">
          Hébergement du site et des applications : <strong>Netlify</strong>.
        </p>
      </section>

      <section>
        <TitreSection>Nature du service</TitreSection>
        <p className="mt-2">
          Kolek est un outil de tenue de collecte. « GTCS n’est pas un établissement financier,
          ne reçoit aucun dépôt, et aucun flux d’épargne ne transite par la plateforme. »
        </p>
      </section>

      <section>
        <TitreSection>Propriété intellectuelle</TitreSection>
        <p className="mt-2">
          Le nom Kolek, le logo, l’interface et le code appartiennent à l’exploitant, {IDENTITE.exploitant}.
        </p>
      </section>

      <section>
        <TitreSection>Pour aller plus loin</TitreSection>
        <p className="mt-2">
          <a href={CONDITIONS} className="text-primary underline underline-offset-2">
            Conditions générales
          </a>{' '}
          ·{' '}
          <a href={CONFIDENTIALITE} className="text-primary underline underline-offset-2">
            Politique de confidentialité
          </a>
        </p>
      </section>
    </PageLegale>
  );
}
