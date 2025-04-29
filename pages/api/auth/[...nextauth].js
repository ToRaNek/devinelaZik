// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import SpotifyProvider from "next-auth/providers/spotify";
import prisma from "../../../lib/prisma";
import { CustomPrismaAdapter } from "../../../lib/customPrismaAdapter";

// Configuration NextAuth
export const authOptions = {
  adapter: CustomPrismaAdapter(prisma),
  debug: process.env.NODE_ENV === 'development',
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: 'database',
    maxAge: 30 * 24 * 60 * 60, // 30 jours
  },
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
      },
      profile(profile) {
        return {
          id: profile.id,
          name: profile.display_name || profile.id,
          email: profile.email,
          image: profile.images?.[0]?.url
        };
      }
    }),
  ],
  callbacks: {
    async session({ session, token, user }) {
      // Si nous utilisons la stratégie database
      if (user) {
        session.user.id = user.id;
        session.user.pseudo = user.pseudo || user.name;
      }

      // Add Spotify/Deezer connection info
      try {
        const accounts = await prisma.account.findMany({
          where: { userId: session.user.id }
        });

        session.user.spotify = accounts.some(acc => acc.provider === 'spotify');
        session.user.deezer = accounts.some(acc => acc.provider === 'deezer');
      } catch (error) {
        console.error("Error fetching user accounts:", error);
        session.user.spotify = false;
        session.user.deezer = false;
      }

      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// Cette exportation par défaut est ESSENTIELLE
export default NextAuth(authOptions);