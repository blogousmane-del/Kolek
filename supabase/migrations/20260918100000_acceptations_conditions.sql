-- La trace de l'acceptation des conditions générales.
--
-- Spec : Docs/specs/2026-09-18-trace-acceptation-conditions-design.md §4.
--
-- Un événement par acceptation, et non deux colonnes sur le compte. Le jour où
-- les conditions changeront — et elles changeront, l'autorisation ARTCI devra y
-- figurer quand elle arrivera — une nouvelle acceptation ne doit pas écraser la
-- précédente : un litige portant sur une période antérieure au changement se
-- retrouverait sans preuve.
create table if not exists public.acceptations_conditions (
  id uuid primary key default gen_random_uuid(),

  -- La demande où l'acte a eu lieu. Nulle au renouvellement, où la personne est
  -- authentifiée et où il n'y a pas de demande.
  --
  -- `on delete set null` est une ceinture, pas une règle qui s'exercera : la
  -- politique de confidentialité établit que « l'effacement se fait par
  -- anonymisation, jamais par suppression ». La clause couvre le jour où une
  -- purge serait écrite ; elle ne décrit rien d'existant.
  demande_id uuid references public.demandes_ouverture(id) on delete set null,

  -- Posé à la naissance du compte sur la voie payante, connu d'emblée au
  -- renouvellement, et jamais posé sur la voie essai : `admin-creer-collecteur`
  -- ignore la demande dont le compte provient (vérifié : aucune mention).
  --
  -- `on delete cascade` ne peut emporter que la trace d'un compte qui n'a jamais
  -- fait circuler un franc : `admin-supprimer-collecteur` refuse deux fois,
  -- COMPTE_A_ENCAISSE sur `mises` ou `retraits`, et COMPTE_A_PAYE sur
  -- `paiements_abonnement`. Un collecteur qui a réglé un abonnement est
  -- indélétable.
  collecteur_id uuid references auth.users(id) on delete cascade,

  -- L'empreinte du texte accepté, engendrée par scripts/generer-cgu.mjs. Elle
  -- désigne l'instantané de Docs/legal/ qu'on produirait devant un tribunal.
  version text not null,

  -- Du serveur. Une date envoyée par le navigateur est une date que le
  -- navigateur choisit.
  acceptee_le timestamptz not null default now()
);

comment on table public.acceptations_conditions is
  'Un événement par acceptation des conditions générales. Jamais écrasé : l''historique des versions est la preuve.';

-- Le webhook retrouve la ligne par la demande au moment de poser collecteur_id.
create index if not exists acceptations_conditions_demande_idx
  on public.acceptations_conditions (demande_id);

-- La question du jour du litige : qu'a accepté cette personne, et quand.
create index if not exists acceptations_conditions_collecteur_idx
  on public.acceptations_conditions (collecteur_id, acceptee_le desc);

-- Même dispositif que `demandes_ouverture` : RLS activée **et** droits révoqués.
-- L'activer sans révoquer, ou révoquer sans l'activer, laisserait la moitié de
-- la protection à la charge de l'autre.
alter table public.acceptations_conditions enable row level security;

revoke all on public.acceptations_conditions from public;
revoke all on public.acceptations_conditions from anon;
revoke all on public.acceptations_conditions from authenticated;
grant all on public.acceptations_conditions to service_role;
