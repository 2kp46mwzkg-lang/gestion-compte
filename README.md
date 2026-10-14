# Mon budget

Petite appli web pour suivre mes dépenses à partir de mes relevés de compte LCL (PDF).

Chaque mois, j'importe le relevé : l'appli lit toutes les opérations, les classe par catégorie
et me montre où est parti l'argent, avec des pistes pour dépenser moins.

## Ce que fait l'appli

- **Lit les relevés LCL en PDF**, y compris les libellés sur plusieurs lignes, et **vérifie** que
  l'ancien solde + les crédits − les débits retombent bien sur le nouveau solde.
- **Classe automatiquement** chaque opération (courses, restos, transport, abonnements, épargne…).
  Quand une opération est mal classée, je la corrige une fois : l'appli retient le commerçant pour la suite.
- **Fiche du mois** : rentrées, charges fixes, dépenses courantes, épargne, argent envoyé vers mes
  autres comptes, et ce qui reste.
- **Pistes d'économies** : paiements en double possibles, commissions de change, frais bancaires,
  abonnements et prélèvements, restos et livraison, petites dépenses répétées, catégories en hausse,
  budgets dépassés.
- **Historique** mois par mois, avec la moyenne par catégorie.
- **Budgets** par catégorie, **règles apprises** modifiables, **sauvegarde** dans un fichier.

## Confidentialité

- Le dépôt GitHub ne contient **que le code**. Aucun relevé, aucune donnée bancaire.
- Les PDF sont lus **directement dans le navigateur** du téléphone (avec pdf.js, inclus dans `lib/`).
  Rien n'est envoyé sur Internet.
- Les données restent dans le stockage du navigateur, sur l'appareil.
- Le fichier `.gitignore` empêche d'ajouter par erreur des PDF, CSV ou sauvegardes au dépôt.
  **Ne mets jamais un relevé dans le dépôt**, même temporairement : un dépôt public est visible par tout le monde.

## Mise en ligne avec GitHub Pages

1. Sur github.com, crée un nouveau dépôt, par exemple `mon-budget`.
   Il peut être public : il ne contient que du code.
2. Envoie tous les fichiers de ce dossier dans le dépôt, en gardant les sous-dossiers
   (`css/`, `js/`, `lib/`, `icons/`). Le plus simple depuis un PC : *Add file → Upload files*,
   puis glisser-déposer le contenu du dossier.
3. Dans le dépôt : *Settings → Pages*. Sous *Build and deployment*, choisis
   *Deploy from a branch*, branche `main`, dossier `/ (root)`, puis *Save*.
4. Après une minute environ, l'appli est en ligne à l'adresse
   `https://<ton-pseudo>.github.io/mon-budget/`.

## Utilisation chaque mois

1. Dans l'appli ou sur le site LCL, télécharge le relevé du mois en PDF
   (sur iPhone, il arrive dans l'app Fichiers).
2. Ouvre Mon budget et touche **Importer un relevé**. Tu peux en sélectionner plusieurs d'un coup.
3. Classe les opérations marquées « À classer ». Les mois suivants, il y en aura de moins en moins.

Un relevé LCL va du 5 au 4 du mois suivant : pour qu'un mois soit complet, il faut les deux relevés
qui le couvrent. L'appli indique quand il manque des jours.

### Sur iPhone

- Dans Safari, bouton **Partager → Sur l'écran d'accueil** : l'appli s'ouvre en plein écran,
  comme une vraie appli, et Safari conserve mieux ses données.
- Exporte une **sauvegarde** de temps en temps (*Réglages → Exporter une sauvegarde*, puis
  « Enregistrer dans Fichiers »). Elle permet de tout retrouver sur un autre appareil, ou si
  Safari efface les données du site.

## Organisation du code

| Fichier | Rôle |
|---|---|
| `index.html` | La page de l'appli |
| `css/style.css` | L'apparence (thème clair et sombre) |
| `js/app.js` | L'interface : onglets, import, classement, réglages |
| `js/pdf-extract.js` | Extrait le texte du PDF avec sa position sur la page |
| `js/lcl.js` | Lit un relevé LCL : opérations, soldes, totaux, récapitulatif des frais |
| `js/categories.js` | Les catégories et les règles de classement par mots-clés |
| `js/analysis.js` | Bilan du mois, historique, pistes d'économies |
| `js/store.js` | Stockage sur l'appareil et sauvegarde |
| `lib/pdfjs/` | pdf.js de Mozilla (licence Apache 2.0) |

### Ajouter un mot-clé de classement

Dans `js/categories.js`, chaque catégorie a une liste de mots-clés (`RULES`). Par exemple, pour que
« CB MA BOULANGERIE » aille dans Courses, ajoute `MA BOULANGERIE` dans la ligne `courses`.
Pour un commerçant précis, le plus simple reste de corriger la catégorie dans l'appli : la règle est
retenue automatiquement.

### Ajouter une autre banque

Le lecteur LCL (`js/lcl.js`) prend les morceaux de texte du PDF avec leur position et renvoie un relevé
au format commun (période, soldes, liste d'opérations `{ date, cardDate, valueDate, label, details, amount }`
en centimes). Pour une autre banque, il suffit d'écrire un fichier du même genre et de l'appeler dans
`importPdfs()` de `js/app.js` selon la banque détectée.

## Crédits

- [pdf.js](https://github.com/mozilla/pdf.js) — Mozilla Foundation, licence Apache 2.0 (`lib/pdfjs/LICENSE`).
