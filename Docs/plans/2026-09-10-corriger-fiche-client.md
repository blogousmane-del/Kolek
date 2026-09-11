# Corriger la fiche d'un client — plan d'implémentation

> **Pour un exécutant :** les étapes sont cochables (`- [ ]`) et se suivent dans
> l'ordre. Chaque tâche finit par un commit et laisse le dépôt vert. Le dessin
> qui commande ce plan est
> [`Docs/specs/2026-09-10-corriger-fiche-client-design.md`](../specs/2026-09-10-corriger-fiche-client-design.md).

**But :** le collecteur peut corriger le nom, le téléphone, le marché et
l'activité d'un de ses clients depuis sa fiche.

**Architecture :** une fonction d'écriture `modifierClient` dans
`ecritures.ts`, un formulaire `CorrigerFiche` dans `FicheClient.tsx`, et un
bouton pour l'ouvrir. **Aucune migration** — le socle est déjà en place.

**Outillage :** React 19, Vite 8, Vitest 4, oxlint, TypeScript 7, Supabase.

---

## Contraintes globales

Copiées du dessin. Elles s'appliquent à **toutes** les tâches.

- **Aucune migration.** `clients_update` existe, et `authenticated` a déjà
  `UPDATE` sur `nom`, `telephone`, `marche`, `activite`. Une tâche qui semble
  demander une migration s'est trompée : relire le dessin avant d'ouvrir quoi
  que ce soit en base.
- **Seuls les champs changés partent.** Envoyer tout le formulaire écraserait un
  champ non rechargé.
- **L'écriture compte les lignes.** `.select('id')` puis refus si le tableau est
  vide. Sans lui, PostgREST rend `204` / `error: null` quand RLS ou un
  privilège de colonne écarte la ligne, et l'écran croit avoir corrigé.
- **Le téléphone change ⟹ `avis_actifs: false`, dans la même requête.** Jamais
  deux écritures : la fenêtre entre les deux laisserait le nouveau numéro
  cohabiter avec l'ancien consentement.
- **Un champ vidé s'écrit `null`, jamais `''`** — pour que le journal d'audit
  lise « le champ était vide ».
- **`nom` est obligatoire**, et le refus reprend la phrase exacte de
  `inscrireClient` : « Le nom du client est obligatoire. »
- **Les champs de saisie passent par `Champ` de `@kolek/ui`**, jamais par un
  `<input>` nu. `scripts/verifier-champs.mjs` refuse toute balise `input`,
  `textarea` ou `select` sous 16 px — Safari sur iPhone zoome la page au premier
  toucher. Et **ne pas nommer une taille interdite dans un commentaire posé
  entre `<Champ` et son `>`** : le contrôle lit la balise ouvrante entière et
  ne distingue pas un commentaire d'une liste de classes.
- Toute cible tactile fait **44 px** au minimum.
- Les épreuves de base tournent **uniquement** sur la pile locale.

---

## Vérification préalable en production — 2026-09-11

Faite **avant** la première ligne de code, parce que ce travail touche des
clients réels. Lecture seule, par `supabase db query --linked` ; des comptes
agrégés uniquement, aucun nom ni numéro affiché.

| Ce que le plan suppose | Mesuré en production |
|---|---|
| `clients_update` borne à `collecteur_id = auth.uid()` | ✅ identique au local, `USING` et `WITH CHECK` |
| `UPDATE` accordé sur `nom`, `telephone`, `marche`, `activite` | ✅ six colonnes, les mêmes qu'en local |
| Un seul déclencheur sur `clients` | ✅ `clients_journal`, actif (`O`) |
| Le journal garde l'ancienne valeur | ❌ **faux** — `to_jsonb(new)` seulement. Dessin corrigé |

**Les données réelles, et ce qu'elles changent :**

| | |
|---|---|
| Clients | **81** |
| Avec numéro | 81 |
| **Avis actifs** | **68 — 84 %** |
| Numéro vide `''` ou marché vide `''` | 0 — l'inscription écrit bien `null` |
| Nom ou numéro avec espaces autour | 0 |
| Avis actifs sans numéro | 0 — l'invariant de l'inscription tient |
| Insertions au journal | 80 pour 81 clients |

**Conséquence directe : la coupure du consentement n'est pas un cas limite.**
Quatre clients sur cinq ont les avis actifs ; presque toute correction de numéro
les coupera. L'avertissement de la tâche 3 n'est donc pas une précaution de
bord — c'est le message que le collecteur lira le plus souvent sur cet écran,
et il doit dire clairement quoi faire ensuite.

**Les collaborateurs.** Un titulaire agit sur les clients de ses collaborateurs
(dessin du 2026-09-02), mais par des fonctions `security definer`
(`equipe_clients`) et l'écran `EquipeClients` — jamais par `FicheClient`, que
seul `Clients.tsx` monte, sur les clients propres. Le bouton « Corriger la
fiche » n'apparaîtra donc que là où la correction peut aboutir. Un titulaire ne
peut pas corriger le client d'un collaborateur : c'est le collaborateur qui le
fait. L'isolation d'`isolation.test.ts` — « A ne modifie pas un client de B » —
ne bouge pas.

---

