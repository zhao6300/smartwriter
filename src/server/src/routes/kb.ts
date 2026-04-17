import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// 1. Get all knowledge bases for internal user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const kbs = await prisma.knowledgeBase.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: 'desc' },
      include: {
        _count: {
          select: { documents: true }
        }
      }
    });
    res.json(kbs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Create a new knowledge base
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const kb = await prisma.knowledgeBase.create({
      data: {
        user_id: req.user!.id,
        name,
        description
      }
    });
    res.json(kb);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Delete a knowledge base
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.knowledgeBase.deleteMany({
      where: {
        id: req.params.id as string,
        user_id: req.user!.id
      }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Get all documents for a specific KB
router.get('/:id/docs', async (req: AuthRequest, res) => {
  try {
    const kbId = req.params.id as string;
    // Verify ownership
    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: kbId, user_id: req.user!.id }
    });
    if (!kb) return res.status(404).json({ error: 'Knowledge base not found' });

    const docs = await prisma.knowledgeDocument.findMany({
      where: { kb_id: kbId },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        kb_id: true,
        type: true,
        created_at: true,
        // Include content, but maybe we shouldn't send massive images directly in list?
        // Wait, for image display it's fine unless there's thousands. We limit content length if text, but for rendering images we need URL.
        content: true,
        url: true
      }
    });
    res.json(docs);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Add a Text Document
router.post('/:id/docs/text', async (req: AuthRequest, res) => {
  try {
    const kbId = req.params.id as string;
    const { content } = req.body;
    
    if (!content) return res.status(400).json({ error: 'Content is required' });

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: kbId, user_id: req.user!.id }
    });
    if (!kb) return res.status(404).json({ error: 'Knowledge base not found' });

    const doc = await prisma.knowledgeDocument.create({
      data: {
        kb_id: kbId,
        type: 'TEXT',
        content
      }
    });
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Add an Image Document
router.post('/:id/docs/image', async (req: AuthRequest, res) => {
  try {
    const kbId = req.params.id as string;
    const { url } = req.body; // Expecting base64 data URL
    
    if (!url) return res.status(400).json({ error: 'Image base64 url is required' });

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: kbId, user_id: req.user!.id }
    });
    if (!kb) return res.status(404).json({ error: 'Knowledge base not found' });

    const doc = await prisma.knowledgeDocument.create({
      data: {
        kb_id: kbId,
        type: 'IMAGE',
        url
      }
    });
    res.json(doc);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// 7. Delete Document
router.delete('/:id/docs/:docId', async (req: AuthRequest, res) => {
  try {
    const kbId = req.params.id as string;
    const docId = req.params.docId as string;

    const kb = await prisma.knowledgeBase.findFirst({
      where: { id: kbId, user_id: req.user!.id }
    });
    if (!kb) return res.status(404).json({ error: 'Knowledge base not found' });

    await prisma.knowledgeDocument.delete({
      where: { id: docId }
    });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
