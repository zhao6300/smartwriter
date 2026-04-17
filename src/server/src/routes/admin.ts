import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAdmin, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAdmin);

router.get('/users/stats', async (req: AuthRequest, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        Articles: true,
      },
      orderBy: { created_at: 'desc' }
    });

    const stats = users.map(user => {
      const totalArticles = user.Articles.length;
      const completedArticles = user.Articles.filter(a => a.status === 'COMPLETED').length;
      const drafts = user.Articles.filter(a => a.status !== 'COMPLETED').length;

      return {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        created_at: user.created_at,
        totalArticles,
        completedArticles,
        drafts
      };
    });

    res.json({
      systemTotalUsers: users.length,
      systemTotalArticles: users.reduce((acc, current) => acc + current.Articles.length, 0),
      usersStats: stats
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Admin 模型池管理端点
router.get('/models', async (req: AuthRequest, res) => {
  try {
    const models = await prisma.systemAiModel.findMany({
      orderBy: { created_at: 'desc' }
    });
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.post('/models', async (req: AuthRequest, res) => {
  try {
    const { name, model, base_url, api_key } = req.body;
    if (!name || !model || !base_url || !api_key) {
      return res.status(400).json({ error: 'All fields are required.' });
    }
    const newModel = await prisma.systemAiModel.create({
      data: { name, model, base_url, api_key }
    });
    res.json(newModel);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/models/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.systemAiModel.delete({ where: { id: req.params.id as string } });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
