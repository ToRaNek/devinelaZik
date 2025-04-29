# DevinelaZik

DevinelaZik est un quiz musical en ligne. Les utilisateurs peuvent lier leurs comptes **Spotify** et/ou **Deezer**, créer des salles, et défier leurs amis en devinant artistes, chansons ou pochettes.

## Prérequis

- Node.js ≥ 18.x
- PostgreSQL
- Clés API Spotify et Deezer

## Installation

1. Cloner le dépôt  
   ```bash
   git clone <votre-repo>
   cd devinelaZik
   ```

2. Installer les dépendances  
   ```bash
   npm install
   ```

3. Copier `.env.example` en `.env.local` et remplir les valeurs.

4. Générer la base de données  
   ```bash
   npx prisma generate
   npx prisma migrate dev --name init
   ```

## Lancement

```bash
npm run dev
```

Ensuite, ouvrez [http://localhost:3000](http://localhost:3000).

## Fonctionnalités

- **OAuth** via NextAuth.js (Spotify & Deezer)
- **Profil** : changer nom (unique), photo, lier/délier comptes, supprimer compte
- **Salles** : créer (/api/rooms/create) et rejoindre via `/partie/[code]`
- **Modes de quiz** : deviner artiste (extrait audio), chanson (titre + image), pochette (image)
- **Temps réel** avec Socket.IO : questions et classement mis à jour instantanément

## Configuration OAuth

1. **Spotify** : dashboard Spotify → Redirect URI = `http://localhost:3000/api/auth/callback/spotify`  
2. **Deezer** : myapps Deezer → Redirect URI = `http://localhost:3000/api/auth/callback/deezer`  

## Structure du projet

- `server.js` : custom server Next.js + Socket.IO  
- `prisma/` : schéma Prisma  
- `pages/api/` : routes API (auth, user, rooms)  
- `pages/` : pages Next.js (`_app.js`, `profile.js`, `partie/[code].js`)  
- `lib/prisma.js` : client Prisma  
"# devinelaZik" 
