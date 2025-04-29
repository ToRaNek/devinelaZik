// lib/customPrismaAdapter.js
import { PrismaAdapter } from "@next-auth/prisma-adapter";

export function CustomPrismaAdapter(prisma) {
    const standardAdapter = PrismaAdapter(prisma);

    return {
        ...standardAdapter,
        createUser: (data) => {
            // Generate a pseudo from the user's name or email
            const baseName = data.name?.replace(/\s+/g, '').toLowerCase() ||
                data.email?.split('@')[0].toLowerCase() ||
                'user';
            const randomSuffix = Math.floor(Math.random() * 1000);
            const pseudo = `${baseName}${randomSuffix}`;

            // Create the user with the pseudo field
            return prisma.user.create({
                data: {
                    ...data,
                    pseudo
                }
            });
        }
    };
}