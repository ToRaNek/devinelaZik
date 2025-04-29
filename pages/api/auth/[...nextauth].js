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
      session.user.pseudo = user.pseudo || user.name; // Use name as fallback

      // Add Spotify/Deezer connection info
      const accounts = await prisma.account.findMany({
        where: { userId: user.id }
      });

      session.user.spotify = accounts.some(acc => acc.provider === 'spotify');
      session.user.deezer = accounts.some(acc => acc.provider === 'deezer');

      return session;
    },
    async signIn({ user, account, profile }) {
      // If the user doesn't have a pseudo yet, create one based on their name
      if (!user.pseudo) {
        try {
          const sanitizedName = profile.name?.replace(/\s+/g, '').toLowerCase() || 'user';
          const randomSuffix = Math.floor(Math.random() * 1000);
          const suggestedPseudo = `${sanitizedName}${randomSuffix}`;

          await prisma.user.update({
            where: { id: user.id },
            data: { pseudo: suggestedPseudo }
          });
        } catch (error) {
          console.error("Error setting initial pseudo:", error);
          // Continue anyway, we'll handle this later
        }
      }
      return true;
    }
  },
  pages: {
    signIn: '/auth/signin',
  },
  // Add debug: true during development to see detailed error messages
  debug: process.env.NODE_ENV === 'development',
};

export default NextAuth(authOptions);