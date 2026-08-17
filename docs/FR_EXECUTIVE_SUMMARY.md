# Résumé exécutif (FR)

**Produit :** Wingman · **Version :** V3.1 · **Statut :** verrouillé par le responsable · **Responsable :** Igor Chernikov
**Slogans :** *Facilitez la première rencontre.* / *L'amour est dans l'air.*
**Catégorie :** technologie de facilitation d'interaction sociale

## Le produit en une phrase

Wingman facilite la première interaction dans le monde réel entre des personnes déjà proches — ou qui se croisent à
plusieurs reprises via Destiny Connection — sans swipe, sans profils publics, sans chat interminable, sans rejet
explicite. « facilitateur de connexion dans le monde réel » est une explication, pas une catégorie.

## Ce que Wingman n'est pas

Ni réseau social, ni catalogue de profils, ni messagerie infinie, ni plateforme de contenu, ni application de
swipe. Règle produit centrale : toute fonctionnalité qui augmente le temps passé dans l'app sans augmenter la
chance d'une rencontre réelle est rejetée.

## Séquence du protocole

`RADAR → SIGNAL → SELFIE (initiateur) → SELFIE (destinataire) → VALIDATION MUTUELLE → TICKET ou MISSION MEET →
MODE MISSION → RÉSULTAT → COOLDOWN → RADAR`. Voie parallèle : `PROMPT DESTINY → SIGNAL DESTINY → protocole`.

## Hiérarchie et gouvernance

- **V3.1** : autorité produit verrouillée par le responsable.
- **S35** : expérience opt-in, désactivée par défaut ; aucun merge d'état, d'API ou de domaine avant un GO A/B.
- **Evidence Pack** : niveau de preuve sur deux téléphones réels. **PRODUCT PROTOCOL READY = NO** jusqu'à ce que
  toutes les lignes du pack soient PASS sans assistance développeur.

## Décisions d'architecture (V3.1)

- **Monolithe modulaire NestJS**, région européenne unique. Pas de Rust, pas de base distribuée, pas de
  microservices en V1 — l'infrastructure mondiale était surdimensionnée alors que le domaine métier était
  sous-modélisé.
- **PostgreSQL** pour le durable, **Redis** pour l'éphémère (présence, sessions, chat), **stockage objet chiffré
  privé** pour les selfies.
- **Timers autoritaires côté serveur.** Le mode hors ligne ne met jamais un compte à rebours en pause.
- **Une seule connexion active par utilisateur**, garantie par un verrou en base (`ActiveUserLock`, clé primaire
  = userId).
- **Expiration silencieuse uniquement** — jamais de notification de rejet.

## Confidentialité et sécurité

Consentement **par finalité, append-only, versionné** (le service de base repose sur la nécessité contractuelle,
pas le consentement). Téléphone protégé par **HMAC déterministe** (recherche/unicité) + **AES-256-GCM** (avec
version de clé), jamais stocké en clair. Selfies : identifiants opaques, URL signées très courtes, jamais d'URL
publique dans Redis, suppression immédiate. Le chat éphémère reste **modérable** : la preuve n'est scellée
(chiffrée, hors PostgreSQL) que si un signalement survient, chaque accès étant journalisé. Aucun bannissement
permanent automatique. Conçu pour soutenir la conformité RGPD, sous réserve d'une revue juridique.

## Modèle économique

Gratuit : Radar complet, 2 signaux/jour, 1 ticket jusqu'à 2 h, Pulse visible, Mission Meet 15 min, Destiny, Mood.
Wingman+ à 9,99 €/mois : **20–25 signaux/jour**, 2 tickets jusqu'à 24 h + renouvellement, cache selfie vérifié,
priorité de découverte (augmente la probabilité, ne garantit jamais l'exposition), notifications Pulse, fenêtres
+5 min, Mission Meet 20 min. Achats ponctuels : Night Pass, Event Pass, Selfie vérifié, Rematch, Cool Down Skip.
Jamais de profils boostés, de publicités dans le flux, ni de revente de données comportementales.

## Destiny Connection

Fonctionnalité sensible, privée, **désactivée par défaut**, opt-in distinct, mise en pause possible. Co-présence grossière
sur des croisements publics répétés ; aucune trajectoire, date, adresse ou position exacte. DPIA et analyse
anti-stalking requis ; probablement post-V1. Le mécanisme n'est pas qualifié de « k-anonymat ».

## Design

Identité nocturne premium : nuit `#0B1020` + violet `#7C5CFC` + lavande `#B9A7FF`, rose `#FF7DAE` réservé à la
validation mutuelle. Les mood dots (rouge/ambre/blanc) se distinguent par la forme et l'animation, pas seulement
la couleur. Radar abstrait mais lisible, onde de Signal diffuse (pas de ciblage), timer calme (texte + barre fine),
haptique complet, respect de « réduire les animations ».

## Prochaine étape

Le prototype (`prototype/index.html`) est fonctionnel et fidèle. Le prompt d'amorçage du dépôt applicatif réel se
trouve dans `implementation/REPOSITORY_BOOTSTRAP_PROMPT.md`.
