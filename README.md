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

Le serveur se lance sur [http://localhost:3000](http://localhost:3000).

- `/admin.html` : console administrateur pour composer et diffuser les scènes.
- `/` : écran joueur qui réagit automatiquement aux diffusions.

## Personnalisation

Les décors et personnages par défaut sont définis dans `server.js` (tableaux `backgrounds` et `characters`).
Vous pouvez enrichir ces listes pour ajouter vos propres styles de scène.
