// scripts/reset-spotify.js
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function resetSpotifyAccounts() {
  try {
    await prisma.account.deleteMany({
      where: {
        provider: 'spotify'
      }
    });
    console.log("All Spotify accounts removed");
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

resetSpotifyAccounts();