## Structure de fichiers

| Fichier | Rôle |
|---|---|
| `apps/collecteur/src/ecritures.ts` | **Modifier** — ajouter `modifierClient` |
| `apps/collecteur/src/ecritures.test.ts` | **Modifier** — l'aiguillage, sur bouchon |
| `supabase/tests/ecritures-collecteur.test.ts` | **Modifier** — RLS et droits de colonne, sur vraie base |
| `apps/collecteur/src/ecrans/FicheClient.tsx` | **Modifier** — `CorrigerFiche` + le bouton |
| `apps/collecteur/src/ecrans/FicheClient.test.tsx` | **Modifier** — l'écran |

---

### Tâche 1 : `modifierClient`, l'écriture

**Fichiers :** Modifier `apps/collecteur/src/ecritures.ts` · Test
`apps/collecteur/src/ecritures.test.ts`

**Interfaces :** produit

```ts
export interface CorrectionClient {
  nom: string;
  telephone: string;
  marche: string;
  activite: string;
}

export async function modifierClient(
  clientId: string,
  correction: CorrectionClient,
  origine: CorrectionClient,
): Promise<{ ok: true; ecrit: boolean } | { ok: false; echec: EchecEcriture }>
```

Consommé par la tâche 3. `ecrit: false` dit « rien n'avait changé, rien n'est
parti » — ce n'est pas un échec, et l'écran ne doit pas l'annoncer comme un
succès d'écriture.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

Ajouter en fin de `apps/collecteur/src/ecritures.test.ts`. Le bouchon
`update().eq().select()` existe déjà en tête de fichier (`majChamps`,
`majSelect`) : le réutiliser, ne pas en écrire un second.

Ajouter `modifierClient` à la ligne d'import :

```ts
const { codeDErreur, creerClientAvecCarte, definirConsentementAvis, enregistrerMise, modifierClient } =
  await import('./ecritures');
```

```ts
/**
 * La correction d'une fiche client.
 *
 * ## Ce que ces épreuves gardent, et que rien d'autre ne garde
 *
 * Le déclencheur de notification lit `client.telephone` **au moment de la
 * mise**. Corriger le numéro d'un client aux avis actifs enverrait son solde
 * d'épargne à un numéro que personne n'a accepté — et une faute de frappe dans
 * la correction, à un inconnu. `avis_actifs` doit donc retomber, et retomber
 * **dans la même requête** : deux écritures successives laisseraient une
 * fenêtre où le nouveau numéro cohabite avec l'ancien consentement, et une mise
 * encaissée dedans partirait au mauvais endroit.
 */
describe('modifierClient', () => {
  const ORIGINE = { nom: 'GSM T', telephone: '0709201790', marche: 'BLE ZOKOU', activite: '' };

  beforeEach(() => {
    majChamps.mockReset();
    majSelect.mockReset().mockResolvedValue({ data: [{ id: CLIENT }], error: null });
  });

  it('n’envoie que le champ changé', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ nom: 'GSM Traoré' });
  });

  it('n’écrit rien quand rien n’a changé', async () => {
    // Un formulaire ouvert puis refermé ne doit laisser aucune ligne au journal
    // d'audit, ni annoncer un succès qui mentirait.
    const r = await modifierClient(CLIENT, { ...ORIGINE }, ORIGINE);

    expect(majChamps).not.toHaveBeenCalled();
    expect(r).toEqual({ ok: true, ecrit: false });
  });

  it('coupe les avis dès que le numéro change, dans la même requête', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, telephone: '0709201799' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ telephone: '0709201799', avis_actifs: false });
  });

  it('coupe les avis quand le numéro est retiré', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, telephone: '' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ telephone: null, avis_actifs: false });
  });

  it('ne touche pas aux avis quand seul le nom change', async () => {
    // Punir une correction sans rapport serait un défaut, pas une précaution.
    await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(majChamps.mock.calls[0]?.[0]).not.toHaveProperty('avis_actifs');
  });

  it('écrit null et non une chaîne vide quand un champ est vidé', async () => {
    // Le journal d'audit doit lire « le champ était vide », pas « le champ
    // contenait rien ». C'est le geste que `inscrireClient` fait déjà.
    await modifierClient(CLIENT, { ...ORIGINE, marche: '' }, ORIGINE);

    expect(majChamps).toHaveBeenCalledWith({ marche: null });
  });

  it('ignore les espaces autour d’une valeur inchangée', async () => {
    await modifierClient(CLIENT, { ...ORIGINE, nom: '  GSM T  ' }, ORIGINE);

    expect(majChamps).not.toHaveBeenCalled();
  });

  it('refuse un nom vide, avec la phrase de l’inscription', async () => {
    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: '   ' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.echec.code).toBe('NOM_VIDE');
      expect(r.echec.message).toBe('Le nom du client est obligatoire.');
    }
    expect(majChamps).not.toHaveBeenCalled();
  });

  it('rend un échec quand le serveur n’a touché aucune ligne', async () => {
    // Le défaut du 2026-08-24 : PostgREST rend 204 et `error: null` quand RLS
    // ou un privilège de colonne écarte la ligne. Sans ce contrôle, le
    // collecteur croit avoir corrigé un numéro qu'il n'a pas corrigé, et
    // continue d'appeler le mauvais.
    majSelect.mockReset().mockResolvedValue({ data: [], error: null });

    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('RIEN_ECRIT');
  });

  it('traduit un refus de privilège en DROIT_REFUSE', async () => {
    // Un privilège de colonne refusé : `modifierClient` n'envoie que des colonnes
    // accordées, donc ce refus signalerait un défaut de l'application.
    majSelect.mockReset().mockResolvedValue({
      data: null,
      error: { code: '42501', message: 'permission denied for table clients' },
    });

    const r = await modifierClient(CLIENT, { ...ORIGINE, nom: 'GSM Traoré' }, ORIGINE);

    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.echec.code).toBe('DROIT_REFUSE');
  });
});
```

