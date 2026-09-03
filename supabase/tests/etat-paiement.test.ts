import { describe, expect, it } from 'vitest';

import { etatPaiement } from '../functions/_shared/etat-paiement';

/**
 * Ce que les réglages disent du paiement — et ce qu'ils ne disent jamais.
 *
 * La fonction est pure et prend son environnement en argument : c'est ce qui
 * permet de vérifier, par un test et non par une relecture, que la clé ne sort
 * pas. Un contrôle de fuite qui repose sur la vigilance du prochain lecteur
 * n'est pas un contrôle.
 */

const CLE = 'chariow_sk_live_ABCDEFGHIJKLMNOP';

describe('l’état du paiement', () => {
  it('ne rend jamais la clé, seulement ses quatre derniers caractères', () => {
    const etat = etatPaiement({ cle: CLE, produits: '', secretWebhook: '' });

    expect(JSON.stringify(etat)).not.toContain(CLE);
    expect(JSON.stringify(etat)).not.toContain('ABCDEFGHIJKLMNOP');
    expect(etat.cleIndice).toBe('MNOP');
    expect(etat.cleConfiguree).toBe(true);
  });

  it('dit qu’il n’y a pas de clé plutôt que d’en inventer une vide', () => {
    const etat = etatPaiement({ cle: '', produits: '', secretWebhook: '' });

    expect(etat.cleConfiguree).toBe(false);
    expect(etat.cleIndice).toBeNull();
  });

  it('ne prend pas des espaces pour une clé', () => {
    // Une variable posée puis vidée laisse souvent un blanc. « Configurée »
    // enverrait chercher la panne du côté de Chariow.
    const etat = etatPaiement({ cle: '   ', produits: '', secretWebhook: '' });

    expect(etat.cleConfiguree).toBe(false);
  });

  it('nomme les paliers dont le produit manque', () => {
    // Un produit manquant ne se voit pas avant qu'un collecteur choisisse ce
    // palier — et il choisit celui qu'on n'a pas déclaré, forcément un jour.
    //
    // `lireProduits` **lève** dans ce cas, et c'est juste pour un checkout :
    // mieux vaut refuser au démarrage que vendre un palier sans produit. Mais
    // un écran de diagnostic qui lève n'affiche rien — il doit au contraire
    // savoir décrire une configuration incomplète. D'où une lecture tolérante,
    // propre à ce module.
    const etat = etatPaiement({
      cle: CLE,
      produits: '{"standard":"prod_1","illimite":"prod_3"}',
      secretWebhook: '',
    });

    expect(etat.produits).toEqual([
      { palier: 'standard', configure: true },
      { palier: 'pro', configure: false },
      { palier: 'illimite', configure: true },
    ]);
  });

  it('ne se casse pas sur un CHARIOW_PRODUITS illisible', () => {
    // Le cas d'une variable mal collée. L'écran doit le dire, pas tomber.
    const etat = etatPaiement({ cle: CLE, produits: 'pas du json', secretWebhook: '' });

    expect(etat.produits.every((p) => !p.configure)).toBe(true);
  });

  it('ne rend jamais un identifiant de produit', () => {
    // Un identifiant de produit n'est pas un secret, mais il n'a rien à faire
    // sur un écran : ce qui est demandé est « est-ce déclaré », pas « quoi ».
    const etat = etatPaiement({
      cle: CLE,
      produits: '{"standard":"prod_SECRET1","pro":"prod_SECRET2","illimite":"prod_SECRET3"}',
      secretWebhook: '',
    });

    expect(JSON.stringify(etat)).not.toContain('prod_SECRET');
  });

  it('refuse un secret de webhook trop court', () => {
    // Le secret voyage dans l'URL du webhook. Court, il se devine ; et un
    // webhook qui se devine crédite des abonnements que personne n'a payés.
    expect(etatPaiement({ cle: CLE, produits: '', secretWebhook: 'court' }).webhookConfigure).toBe(
      false,
    );
    expect(
      etatPaiement({ cle: CLE, produits: '', secretWebhook: 'x'.repeat(32) }).webhookConfigure,
    ).toBe(true);
  });

  it('ne rend jamais le secret de webhook, sous aucune forme', () => {
    const secret = 'z'.repeat(64);
    const etat = etatPaiement({ cle: CLE, produits: '', secretWebhook: secret });

    expect(JSON.stringify(etat)).not.toContain('zzzz');
  });

  it('tient sur une variable absente comme sur une variable vide', () => {
    // `Deno.env.get` rend `undefined`, pas `''`. Les deux chemins doivent
    // mener au même écran.
    const absente = etatPaiement({ cle: undefined, produits: undefined, secretWebhook: undefined });

    expect(absente.cleConfiguree).toBe(false);
    expect(absente.webhookConfigure).toBe(false);
    expect(absente.produits.every((p) => !p.configure)).toBe(true);
  });
});
