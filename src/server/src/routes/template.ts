import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { getOpenAIClient } from '../utils/openai';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const templates = await prisma.template.findMany({
      where: { user_id: req.user!.id },
      orderBy: { created_at: 'desc' }
    });
    res.json(templates);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, style, framework } = req.body;
    if (!name || !framework) return res.status(400).json({ error: 'Missing name or framework' });

    // Use AI to extract an abstract, reusable pattern from the outline
    let abstractPattern: any = {};
    try {
      const { openai, model_name } = await getOpenAIClient(req.user!.id);
      const fwStr = typeof framework === 'string' ? framework : JSON.stringify(framework);
      const prompt = `你是一位资深内容策略分析师。用户刚完成了一篇好文章的创作，现在要把它的"写作套路"提炼成一套可复用的抽象模板。

请分析以下大纲结构，提炼出它的核心写作套路。要求抽象化——去掉具体主题的细节，只保留"方法论"层面的策略。

原始大纲：
${fwStr}

请以 JSON 格式返回：
{
  "pattern_name": "套路名称（4-8字，如「痛点-方案-证言三段击」）",
  "writing_strategy": "这套打法的核心写作策略是什么（1-2句）",
  "emotional_arc": "情感走向描述（如「焦虑→共鸣→希望→行动」）",
  "target_scenarios": ["适用场景1", "适用场景2", "适用场景3"],
  "section_rhythm": [
    { "role": "段落角色（如开局钩子/痛点挖掘/方案呈现/信任背书/行动号召）", "purpose": "这个段落在全文中的战术目的" }
  ],
  "key_techniques": ["关键技法1", "关键技法2", "关键技法3"]
}`;

      const completion = await openai.chat.completions.create({
        model: model_name,
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: 'json_object' }
      });
      abstractPattern = JSON.parse(completion.choices[0].message.content || '{}');
    } catch (aiErr) {
      // If AI extraction fails, save without abstract pattern
      console.error('AI pattern extraction failed:', aiErr);
    }

    const enrichedFramework = {
      original: typeof framework === 'string' ? JSON.parse(framework) : framework,
      abstract: abstractPattern
    };

    const template = await prisma.template.create({
      data: {
        user_id: req.user!.id,
        name: abstractPattern.pattern_name || name,
        style: style || '',
        framework: JSON.stringify(enrichedFramework)
      }
    });
    res.json(template);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    await prisma.template.deleteMany({
      where: { id: req.params.id as string, user_id: req.user!.id }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

