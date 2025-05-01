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
    // Add this to pages/api/auth/[...nextauth].js in the SpotifyProvider config
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID,
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
      authorization: {
        params: {
          scope: "user-read-email user-top-read user-read-private user-library-read user-read-recently-played playlist-read-private"
        }
      },
      // Add this option to catch and handle errors better
      profile(profile, tokens) {
        // This will help the user understand what happened if there's an error
        if (!profile || Object.keys(profile).length === 0) {
          throw new Error(
              "Votre compte Spotify n'a pas été autorisé. Assurez-vous que votre email est dans la liste des utilisateurs autorisés dans le tableau de bord Spotify Developer."
          );
        }

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
      // Make sure session.user exists
      if (!session.user) {
        session.user = {};
      }

      // If using database strategy
      if (user) {
        session.user.id = user.id;
        session.user.pseudo = user.pseudo || user.name;

        // Add Spotify/Deezer connection info
        try {
          const accounts = await prisma.account.findMany({
            where: { userId: user.id }
          });

          session.user.spotify = accounts.some(acc => acc.provider === 'spotify');
          session.user.deezer = accounts.some(acc => acc.provider === 'deezer');
        } catch (error) {
          console.error("Error fetching user accounts:", error);
          session.user.spotify = false;
          session.user.deezer = false;
        }
      }

      return session;
    }
  },
  pages: {
    signIn: '/auth/signin',
    error: '/auth/error',
  },
};

// IMPORTANT: This is the correct way to export the NextAuth handler
// with req/res parameters explicitly declared
export default async function handler(req, res) {
  return await NextAuth(req, res, authOptions);
}