# VisionJDR

Une petite application temps-réel permettant à un administrateur de composer une scène "3 vs 2" et de l'afficher instantanément sur les écrans des joueurs connectés.

## Fonctionnalités

- **Bibliothèque de décors et personnages** préconfigurée et extensible.
- **Console administrateur** pour choisir un décor, 3 personnages à droite et 2 personnages à gauche.
- **Prévisualisation en direct** de la scène avant diffusion.
- **Diffusion instantanée** de la scène à tous les clients joueurs via WebSocket.

## Démarrage

```bash
npm install
npm run dev
```

Le serveur se lance sur [http://localhost:3000](http://localhost:3000).

- `/admin.html` : console administrateur pour composer et diffuser les scènes.
- `/` : écran joueur qui réagit automatiquement aux diffusions.

## Personnalisation

Les décors et personnages par défaut sont définis dans `server.js` (tableaux `backgrounds` et `characters`).
Vous pouvez enrichir ces listes pour ajouter vos propres styles de scène.
