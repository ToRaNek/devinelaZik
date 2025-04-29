// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../../../lib/prisma";

export const authOptions = {
  adapter: PrismaAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
    }),
  ],
  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      session.user.pseudo = user.pseudo;

      // Ajout des infos de connexion Spotify/Deezer
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
  }
};

export default NextAuth(authOptions);