> **`beforeEach` :** vérifier la ligne 1 du fichier et l'ajouter à l'import de
> `vitest` si besoin.

> **Pourquoi `DROIT_REFUSE` et jamais `ABONNEMENT_INACTIF`.** Relevé le
> 2026-09-11 dans `codeDErreur` : un 42501 dont le message cite
> `row-level security policy for table "clients"` est traduit en
> `ABONNEMENT_INACTIF` — « Ton abonnement n'est plus actif… ». C'est juste pour
> une **insertion**, dont la politique porte la condition d'abonnement. Pour une
> **correction**, ce serait faux : `clients_update` ne la porte pas.
>
> Ce chemin est inatteignable ici, et c'est pourquoi le plan ne touche pas à
> `codeDErreur` : sur un `UPDATE`, RLS écarte la ligne **en silence** (zéro ligne,
> donc `RIEN_ECRIT`), et le `WITH CHECK` ne peut échouer que si `collecteur_id`
> change — or cette colonne n'est pas accordée et `modifierClient` ne l'envoie
> jamais. Si un jour elle l'était, la phrase d'abonnement mentirait : c'est ce
> que cette note est là pour empêcher d'oublier.

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/ecritures.test.ts -t "modifierClient"
```

Attendu : `modifierClient is not a function`.

- [ ] **Étape 3 : implémenter**

Dans `apps/collecteur/src/ecritures.ts`, après `definirConsentementAvis` :

```ts
/** Les quatre champs qu'un collecteur peut corriger sur la fiche d'un client. */
export interface CorrectionClient {
  nom: string;
  telephone: string;
  marche: string;
  activite: string;
}

/**
 * Corrige la fiche d'un client.
 *
 * ## Pourquoi seuls les champs changés partent
 *
 * Envoyer tout le formulaire écraserait le marché d'un client avec une chaîne
 * vide si le champ n'avait pas été rechargé — et ce genre d'effacement ne se
 * remarque que le jour où on cherche par marché. C'est le geste que
 * `FicheModifiable` tient déjà côté administration, pour la même raison.
 *
 * Corollaire : quand rien n'a changé, **rien ne part**. Pas de requête, pas de
 * ligne au journal d'audit, et `ecrit: false` pour que l'écran n'annonce pas un
 * succès d'écriture qui n'a pas eu lieu.
 *
 * ## Pourquoi le numéro emporte le consentement
 *
 * Le déclencheur de notification lit `client.telephone` **au moment de la
 * mise**. Corriger le numéro d'un client aux avis actifs enverrait son solde
 * d'épargne à un numéro que personne n'a accepté, et une faute de frappe dans
 * la correction l'enverrait à un inconnu.
 *
 * `inscrireClient` a déjà tranché la question symétrique — « sinon un numéro
 * ajouté plus tard déclencherait des avis que personne n'a acceptés à ce
 * moment-là ». La règle est la même, dans l'autre sens.
 *
 * `avis_actifs: false` part **dans la même requête** que le numéro. Deux
 * écritures successives laisseraient une fenêtre — courte, mais réelle — où le
 * nouveau numéro est en base avec l'ancien consentement, et une mise encaissée
 * dedans partirait au mauvais endroit.
 *
 * ## Pourquoi `.select('id')`
 *
 * Un `update().eq()` nu ne rend aucune erreur quand RLS ou un privilège de
 * colonne écarte la ligne : PostgREST répond 204, zéro ligne touchée, `error` à
 * null. Le collecteur croirait avoir corrigé un numéro qu'il n'a pas corrigé,
 * et continuerait d'appeler le mauvais. Constaté le 2026-08-24 sur le
 * consentement aux avis, même remède ici.
 */
