# La passerelle SMS refuse ses identifiants depuis le 2026-08-29

**Date :** 2026-08-31 · **Objet :** Africa's Talking répond `401` à chaque envoi.
Aucun avis client n'est parti depuis l'ouverture du canal.

**Verdict : ouvert, et la cause n'est plus chez nous.** Cinq jeux d'identifiants
ont été essayés, cinq refus. Tout ce qui pouvait être mis en cause de notre côté
a été mesuré et écarté. Ce qui reste est un couple `(nom d'application, clé)` qui
n'en est pas un chez Africa's Talking.

| | |
|---|---|
| Symptôme | `401 The supplied authentication is invalid` |
| Portée | Les 4 avis en file sont `abandonne`. Aucun client n'a jamais reçu de SMS |
| Écarté | La forme de la requête, l'expéditeur, le numéro, l'environnement, la forme des deux valeurs |
| Reste | Le couple lui-même : nom et clé ne viennent pas de la même application, ou la clé a été régénérée depuis |
| Porte de sortie | Twilio, déjà implémenté derrière le même contrat. Trois champs, aucun code |

---

## Ce que la file dit

```sql
select statut, tentatives, count(*) from public.avis_clients group by 1, 2;
```

Quatre lignes, `statut = abandonne`, `tentatives = 1`. `abandonne` est définitif :
un refus d'identifiants n'est pas réessayable, et le rejouer indéfiniment
masquerait la cause sous le bruit. **Ces quatre avis ne repartiront pas d'eux-mêmes,
et c'est voulu** — « vous venez de faire un dépôt » qui arrive deux jours plus tard
vaut mieux non envoyé. Les prochaines transactions mettront des avis frais en file.

## Le journal des essais

Chaque ligne est une mesure, pas une supposition. Les longueurs viennent de la
sonde ; aucune valeur n'a jamais été lue, ni ici, ni ailleurs.

| Heure (UTC) | `SMS_COMPTE` | `SMS_SECRET` | Verdict |
|---|---|---|---|
| 08-30 19:31 | 32 car. | 77 car. | `COMPTE_REFUSE 401` |
| 08-31 20:50 | 51 car. | inchangé | `COMPTE_REFUSE 401` |
| 08-31 21:09 | 14 car., **contient un espace** | 77 car., préfixe `atsk_` | `COMPTE_REFUSE 401` |
| 08-31 21:22 | 5 car., propre | inchangé | `COMPTE_REFUSE 401` |

Trois corrections de bonne foi, trois fois la même réponse. C'est ce qui a rendu
la sonde nécessaire : sans elle, on corrigeait à l'aveugle un champ qui n'était
peut-être pas en cause.

## Ce qui est écarté, et par quelle mesure

**La forme de la requête.** La sonde interroge `GET /version1/user`, qui ne prend
ni destinataire, ni message, ni expéditeur. Un `401` là ne peut venir que du
couple d'identifiants. Cela écarte d'un coup l'homologation de l'expéditeur, le
format du numéro, et la construction du corps de l'envoi.

**L'environnement.** Africa's Talking ouvre tout compte neuf sur une application
de bac à sable, dont la clé rend le même `401` en production. La sonde interroge
maintenant **les deux hôtes** après un refus. Le bac à sable refuse aussi. Ce
n'est pas un problème d'environnement.

**La forme du nom d'application.** Il a porté 32, puis 51, puis 14 caractères
dont un espace — trois valeurs dont aucune ne peut être un nom d'application.
Il en porte 5 aujourd'hui, sans caractère parasite.

**La forme de la clé.** Préfixe `atsk_`, et tout ce qui suit est hexadécimal,
sans un caractère de trop. Elle n'est plus suspecte.

**Le message d'Africa's Talking.** `{"errorMessage":"The supplied authentication
is invalid"}` — le même pour un utilisateur inconnu et pour une clé fausse. Leur
API ne distingue pas les deux, et **c'est là que notre mesure s'arrête.**

## Ce qu'il reste, et comment le trancher

Une seule hypothèse tient encore : **les deux valeurs ne forment pas un couple.**
Chez Africa's Talking, chaque application a son propre nom d'utilisateur et sa
propre clé. Trois façons d'en obtenir un faux :

1. le nom vient d'une application, la clé d'une autre ;
2. la clé a été régénérée après avoir été copiée — l'ancienne meurt à l'instant ;
3. le compte n'a qu'une application de bac à sable, et aucun nom de production
   n'existe encore.

**La marche à suivre, en une passe.** Ouvrir l'application chez Africa's Talking,
aller à ses identifiants d'API, et copier **les deux valeurs l'une après l'autre,
sans quitter la page** : `SMS_COMPTE` d'abord, `SMS_SECRET` ensuite. Les déposer
dans Supabase → Project Settings → Edge Functions → Secrets.

**Ne jamais changer l'un sans l'autre.** Les quatre essais ci-dessus ont tous
modifié un seul champ. Un couple ne se corrige pas par moitiés.

## La sonde

```
POST /functions/v1/envoyer-avis
{"sonde": true}
```

Elle n'envoie aucun message, ne touche pas la file, ne coûte rien, et rend le
verdict. Elle vit dans `supabase/functions/_shared/passerelle-sms.ts`
(`verifierIdentifiants`) et se déclenche depuis `envoyer-avis`.

Elle rend la **forme** des identifiants — longueur, préfixe, décompte
hexadécimal, caractères qui n'ont rien à faire là — et jamais un caractère de
leur valeur. C'est ce décompte qui a trouvé l'espace dans le nom d'application,
invisible dans un champ de tableau de bord.

Une règle a été posée à l'envers en chemin, puis retournée : le premier partage
retenait le message d'Africa's Talking et laissait sortir le reste. C'était
exactement l'inverse du bon. Le message d'un refus est ce qu'il faut lire et ne
porte rien de secret ; ce qui ne doit pas sortir, c'est la réponse d'un compte
**reconnu**, qui porte son solde. La règle vit maintenant là où la donnée naît :
`verifierIdentifiants` ne met jamais l'état du compte dans son verdict.

## La porte de sortie

Twilio est implémenté derrière le même contrat, testé, et n'attend rien.
Basculer se fait par trois secrets, sans une ligne de code ni un déploiement :

```
SMS_FOURNISSEUR = twilio
SMS_COMPTE      = le SID du compte
SMS_SECRET      = le jeton d'authentification
SMS_EXPEDITEUR  = obligatoire chez Twilio, facultatif chez Africa's Talking
```

L'homologation de l'expéditeur auprès des opérateurs ivoiriens est une démarche
réglementaire : elle s'applique **aux deux** fournisseurs, et ne peut donc pas
servir à les départager.

Cette porte n'est pas à ouvrir aujourd'hui. Elle est écrite ici pour que la
décision, le jour où elle se pose, se prenne en connaissance du coût réel — trois
champs — et non sous l'impression qu'il faudrait tout refaire.

## Ce que Kolek ne fait pas pendant ce temps

**Il ne prétend rien.** Aucun avis n'est marqué `envoye` sans retour de la
passerelle. Un système qui prétendrait avoir prévenu sans avoir prévenu serait
pire que son absence : le client croirait détenir une trace, et personne ne le
découvrirait avant une contestation.

**Il ne force aucun consentement.** `clients.avis_actifs` n'a pas été touché, et
ne le sera pas : le solde d'épargne de quelqu'un n'a pas à arriver sur l'appareil
d'un tiers sans son accord.
