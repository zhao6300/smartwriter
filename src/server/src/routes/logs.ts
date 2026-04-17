import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

// Get recent logs for the authenticated user, filtered by global or project_id
router.get('/', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { global, projectId } = req.query;
    
    let whereClause: any = { user_id: req.user!.id };
    
    if (global === 'true') {
      whereClause.project_id = null;
    } else if (projectId) {
      whereClause.project_id = String(projectId);
    }
    
    const logs = await prisma.operationLog.findMany({
      where: whereClause,
      orderBy: { created_at: 'desc' },
      take: 100
    });
    res.json(logs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
