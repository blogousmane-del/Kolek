import { describe, expect, it } from 'vitest';
import { comparer, definersDuDepot, definersDuDump } from './verifier-derive.mjs';

/**
 * La dérive d'objets, distincte de la dérive de versions.
 *
 * `verifier-migrations.mjs` compare la **présence** des migrations et le dit en
 * tête : « Il ne compare pas le contenu ». Le 2026-09-09, il a rendu « aucune
 * migration inconnue » — ce qui était vrai — pendant que la production portait
 * `public.rls_auto_enable()`, une fonction `security definer` que le dépôt ne
 * crée nulle part.
 *
 * Elle n'a pas été trouvée par un contrôle mais par curiosité, en préparant une
 * poussée. C'est exactement ce qu'un garde-fou doit remplacer.
 *
 * ## Pourquoi comparer au dépôt et non à la base locale
 *
 * La base locale est **reconstruite depuis les migrations** : la comparer à la
 * production reviendrait à comparer le dépôt à la production par un
 * intermédiaire qui peut lui-même avoir dérivé, et une base de travail sale
 * ferait crier le contrôle à tort. Le dépôt est la source de vérité, donc c'est
 * lui qu'on interroge.
 */
describe('definersDuDump', () => {
  it('trouve une fonction security definer du schéma de production', () => {
    const sql = `
CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog, pg_temp'
    AS $$ BEGIN END; $$;
ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";
`;

    expect(definersDuDump(sql)).toEqual(['rls_auto_enable']);
  });

  it('ignore une fonction qui n’est pas security definer', () => {
    const sql = `
CREATE OR REPLACE FUNCTION "public"."grouper_milliers"("n" bigint) RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$ select 'x'; $$;
ALTER FUNCTION "public"."grouper_milliers"("n" bigint) OWNER TO "postgres";
`;

    expect(definersDuDump(sql)).toEqual([]);
  });

  it('ne confond pas deux fonctions voisines', () => {
    // Le piège : chercher SECURITY DEFINER n'importe où après un CREATE
    // attribuerait la mention de la seconde fonction à la première.
    const sql = `
CREATE OR REPLACE FUNCTION "public"."ordinaire"() RETURNS "void"
    LANGUAGE "sql"
    AS $$ select 1; $$;
ALTER FUNCTION "public"."ordinaire"() OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."privilegiee"() RETURNS "void"
    LANGUAGE "sql" SECURITY DEFINER
    AS $$ select 1; $$;
ALTER FUNCTION "public"."privilegiee"() OWNER TO "postgres";
`;

    expect(definersDuDump(sql)).toEqual(['privilegiee']);
  });
});

describe('definersDuDepot', () => {
  it('trouve une fonction security definer écrite dans une migration', () => {
    const sql = `
create or replace function public.est_admin()
returns boolean language sql stable security definer
set search_path = public, pg_temp
as $fn$ select true; $fn$;
`;

    expect(definersDuDepot(sql)).toEqual(['est_admin']);
  });

  it('tolère les guillemets, la casse et les retours à la ligne', () => {
    // Les migrations du dépôt ne suivent pas toutes la même mise en page.
    const sql = `
CREATE FUNCTION "public"."Chose"()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
AS $$ begin return new; end; $$;
`;

    expect(definersDuDepot(sql)).toEqual(['Chose']);
  });

  it('ignore une fonction ordinaire', () => {
    expect(definersDuDepot('create function public.x() returns int language sql as $$ select 1 $$;')).toEqual(
      [],
    );
  });
});

describe('comparer', () => {
  it('ne dit rien quand la production ne porte que ce que le dépôt écrit', () => {
    expect(comparer(['a', 'b'], ['a', 'b', 'c'])).toEqual([]);
  });

  it('signale une fonction presente en production et absente du dépôt', () => {
    // Le cas de `rls_auto_enable` au 2026-09-09.
    const trouves = comparer(['a', 'rls_auto_enable'], ['a']);

    expect(trouves).toHaveLength(1);
    expect(trouves[0]).toContain('rls_auto_enable');
  });

  it('ne signale pas une fonction du dépôt absente de la production', () => {
    // C'est une migration non déployée, pas une dérive — `verifier:migrations`
    // le dit déjà, et le redire ici ferait deux alertes pour un fait.
    expect(comparer(['a'], ['a', 'pas_encore_deployee'])).toEqual([]);
  });
});
