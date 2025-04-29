// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import SpotifyProvider from "next-auth/providers/spotify";
import prisma from "../../../lib/prisma";
import { CustomPrismaAdapter } from "../../../lib/customPrismaAdapter";

export const authOptions = {
  adapter: CustomPrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "user-read-email user-top-read user-read-private"
        }
      }
    }),
    // Vous pouvez ajouter le fournisseur Deezer ici si nécessaire
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.pseudo = user.pseudo || user.name; // Use name as fallback

      // Add Spotify/Deezer connection info
      const accounts = await prisma.account.findMany({
        where: { userId: user.id }
      });

      session.user.spotify = accounts.some(acc => acc.provider === 'spotify');
      session.user.deezer = accounts.some(acc => acc.provider === 'deezer');

      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  // Add debug: true during development to see detailed error messages
  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);