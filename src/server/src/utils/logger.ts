import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export const logAction = async (userId: string, action: string, details?: string, projectId?: string) => {
  try {
    await prisma.operationLog.create({
      data: {
        user_id: userId,
        action,
        details: details || null,
        project_id: projectId || null,
      }
    });
  } catch (err) {
    console.error("[Logger]Failed to insert log:", err);
  }
};
