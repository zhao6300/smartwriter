import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { BUILTIN_TOOLS } from '../utils/tools';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

// Get all available tools for the user
router.get('/', async (req: AuthRequest, res) => {
  try {
    const userPlugins = await prisma.toolPlugin.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: 'desc' }
    });

    // Merge builtin
    const allTools = Object.keys(BUILTIN_TOOLS).map(key => {
      const existing = userPlugins.find(p => p.type === 'BUILTIN' && p.name === key);
      if (existing) return existing;
      
      // Inject unsaved builtin as active default
      return {
        id: `builtin-${key}`,
        user_id: req.user!.id,
        name: key,
        type: 'BUILTIN',
        category: '内置工具',
        config: null,
        is_active: true
      };
    });

    // Add MCPs
    allTools.push(...userPlugins.filter(p => p.type === 'MCP'));

    res.json(allTools);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Add a new MCP tool
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, category, config } = req.body;
    
    // Validate config (expecting JSON string)
    if (!name || !config) {
      return res.status(400).json({ error: 'Missing name or config' });
    }

    const plugin = await prisma.toolPlugin.create({
      data: {
        user_id: req.user!.id,
        name,
        type: 'MCP',
        category: category || '其他工具',
        config,
        is_active: true
      }
    });

    res.json(plugin);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Toggle tool active status
router.put('/:id/toggle', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    const { is_active } = req.body;

    if (id.startsWith('builtin-')) {
      const builtinName = id.replace('builtin-', '');
      // Create it if toggling off for the first time
      const plugin = await prisma.toolPlugin.create({
        data: {
          user_id: req.user!.id,
          name: builtinName,
          type: 'BUILTIN',
          category: '内置工具',
          is_active
        }
      });
      return res.json(plugin);
    }

    const plugin = await prisma.toolPlugin.updateMany({
      where: { id, user_id: req.user!.id },
      data: { is_active }
    });

    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Delete MCP
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (id.startsWith('builtin-')) {
      return res.status(400).json({ error: 'Cannot delete built-in tools' });
    }
    await prisma.toolPlugin.deleteMany({
      where: { id, user_id: req.user!.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Update MCP configuration
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const id = req.params.id as string;
    if (id.startsWith('builtin-')) {
      return res.status(400).json({ error: 'Cannot modify built-in tool configs' });
    }
    const { name, category, config } = req.body;
    if (!name || !config) {
      return res.status(400).json({ error: 'Missing name or config' });
    }
    
    await prisma.toolPlugin.updateMany({
      where: { id, user_id: req.user!.id },
      data: { name, category, config }
    });
    
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
