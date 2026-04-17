import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// 获取用户所有项目
router.get('/', async (req: AuthRequest, res) => {
  try {
    const projects = await prisma.article.findMany({
      where: { user_id: req.user!.id },
      orderBy: { updated_at: 'desc' }
    });
    res.json(projects);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 创建空白新项目
router.post('/', async (req: AuthRequest, res) => {
  try {
    const project = await prisma.article.create({
      data: {
        user_id: req.user!.id,
        topic: '未命名创作',
        status: 'DRAFT',
      }
    });
    res.json({ id: project.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 获取单一项目详情
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const project = await prisma.article.findFirst({
      where: { id: req.params.id as string, user_id: req.user!.id }
    });
    if (!project) return res.status(404).json({ error: '项目未找到或无权访问' });
    res.json(project);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 删除项目
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.article.deleteMany({
      where: { id: req.params.id as string, user_id: req.user!.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 更新成品数组（用于删除/编辑单个成品后同步）
router.put('/:id/contents', async (req: AuthRequest, res) => {
  try {
    const { contents } = req.body;
    await prisma.article.updateMany({
      where: { id: req.params.id as string, user_id: req.user!.id },
      data: { content: JSON.stringify(contents) }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

