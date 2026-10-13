# StreamFlix

Catalogue de séries écrit en HTML, CSS et JavaScript natifs, alimenté par l'API publique [TVMaze](https://www.tvmaze.com/api).
Le site aide à choisir quoi regarder : recherche, filtre par genre, tri, fiche détaillée de chaque série et liste personnelle
de programmes à voir, que l'on peut ensuite envoyer sous forme de sélection.

## Fonctionnalités

- **Catalogue** (`index.html`) : séries de la première page de l'API, recherche par titre en temps réel (sans distinction
  de casse ni d'accents, à partir de 2 caractères, avec un debounce de 300 ms), filtre par genre (genres déduits des
  données reçues), tri par note ou par année dans les deux sens, nombre de résultats annoncé aux lecteurs d'écran.
- **Fiche série** (`serie.html?id={id}`) : affiche, note en étoiles avec son équivalent textuel, année, chaîne, statut,
  genres et résumé ; ajout ou retrait de Ma liste. Un identifiant absent, non numérique ou inconnu affiche « Fiche introuvable ».
- **Ma liste** (`liste.html`) : séries retenues, priorité modifiable (entier de 1 à 10, validé avant l'envoi), suppression
  d'une ligne, envoi de la sélection par `POST` avec message de confirmation ou d'erreur.
- **États de l'interface** : chaque zone alimentée par le réseau affiche un état de chargement, de succès, de résultat vide
  ou d'erreur (avec un bouton « Réessayer »).

## Prérequis

- Un navigateur récent : Chrome, Edge, Firefox ou Safari.
- Un serveur de fichiers statiques : les modules JavaScript (`type="module"`) ne se chargent pas depuis `file://`.
- Une connexion Internet, pour joindre l'API TVMaze et le service d'envoi.

Aucune dépendance à installer, aucune étape de build.

## Lancement

Depuis la racine du projet :

```bash
python -m http.server 8000
```

Puis ouvrir <http://localhost:8000>. Dans VS Code, l'extension Live Server fonctionne aussi (« Open with Live Server » sur `index.html`).

## Arborescence

```text
streamflix/
├── index.html              Catalogue
├── serie.html              Fiche détaillée
├── liste.html              Ma liste
├── css/
│   ├── style.css           Système de design (:root) et styles de la version mobile
│   └── responsive.css      Paliers tablette et desktop, prefers-reduced-motion
├── js/
│   ├── api.js              Tous les appels réseau
│   ├── utils.js            Mise en forme des données, stockage de Ma liste, outils DOM
│   └── main.js             Initialisation et rendu des trois pages
├── assets/
│   └── images/             Favicon, affiche de remplacement, image de partage
├── .prettierrc.json        Règles de formatage (Prettier)
└── README.md
```

## Organisation du code

- **`api.js`** contient l'unique constante `API_BASE_URL` : basculer vers l'API de production revient à modifier cette
  ligne (et `SELECTION_URL` pour l'envoi). `getShows()`, `getShowById(id)`, `searchShows(texte)` et `sendSelection(payload)`
  passent toutes par `request()`, qui distingue l'erreur réseau (`ApiError` sans statut), la réponse HTTP en erreur
  (`ApiError` avec son `status`) et le succès.
- **`main.js`** est le seul script référencé par les pages (`<script type="module">`). Il importe `api.js` et `utils.js`,
  puis lance l'initialisation de la page indiquée par l'attribut `data-page` du `<body>`.
- **Gabarits HTML** : la carte du catalogue et la ligne de Ma liste sont décrites dans des balises `<template>`, clonées
  puis remplies par `main.js`. Aucune donnée de série n'est écrite dans le HTML.
- **Ma liste** est conservée dans `localStorage` (clé `streamflix-watchlist`), ce qui la fait survivre au changement de page.
- **Résumés** : le champ `summary` de l'API contient du HTML. Il est analysé avec `DOMParser` et seul son texte est
  affiché ; aucun contenu de l'API ne passe par `innerHTML`.
- **CSS** : toutes les couleurs, espacements, rayons et tailles de texte sont des variables de `:root`. Approche mobile
  first, avec des media queries en `min-width` (768 px puis 1025 px).
- **Formatage** : Prettier, configuré dans `.prettierrc.json` (lignes de 120 caractères, guillemets simples en
  JavaScript). Le site n'en dépend pas pour fonctionner.

## Endpoints consommés

| Méthode | URL                                             | Usage                                                                                                  |
| ------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `GET`   | `https://api.tvmaze.com/shows?page=0`           | Catalogue                                                                                              |
| `GET`   | `https://api.tvmaze.com/shows/{id}`             | Fiche détaillée                                                                                        |
| `GET`   | `https://api.tvmaze.com/search/shows?q={texte}` | Exposé par `searchShows()`, non branché sur l'interface (le filtrage du catalogue se fait côté client) |
| `POST`  | `https://jsonplaceholder.typicode.com/posts`    | Envoi de la sélection (service de recette)                                                             |

Charge utile envoyée, séries triées par priorité :

```json
{
  "userId": 1,
  "date": "2026-10-13",
  "shows": [
    { "showId": 1, "priority": 1 },
    { "showId": 169, "priority": 3 }
  ]
}
```

## Accessibilité

- Alternative textuelle sur chaque affiche (« Affiche de … » ou « Affiche indisponible »).
- Régions `aria-live` pour le nombre de résultats, les états de chargement et d'erreur, et les messages de confirmation.
- Focus clavier visible sur tous les éléments interactifs ; lien d'évitement « Aller au contenu principal ».
- Contrastes conformes au niveau AA : texte principal environ 17:1, texte secondaire environ 7:1, bouton principal 5,6:1.
- Menu mobile utilisable au clavier : `aria-expanded` et `aria-controls` sur le bouton, fermeture par Échap avec retour du
  focus ; page courante signalée par `aria-current`.
- Libellé associé à chaque champ (`<label for>` ou `aria-label`) ; erreurs de priorité reliées au champ par
  `aria-describedby` et `aria-invalid`.
- Note en étoiles accompagnée d'un équivalent textuel (« Note : 6,6 sur 10 »).
- Préférence `prefers-reduced-motion` respectée : animations et transitions neutralisées.

## Tests navigateurs

Le parcours a été rejoué dans chaque navigateur aux largeurs 360, 800 et 1280 px : affichage du catalogue, recherche avec
et sans résultat, tri, filtres, menu mobile (ouverture, Échap), fiche valide, trois cas de fiche introuvable, ajout et
suppression dans Ma liste, priorités invalides (12, 1,5), envoi de la sélection, affiches absentes ou cassées, API coupée
et réponse 500, absence de défilement horizontal à 360 px, navigation au clavier et `prefers-reduced-motion`.

| Navigateur     | Version | Résultat                                                    |
| -------------- | ------- | ----------------------------------------------------------- |
| Google Chrome  | 154     | Toutes les vérifications réussies                           |
| Microsoft Edge | 155     | Toutes les vérifications réussies                           |
| Firefox        |         | _À compléter : navigateur absent du poste de développement_ |

Écarts constatés et traitement :

- Lorsque l'API répond en erreur (fiche 99999999, API coupée), le navigateur inscrit lui-même « Failed to load resource »
  dans la console. Ce message n'est pas émis par le code : l'erreur est interceptée et l'utilisateur voit un message
  explicite. En fonctionnement normal, la console reste vide.
- Dans Edge, la console affiche des messages provenant d'une extension intégrée au navigateur
  (`chrome-extension://…`), sans lien avec le site.

## Audit d'accessibilité

Lighthouse 12.8.2 sur la page catalogue, émulation mobile, site servi par `python -m http.server` :

| Catégorie        | Score |
| ---------------- | ----- |
| Accessibilité    | 100   |
| Bonnes pratiques | 100   |
| SEO              | 100   |
| Performances     | 100   |

Pistes d'amélioration :

1. **Langue des contenus** : les résumés et les genres arrivent en anglais alors que les pages sont déclarées en
   `lang="fr"`. Les lecteurs d'écran les prononcent donc avec une voix française. Ajouter `lang="en"` sur ces éléments
   (critère WCAG 3.1.2), ce que Lighthouse ne vérifie pas.
2. **Longueur du catalogue** : toutes les séries sont affichées d'un bloc, ce qui impose de nombreuses tabulations au
   clavier et alourdit le DOM (signalé par Lighthouse). Une pagination ou un chargement progressif réglerait les deux.

## Limites connues

- Le catalogue se limite à la première page de l'API (240 séries reçues à ce jour) et la recherche ne porte que sur ces
  séries. `searchShows()` est prête pour une recherche côté serveur.
- Ma liste est stockée dans le navigateur : elle n'est ni partagée entre appareils ni liée à un compte. Le titre, l'année
  et l'affiche d'une série y sont copiés au moment de l'ajout.
- Le service d'envoi de recette n'enregistre rien et renvoie toujours l'identifiant 101 ; `userId` vaut 1 en attendant
  les comptes utilisateurs de l'API de production.
- `og:image` est un chemin relatif : il faudra une URL absolue une fois le site en ligne pour que les aperçus de partage
  s'affichent.
- Genres et résumés sont affichés tels que fournis par l'API, en anglais ; seuls les statuts sont traduits.
- Le site nécessite JavaScript ; un message `<noscript>` le signale.

## Utilisation de l'IA

- **Outil** : Claude Code (Anthropic), modèle Claude Opus 5.5.
- **Demandes** : corriger une fonction de `main.js` pour charger les affiches de manière paresseuse (lazy loading) et non plus toutes en même temps (eager loading).
- **Réponse obtenue** : du code assez complexe, mais fonctionnel (fonctions
  redondants retirés, CSS simplifié).
- **Pourquoi l'IA plutôt qu'une recherche classique** : plus rapide, et je n'ai pas trouvé de réponse adaptée en ligne.
- **Modifications apportées à la réponse** : non reprise totale du code proposé, mais adaptation à l'architecture existante (fonctions déjà présentes, variables déjà définies, etc).
