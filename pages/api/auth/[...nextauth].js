// pages/api/auth/[...nextauth].js
import NextAuth from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import DiscordProvider from "next-auth/providers/discord";
import SpotifyProvider from "next-auth/providers/spotify";
//import DeezerProvider from "next-auth/providers/deezer";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../../../lib/prisma";

// Create a custom adapter that extends the PrismaAdapter
const customAdapter = (p) => {
  return {
    ...PrismaAdapter(p),
    createUser: (data) => {
      return p.user.create({
        data: {
          ...data,
          // Generate a unique pseudo from the email or name
          pseudo: `user_${Date.now().toString().slice(-6)}`,
        },
      });
    },
  };
};

export default NextAuth({
  adapter: customAdapter(prisma),
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
    }),
    DiscordProvider({
      clientId: process.env.DISCORD_CLIENT_ID || "",
      clientSecret: process.env.DISCORD_CLIENT_SECRET || "",
    }),
    SpotifyProvider({
      clientId: process.env.SPOTIFY_CLIENT_ID || "",
      clientSecret: process.env.SPOTIFY_CLIENT_SECRET || "",
    }),
  /*DeezerProvider({
      clientId: process.env.DEEZER_CLIENT_ID || "",
      clientSecret: process.env.DEEZER_CLIENT_SECRET || "",
    }),
    // … ajoutez d'autres providers si besoin*/
  ],
  callbacks: {
    async session({ session, user }) {
      // Propager des champs supplémentaires au client
      session.user.id = user.id;
      session.user.pseudo = user.pseudo;
      session.user.image = user.image;
      session.user.spotify = user.spotifyId;
      session.user.deezer = user.deezerId;
      return session;
    },
  },
  events: {
    async signIn({ user, account, profile }) {
      // Check if we need to update the user with a name
      if (profile && user.name === user.email) {
        await prisma.user.update({
          where: { id: user.id },
          data: { name: profile.name || profile.username || user.email }
        });
      }
    }
  }
});