export async function modifierClient(
  clientId: string,
  correction: CorrectionClient,
  origine: CorrectionClient,
): Promise<{ ok: true; ecrit: boolean } | { ok: false; echec: EchecEcriture }> {
  const nom = correction.nom.trim();
  if (!nom) {
    return { ok: false, echec: { code: 'NOM_VIDE', message: 'Le nom du client est obligatoire.' } };
  }

  const champs: Record<string, string | boolean | null> = {};

  if (nom !== origine.nom.trim()) champs.nom = nom;

  // `|| null` et non la chaîne vide : le journal d'audit doit lire « le champ
  // était vide » plutôt que « le champ contenait rien ».
  for (const cle of ['telephone', 'marche', 'activite'] as const) {
    const valeur = correction[cle].trim();
    if (valeur !== origine[cle].trim()) champs[cle] = valeur || null;
  }

  // Voir la note du bloc ci-dessus : dans la même requête, jamais dans une
  // seconde.
  if ('telephone' in champs) champs.avis_actifs = false;

  if (Object.keys(champs).length === 0) return { ok: true, ecrit: false };

  const { data, error } = await supabase
    .from('clients')
    .update(champs)
    .eq('id', clientId)
    .select('id');

  if (error) return { ok: false, echec: echec(error) };
  if (!data || data.length === 0) {
    return { ok: false, echec: { code: 'RIEN_ECRIT', message: PHRASES.RIEN_ECRIT! } };
  }

  return { ok: true, ecrit: true };
}
```

- [ ] **Étape 4 : les voir passer**

```bash
cd apps/collecteur && npx vitest run src/ecritures.test.ts
```

- [ ] **Étape 5 : commit**

```bash
git add apps/collecteur/src/ecritures.ts apps/collecteur/src/ecritures.test.ts
git commit -m "feat(collecteur): modifierClient, et le consentement qui suit le numero"
```

---

### Tâche 2 : ce que la base accorde vraiment

**Fichiers :** Modifier `supabase/tests/ecritures-collecteur.test.ts`

**Pourquoi une épreuve de base en plus du bouchon :** la tâche 1 éprouve
l'aiguillage, pas les droits. La question qui décide de l'écran n'est pas
« l'objet est-il bien formé » mais « le serveur accepte-t-il ces colonnes-là,
sur cette ligne-là ». Un bouchon répond oui par construction.

Et elle garde la **borne** autant que le droit : ce fichier doit prouver qu'un
collecteur ne peut **pas** corriger le client d'un autre, ni déplacer un client
vers lui-même.

- [ ] **Étape 1 : écrire les épreuves**

Reprendre le montage du fichier (`c: CollecteurTest`, `clientId`) — il existe
déjà lignes 22-30. Ajouter :

```ts
describe('la correction d’une fiche client', () => {
  it('accepte les quatre champs que le collecteur doit pouvoir corriger', async () => {
    const { data, error } = await c.client
      .from('clients')
      .update({ nom: 'Nom corrigé', telephone: '0700000001', marche: 'Adjamé', activite: 'Tissu' })
      .eq('id', clientId)
      .select('id');

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it('refuse de déplacer un client vers un autre collecteur', async () => {
    // `clients_update` porte un `WITH CHECK` autant qu'un `USING`. Sans le
    // premier, un collecteur pourrait s'attribuer le client d'un autre en une
    // requête — et l'écran de correction serait le chemin tout trouvé.
    const { data } = await c.client
      .from('clients')
      .update({ collecteur_id: c.id })
      .eq('id', clientId)
      .select('id');

    // Le privilège de colonne n'est pas accordé sur `collecteur_id` : PostgREST
    // écarte la ligne sans lever. Zéro ligne touchée est le refus.
    expect(data ?? []).toHaveLength(0);
  });

  it('ne rend aucune ligne pour le client d’un autre collecteur', async () => {
    const autre = await creerCollecteur(`Autre ${MARQUE}`, `+225075${MARQUE}`);
    const { data } = await autre.client
      .from('clients')
      .update({ nom: 'Vol' })
      .eq('id', clientId)
      .select('id');

    // Zéro ligne, et `error` à null : c'est exactement le silence contre lequel
    // `modifierClient` compte ses lignes.
    expect(data ?? []).toHaveLength(0);
  });

  it('refuse un nom au-delà de la borne', async () => {
    const { error } = await c.client
      .from('clients')
      .update({ nom: 'x'.repeat(121) })
      .eq('id', clientId)
      .select('id');

    expect(error).not.toBeNull();
  });
});
```

> **`MARQUE` et `creerCollecteur` :** vérifier leurs noms réels en tête du
> fichier avant d'écrire. S'il n'y a pas de `MARQUE`, en fabriquer une avec
> `crypto.randomUUID().slice(0, 8)` comme le font les autres suites.

> **La deuxième épreuve peut lever au lieu de rendre zéro ligne.** Les deux sont
> des refus acceptables ; ce qui ne l'est pas, c'est que la ligne change de
> propriétaire. Si elle lève, remplacer l'assertion par `expect(error).not.toBeNull()`
> **et écrire pourquoi** — le comportement mesuré fait foi, pas ce plan.

- [ ] **Étape 2 : les voir passer**

```bash
npm run db:env && npx vitest run --config supabase/tests/vitest.config.ts supabase/tests/ecritures-collecteur.test.ts
```

Ces épreuves décrivent l'existant : elles doivent passer du premier coup. **Si
l'une échoue, arrêter le plan** — la base ne dit pas ce que le dessin croyait,
et c'est le dessin qu'il faut reprendre.

- [ ] **Étape 3 : commit**

```bash
git add supabase/tests/ecritures-collecteur.test.ts
git commit -m "test(base): ce que la correction d'une fiche client accorde, et a qui"
```

---

### Tâche 3 : le formulaire

**Fichiers :** Modifier `apps/collecteur/src/ecrans/FicheClient.tsx` · Test
`apps/collecteur/src/ecrans/FicheClient.test.tsx`

**Interfaces :** consomme `modifierClient` de la tâche 1.

- [ ] **Étape 1 : écrire les épreuves qui échouent**

`FicheClient.test.tsx` remplace déjà `../ecritures` en entier. **Ajouter
`modifierClient` à ce `vi.mock`**, sinon l'import lève :

```tsx
const modifierClient = vi.fn();

vi.mock('../ecritures', () => ({
  definirConsentementAvis: vi.fn(),
  ouvrirCarte: vi.fn(),
  enregistrerMise: (collecteurId: string, carteId: string, montant: number) =>
    enregistrerMise(collecteurId, carteId, montant),
  modifierClient: (id: string, correction: unknown, origine: unknown) =>
    modifierClient(id, correction, origine),
}));
```

```tsx
/**
 * La correction d'une fiche.
 *
 * Une faute de frappe faite au marché était définitive jusqu'au 2026-09-10 :
 * le collecteur n'écrivait dans `clients` qu'à l'inscription, et aucun écran
 * d'administration ne touche cette table.
 */
describe('corriger la fiche d’un client', () => {
  beforeEach(() => {
    modifierClient.mockReset().mockResolvedValue({ ok: true, ecrit: true });
  });

  async function ouvrirLeFormulaire(fiche = FICHE_UNE_CARTE_EN_COURS) {
    chargerFicheClient.mockResolvedValue(fiche);
    render(
      <FicheClient
        clientId="cli7"
        revision={0}
        collecteurId="col1"
        onFermer={vi.fn()}
        onEcriture={vi.fn()}
        onRetrait={vi.fn()}
      />,
    );
    fireEvent.click(await screen.findByRole('button', { name: /corriger/i }));
  }

  it('ouvre les quatre champs, remplis de ce qui est en base', async () => {
    await ouvrirLeFormulaire();

    expect((screen.getByLabelText('Nom') as HTMLInputElement).value).toBe('Koné');
    expect(screen.getByLabelText('Téléphone')).toBeTruthy();
    expect(screen.getByLabelText('Marché')).toBeTruthy();
    expect(screen.getByLabelText('Activité')).toBeTruthy();
  });

  it('envoie la correction et la valeur d’origine', async () => {
    await ouvrirLeFormulaire();

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Koné Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    await waitFor(() => expect(modifierClient).toHaveBeenCalled());
    const [id, correction, origine] = modifierClient.mock.calls[0]!;
    expect(id).toBe('cli7');
    expect(correction).toMatchObject({ nom: 'Koné Ali' });
    expect(origine).toMatchObject({ nom: 'Koné' });
  });

  it('prévient que les avis seront coupés, avant d’enregistrer', async () => {
    // Le collecteur doit savoir qu'il devra redemander le consentement. Le lui
    // apprendre après coup, c'est le laisser croire que les avis continuent.
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    expect(screen.getByText(/avis seront coupés/i)).toBeTruthy();
  });

  it('ne prévient pas quand seul le nom change', async () => {
    await ouvrirLeFormulaire(FICHE_AVEC_AVIS);

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Konaté' } });

    expect(screen.queryByText(/avis seront coupés/i)).toBeNull();
  });

  it('ne prévient pas un client qui n’avait pas accepté les avis', async () => {
    // Rien à couper : annoncer une coupure serait une phrase fausse, et sur cet
    // écran une phrase fausse coûte un appel au client pour rien.
    await ouvrirLeFormulaire();

    fireEvent.change(screen.getByLabelText('Téléphone'), { target: { value: '0700000009' } });

    expect(screen.queryByText(/avis seront coupés/i)).toBeNull();
  });

  it('montre le refus du serveur au lieu de fermer', async () => {
    modifierClient.mockResolvedValue({
      ok: false,
      echec: { code: 'RIEN_ECRIT', message: 'Le serveur n’a rien changé. Reconnecte-toi et réessaie.' },
    });
    await ouvrirLeFormulaire();

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Koné Ali' } });
    fireEvent.click(screen.getByRole('button', { name: /enregistrer/i }));

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByLabelText('Nom')).toBeTruthy();
  });

  it('revient à la fiche sans écrire quand on annule', async () => {
    await ouvrirLeFormulaire();

    fireEvent.change(screen.getByLabelText('Nom'), { target: { value: 'Perdu' } });
    fireEvent.click(screen.getByRole('button', { name: /annuler/i }));

    expect(modifierClient).not.toHaveBeenCalled();
    expect(screen.queryByLabelText('Nom')).toBeNull();
  });

  it('donne aux deux boutons une cible de 44 px', async () => {
    await ouvrirLeFormulaire();

    for (const nom of [/enregistrer/i, /annuler/i]) {
      expect(screen.getByRole('button', { name: nom }).className).toMatch(/min-h-11/);
    }
  });
});
```

> **Il faut ajouter un jeu de données.** Relevé en relisant ce plan le
> 2026-09-10 : **les sept fiches de ce fichier portent toutes
> `avisActifs: false`**, et `FICHE_UNE_CARTE_EN_COURS` (client `cli7`, nom
> `Koné`) a `telephone: null`. L'épreuve de l'avertissement ne se
> déclencherait donc jamais — elle passerait au vert sans rien voir. Ajouter,
> à côté des autres :
>
> ```tsx
> /** Un client joignable **et** consentant : le seul cas où corriger le numéro
>     coupe quelque chose. Les sept autres fiches ont `avisActifs: false`. */
> const FICHE_AVEC_AVIS = {
>   ...FICHE_UNE_CARTE_EN_COURS,
>   id: 'cli8',
>   nom: 'Konaté',
>   telephone: '0709201790',
>   marche: 'BLE ZOKOU',
>   avisActifs: true,
> };
> ```
>
> et rendre avec `clientId="cli8"` quand ce jeu est utilisé — sinon l'effet qui
> remet l'écran à zéro sur changement de client ne se déclenche pas comme
> attendu. Adapter `ouvrirLeFormulaire` en conséquence.

> **`Bouton` porte `min-h-11`** — relevé ligne 55 de `packages/ui/src/Bouton.tsx`,
> dans la chaîne de classes commune à toutes les variantes. Resserrer la
> dernière épreuve sur `min-h-11` seul plutôt que d'accepter `h-11` aussi.

> **Les variantes de `Bouton` sont `primaire`, `contour`, `fantome`**, et il
> accepte `disabled`. Vérifié lignes 8-19.

- [ ] **Étape 2 : les voir échouer**

```bash
cd apps/collecteur && npx vitest run src/ecrans/FicheClient.test.tsx -t "corriger la fiche"
```

Attendu : `Unable to find role="button" and name /corriger/i`.

- [ ] **Étape 3 : implémenter**

Dans `apps/collecteur/src/ecrans/FicheClient.tsx`. Ajouter `Champ` à l'import
de `@kolek/ui` et `modifierClient, type CorrectionClient` à celui de
`../ecritures`.

Le composant, à poser près de `Coordonnees` :

```tsx
/**
 * Le formulaire de correction d'une fiche client.
 *
 * ## Pourquoi il vit dans la fiche et non dans un écran à lui
 *
 * La fiche est l'endroit où le collecteur constate l'erreur — c'est là qu'il
 * lit « GSM T · BLE ZOKOU · 0709201790 ». Le faire voyager vers un autre écran
 * pour réparer ce qu'il regarde est un détour que rien ne justifie.
 *
 * ## L'avertissement sur les avis
 *
 * Il paraît **avant** d'enregistrer, dès que le numéro saisi diffère de celui
 * en base. L'apprendre après coup, c'est laisser le collecteur croire que les
 * avis continuent — sur un numéro que personne n'a accepté.
 */
function CorrigerFiche({
  fiche,
  onFini,
  onAnnuler,
}: {
  fiche: Fiche;
  onFini: () => Promise<void>;
  onAnnuler: () => void;
}) {
  const origine: CorrectionClient = {
    nom: fiche.nom,
    telephone: fiche.telephone ?? '',
    marche: fiche.marche ?? '',
    activite: fiche.activite ?? '',
  };

  const [saisie, setSaisie] = useState<CorrectionClient>(origine);
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const numeroChange = saisie.telephone.trim() !== origine.telephone.trim();

  async function enregistrer() {
    setEnvoi(true);
    setErreur(null);
    const resultat = await modifierClient(fiche.id, saisie, origine);
    setEnvoi(false);

    if (!resultat.ok) {
      setErreur(resultat.echec.message);
      return;
    }
    await onFini();
  }

  const poser = (cle: keyof CorrectionClient) => (valeur: string) =>
    setSaisie((s) => ({ ...s, [cle]: valeur }));

  return (
    <div className="bg-canvas rounded-md p-3 space-y-3">
      {erreur && (
        <p role="alert" className="bg-negative-tint text-negative text-sm font-body p-3 rounded-md">
          {erreur}
        </p>
      )}

      <Champ libelle="Nom" valeur={saisie.nom} onChange={poser('nom')} requis />
      <Champ
        libelle="Téléphone"
        type="tel"
        inputMode="tel"
        valeur={saisie.telephone}
        onChange={poser('telephone')}
      />
      <Champ libelle="Marché" valeur={saisie.marche} onChange={poser('marche')} />
      <Champ libelle="Activité" valeur={saisie.activite} onChange={poser('activite')} />

      {numeroChange && fiche.avisActifs && (
        <p className="font-body text-xs text-muted-foreground bg-surface rounded-md p-3 m-0">
          Les avis seront coupés : {fiche.nom} avait accepté de les recevoir sur son ancien
          numéro. Redemande-lui son accord depuis sa fiche.
        </p>
      )}

      <div className="flex gap-2">
        <Bouton onClick={() => void enregistrer()} disabled={envoi}>
          {envoi ? 'Enregistrement…' : 'Enregistrer'}
        </Bouton>
        <Bouton variante="contour" onClick={onAnnuler} disabled={envoi}>
          Annuler
        </Bouton>
      </div>
    </div>
  );
}
```

Puis, dans `FicheClient`, un état et le branchement. La ligne 211 rend
aujourd'hui `<Coordonnees … />` ; la remplacer par :

```tsx
          {correction ? (
            <CorrigerFiche
              fiche={fiche}
              onFini={async () => {
                setCorrection(false);
                await relire();
                onEcriture();
              }}
              onAnnuler={() => setCorrection(false)}
            />
          ) : (
            <>
              <Coordonnees fiche={fiche} onChange={onEcriture} onRelire={relire} />
              <Bouton variante="fantome" onClick={() => setCorrection(true)}>
                Corriger la fiche
              </Bouton>
            </>
          )}
```

avec, près des autres états :

```tsx
  const [correction, setCorrection] = useState(false);
```

et, dans l'effet qui remet `visibleId` à zéro sur changement de client :

```tsx
    // Le formulaire se referme avec le client : rester dedans en changeant de
    // client corrigerait la fiche de l'un avec la saisie de l'autre.
    setCorrection(false);
```

> **`fiche.avisActifs` :** vérifier le nom réel du champ dans l'interface
> `FicheClient` de `lectures-ecrans.ts` — `chargerFicheClient` rend
> `avisActifs`. Ne pas écrire `avis_actifs` ici : c'est le nom de la colonne,
> pas celui de l'objet.

- [ ] **Étape 4 : les voir passer, et ne rien avoir cassé**

```bash
cd apps/collecteur && npx vitest run
cd ../.. && npx tsc --noEmit -p apps/collecteur/tsconfig.json && npx oxlint apps/collecteur/src
```

- [ ] **Étape 5 : le contrôle des 16 px**

```bash
npm run verifier:champs
```

Attendu : « Les N champs du dépôt tiennent les 16 px. » Quatre de plus
qu'avant. S'il refuse, c'est que le formulaire est passé à côté de `Champ` — le
corriger, ne pas contourner le contrôle.

- [ ] **Étape 6 : commit**

```bash
git add apps/collecteur/src/ecrans/FicheClient.tsx apps/collecteur/src/ecrans/FicheClient.test.tsx
git commit -m "feat(collecteur): corriger la fiche d'un client depuis sa fiche"
```

---

### Tâche 4 : la vérification entière

- [ ] **Étape 1 : la chaîne complète**

```bash
{ npm run verifier; echo "SORTIE_NPM=$?"; } > /chemin/verifier.log 2>&1
```

> **Lire le journal, pas seulement le code de sortie.** Les quatorze étapes
> doivent y paraître une par une. Le 2026-09-10, un `echo` mal placé a rendu `0`
> sur une chaîne arrêtée à la quatrième étape sur quatorze.

- [ ] **Étape 2 : l'essayer à la main, sur la pile locale**

Les épreuves ne voient pas ce qu'un doigt voit. Sur `localhost:5173`, contre la
**base locale** :

1. Ouvrir la fiche d'un client, cliquer « Corriger la fiche ».
2. Changer le seul nom, enregistrer. La fiche se relit, le titre change,
   **aucun avertissement sur les avis n'a paru**.
3. Rouvrir, changer le numéro d'un client aux avis actifs. **L'avertissement
   paraît avant d'enregistrer.** Enregistrer, puis vérifier que le bloc
   `Coordonnees` propose de nouveau de demander le consentement.
4. Rouvrir, vider le marché, enregistrer, et lire la ligne en base :

```bash
npx supabase db query --local "select nom, telephone, marche, activite, avis_actifs from clients where id = '<id>'"
```

`marche` doit être `null`, et non une chaîne vide.

> **Ne pas faire cet essai contre la production.** Mesuré le 2026-09-11 :
> `apps/collecteur/.env` porte `VITE_SUPABASE_URL=https://yfnwmokxkznejotgpfgf.supabase.co`.
> Un `npm run dev` nu ouvre donc l'application **sur les 81 clients réels**, et
> « Enregistrer » y corrigerait une vraie fiche.

**La recette qui ne touche à aucun fichier `.env` :**

Vite donne la priorité aux variables **déjà présentes dans l'environnement** du
processus sur celles des fichiers `.env`. Les passer en ligne suffit, et rien ne
reste sur le disque ensuite. `gardeEnv()` accepte `http://127.0.0.1:54321`
(motif `ADRESSES` de `scripts/garde-env.mjs`).

```bash
# Depuis la racine, pile locale démarrée. La clé anonyme locale est lue et
# passée sans jamais être affichée.
cd apps/collecteur && \
  VITE_SUPABASE_URL=http://127.0.0.1:54321 \
  VITE_SUPABASE_ANON_KEY="$(cd ../.. && npx supabase status -o env 2>/dev/null | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p')" \
  npx vite --port 5175
```

Trois précautions, chacune pour une raison :

- **Port 5175, pas 5173.** Le 5173 est celui du serveur habituel, branché sur
  la production. Un onglet resté ouvert sur 5173 ressemble exactement à celui
  de l'essai. Un port distinct rend la confusion visible dans la barre d'adresse.
- **Vérifier la cible avant de se connecter** : dans la console du navigateur,
  les requêtes doivent partir vers `127.0.0.1:54321`. Une seule requête vers
  `supabase.co` : fermer l'onglet, tout arrêter.
- **Jamais de copie de `.env`** (`.env.bak`, `.env.old`…) pour « basculer »
  temporairement : `verifier:bundles` les refuse, et une copie oubliée est
  exactement la fuite de 2026-09-02 à 2026-09-09.

Le compte d'essai se crée sur la **pile locale uniquement**, par l'API
d'administration locale — même geste que `creerCollecteur` dans
`supabase/tests/harnais.ts`, qui passe par `npm run db:env` et donc par
`scripts/garde-base-locale.mjs`. Il disparaît au prochain `npm run db:reset`.

- [ ] **Étape 3 : après la poussée**

`app.kolek.cash` est déployé par **Netlify**, sur poussée vers `main`, et plus
vite que le CI. Vérifier par le **contenu** et non par l'empreinte :

```bash
node -e '(async()=>{
  const r = await fetch("https://app.kolek.cash/", { cache: "no-store" });
  const nom = [...(await r.text()).matchAll(/assets\/(index-[A-Za-z0-9_-]+\.js)/g)].map(x => x[1])[0];
  const src = await (await fetch("https://app.kolek.cash/assets/" + nom, { cache: "no-store" })).text();
  console.log(nom, src.includes("Corriger la fiche") ? "— present" : "— ABSENT");
})()'
```

---

## Écarts d'exécution — 2026-09-11

Ce qui a été fait autrement que ce plan ne l'écrivait, et pourquoi. Chaque
écart est dans un commit qui porte son motif.

**Les fins de ligne.** `ecritures.ts`, `FicheClient.tsx` et
`FicheClient.test.tsx` sont en **CRLF** ; `ecritures-collecteur.test.ts` est en
LF. Sous Git Bash, `grep` retire les `\r` en fin de ligne par défaut, et
`cat -A` ne les montre pas davantage : les deux disaient « LF » sur un fichier
à 374 retours chariot pour 374 lignes. Seul Node lit les octets bruts. Deux
ancres d'insertion ont échoué avant que la cause soit trouvée. Toutes les
poses ont ensuite été faites en LF en mémoire et réécrites dans la convention
du fichier, contrôlées par Node. `core.autocrlf=true` normalisait déjà au
commit : aucun fichier mêlé n'est entré dans le dépôt, et `git diff` vide sur
le fichier remis d'aplomb le prouve.

**Tâche 1.** Une épreuve de plus — « écrit la valeur débarrassée de ses
espaces ». L'épreuve du 42501 vise `DROIT_REFUSE` (voir la note de la tâche).

**Tâche 2.** Six épreuves au lieu de quatre. Ajoutées : l'écriture combinée
numéro + `avis_actifs: false` acceptée par la base (le contrat de
`modifierClient`, qu'un bouchon ne peut pas prouver), et la trace au journal,
qui fixe le fait corrigé dans le dessin — le journal porte l'état nouveau.
Cette dernière filtre sur `donnees->>marche` au lieu de trier par `id` : rien
ne garantit qu'un identifiant de journal soit chronologique.

**Tâche 3.** Le formulaire est un vrai `<form aria-label="Corriger la fiche">`
et non un `<div>` : la touche « OK » du clavier Android l'envoie, et les
épreuves visent ses boutons par `within` — la fiche porte d'autres « Annuler ».
`verifier:champs` compte toujours **36** champs et non 40 comme ce plan
l'annonçait : il lit les balises `<input>`, et celle-ci vit une seule fois,
dans `Champ.tsx`.

**Relecture après la tâche 3 — deux défauts, corrigés avant la mise en ligne.**

1. *La saisie s'effaçait.* La mise différée de `CartesEnCours` part six
   secondes après l'appui et appelle `onEcriture` ; la fiche repasse par `null`
   et le formulaire se démonte. Le brouillon remonte dans `FicheClient`, sur le
   modèle de `visibleId`. Reproduit d'abord par une épreuve :
   `expected '0709201790' to be '0700000009'`.
2. *L'avertissement était muet.* Inséré avec son texte, il n'était pas annoncé.
   La région vive est désormais montée avec le formulaire.

**Limites connues, laissées en l'état.**

- Un numéro seulement **reformaté** — `0709201790` devenu `07 09 20 17 90` —
  compte comme un numéro changé et coupe les avis. Comparer les seuls chiffres
  ne suffirait pas (`+2250709201790` est le même numéro avec d'autres
  chiffres) ; il faudrait normaliser les numéros, ce que le dessin écarte
  explicitement. Le collecteur verra l'avertissement avant d'enregistrer, et
  pourra annuler.
- Le bouton « Ne plus prévenir » du bloc `Coordonnees` fait `py-1.5` en
  `text-xs`, bien sous les 44 px. Défaut antérieur à ce travail, hors de son
  périmètre.

---

## Ce qui reste après ce plan

- **Le journal des corrections n'est pas montré au collecteur.** Il est en base,
  lisible par le Super Admin. L'exposer est un autre travail.
- **`photo_url` n'est alimentée nulle part** dans le produit, bien que la
  colonne existe et que le droit d'écriture soit accordé.
- **Aucune validation de format sur le téléphone**, par choix documenté dans le
  dessin : refuser `0709201790` ou `+2250709201790` au marché ferait plus de
  dégâts qu'une saisie libre.
