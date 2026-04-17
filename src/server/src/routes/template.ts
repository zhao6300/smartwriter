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

// 简单的正则清洗函数
const cleanHtmlToText = (html: string) => {
  let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '\n');
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '\n');
  text = text.replace(/&nbsp;/ig, ' ');
  return text.replace(/\n\s*\n/g, '\n\n').trim();
};

const extractJsonFromResponse = (content: string) => {
  const match = content.match(/\{[\s\S]*\}/);
  if (match) return JSON.parse(match[0]);
  return JSON.parse(content);
};

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

请务必直接输出一个标准的 JSON 对象，不要用 markdown codeblock，只输出 JSON，格式如下：
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
        messages: [{ role: 'system', content: prompt }]
      });
      abstractPattern = extractJsonFromResponse(completion.choices[0].message.content || '{}');
    } catch (aiErr) {
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

router.post('/extract', async (req: AuthRequest, res) => {
  try {
    const { sourceType, content } = req.body;
    let rawText = content;

    // Fetch URL if needed
    if (sourceType === 'url') {
      const response = await fetch(content);
      if (!response.ok) throw new Error("无法抓取该网页");
      const htmlText = await response.text();
      rawText = cleanHtmlToText(htmlText).substring(0, 20000); // limit payload size
    } else {
      rawText = String(content).substring(0, 20000);
    }

    const { openai, model_name } = await getOpenAIClient(req.user!.id);
    const prompt = `你是一位顶级的文章拆解大师。用户传入了一篇爆款文章或者文案，请仔细通读其全文，并为其逆向生成一套带有抽象模式及具体大纲结构的"写作套路模板"。

被拆解的文章素材内容：
"""
${rawText}
"""

请务必直接输出一个包含两个部分（"abstract" 和 "original"）的标准 JSON 对象：
{
  "abstract": {
    "pattern_name": "你为这个套路起的响亮名称（4-8字）",
    "writing_strategy": "核心写作策略（1-2句）",
    "emotional_arc": "情感体验节奏走向",
    "target_scenarios": ["适用场景1", "适用场景2"],
    "section_rhythm": [
        { "role": "段落战术角色", "purpose": "设计意图" }
    ],
    "key_techniques": ["关键技法1", "关键技巧2"]
  },
  "original": {
    "core_idea": "抽离出来的文章核心思想及主旨",
    "logic_organization": "全文整体的大基调和逻辑组织编排方式",
    "sections": [
      {
        "title": "第1部分小标题",
        "desc": "这部分的写作要求和具体动作"
      },
      {
        "title": "第2部分小标题",
        "desc": "这部分的写作要求和具体动作"
      }
    ]
  }
}

除了上述 JSON 以外，不要有任何多余的废话和 markdown 标识。只输出纯 JSON。`;

    const completion = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'system', content: prompt }]
    });

    const parsedExtract = extractJsonFromResponse(completion.choices[0].message.content || '{}');
    
    // Validate minimally
    if (!parsedExtract.original || !parsedExtract.abstract) {
      throw new Error("AI未能按照标准格式返回提炼结果，可能超出了其处理能力。");
    }

    // Save
    const template = await prisma.template.create({
      data: {
        user_id: req.user!.id,
        name: parsedExtract.abstract.pattern_name || '逆向提取模板',
        style: '',
        framework: JSON.stringify(parsedExtract)
      }
    });

    res.json(template);

  } catch (err: any) {
    if (err.message && err.message.includes("请先在顶部")) {
      res.status(400).json({ error: err.message });
    } else {
      res.status(500).json({ error: err.message });
    }
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { name, framework } = req.body;
    
    // Validate ownership
    const existing = await prisma.template.findFirst({
      where: { id: req.params.id as string, user_id: req.user!.id }
    });
    if (!existing) return res.status(404).json({ error: 'Template not found' });

    let updatedFrameworkString = existing.framework;
    if (framework) {
      const existingFw = existing.framework ? JSON.parse(existing.framework) : {};
      const newFwObj = {
        abstract: existingFw.abstract || {},
        original: framework
      };
      updatedFrameworkString = JSON.stringify(newFwObj);
    }

    const template = await prisma.template.update({
      where: { id: req.params.id as string },
      data: {
        name: name || existing.name,
        framework: updatedFrameworkString
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

router.post('/bulk-delete', async (req: AuthRequest, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'No ids provided' });
    }
    await prisma.template.deleteMany({
      where: { 
        id: { in: ids },
        user_id: req.user!.id 
      }
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

