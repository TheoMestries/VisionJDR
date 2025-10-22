# VisionJDR

Une petite application temps-réel permettant à un administrateur de composer différentes scènes asymétriques (de 1v0 jusqu'à 3v3) et de les afficher instantanément sur les écrans des joueurs connectés.

## Fonctionnalités

- **Bibliothèque de décors et personnages** préconfigurée et extensible.
- **Console administrateur** pour choisir un décor, sélectionner une configuration (1v0, 0v1, 1v1, 2v1, 1v2, 2v2, 2v3, 1v3, 3v1, 3v2 ou 3v3)
  puis affecter les personnages sur chaque colonne.
- **Prévisualisation en direct** de la scène avant diffusion.
- **Diffusion instantanée** de la scène à tous les clients joueurs via WebSocket.

## Démarrage

```bash
npm install
npm run dev
```

Le serveur tente d'abord d'utiliser [http://localhost:3000](http://localhost:3000).
Si ce port est déjà occupé, il essaie automatiquement les ports suivants jusqu'à en trouver un disponible.

### Choisir un port spécifique

Pour forcer l'utilisation d'un port précis (par exemple `4000`) :

```bash
PORT=4000 npm start
# ou
npm start -- --port 4000
```

Si vous obtenez un message `EADDRINUSE`, cela signifie qu'aucun des ports tentés n'était libre.
Libérez le port en question ou choisissez un autre port avec l'une des commandes ci-dessus.

- `/admin.html` : console administrateur pour composer et diffuser les scènes.
- `/` : écran joueur qui réagit automatiquement aux diffusions.

## Personnalisation

Les décors et personnages par défaut sont définis dans `server.js` (tableaux `backgrounds` et `characters`).
Vous pouvez enrichir ces listes pour ajouter vos propres styles de scène.

## Installation de Node.js et npm sur Debian/Ubuntu

Sur Debian et Ubuntu, l'installation du paquet `nodejs` n'installe pas automatiquement `npm`.
Pour disposer des deux outils nécessaires au projet :

```bash
sudo apt update
sudo apt install nodejs npm
```

Vous pouvez vérifier les versions installées avec :

```bash
node -v
npm -v
```

Si vous utilisez une version de Node.js installée depuis un dépôt tiers (Nodesource, nvm, etc.),
suivez la documentation du gestionnaire de versions choisi pour activer `npm` ou utilisez `corepack enable`.
