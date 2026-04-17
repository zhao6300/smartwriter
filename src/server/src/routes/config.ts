import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// 供用户端获取系统中公开的模型池列表（已脱敏，剔除 api_key）
router.get('/system', async (req: AuthRequest, res) => {
  try {
    const models = await prisma.systemAiModel.findMany({
      orderBy: { created_at: 'desc' },
      select: { id: true, name: true, model: true, base_url: true } // 严格禁止返回 api_key
    });
    res.json(models);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 获取该用户正在激活绑定的系统模型 ID
router.get('/active', async (req: AuthRequest, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    res.json({ active_model_id: user?.active_model_id || null });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 用户切换想挂接的商用模型
router.post('/active', async (req: AuthRequest, res) => {
  try {
    const { active_model_id } = req.body;
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { active_model_id }
    });
    res.json({ success: true, active_model_id });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
