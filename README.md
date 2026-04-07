# 404Buddy 2.0

Application de chat en temps réel, multi-salons, avec authentification persistante.

## Stack

- **Backend** : Node.js, Express, Socket.IO
- **Base de données** : SQLite (via `better-sqlite3`)
- **Sessions** : `express-session` + `connect-sqlite3`
- **Auth** : `bcryptjs` (hachage de mots de passe)
- **Frontend** : HTML, CSS custom (variables, dark mode), JS vanilla

## Fonctionnalités

- Inscription / connexion avec mot de passe haché
- Sessions persistantes (7 jours)
- Salons multiples (#general, #random, #images)
- Historique des 50 derniers messages par salon
- Partage d'images (base64)
- Indicateur de frappe en temps réel
- Dark / Light mode (persisté en localStorage)
- Interface responsive (mobile-friendly)

## Lancer le projet

```bash
npm install
npm start
```

Le serveur démarre sur [http://localhost:3000](http://localhost:3000).

## Variables d'environnement

Copier `.env.example` → `.env` et ajuster :

```
PORT=3000
SESSION_SECRET=change_me_in_production
```
