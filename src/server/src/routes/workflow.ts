import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { getOpenAIClient } from '../utils/openai';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);


router.post('/outline', async (req: AuthRequest, res) => {
  try {
    const { articleId, topic, audience, customStyle, existingVariants, generateCount } = req.body;
    if (!articleId) throw new Error("缺少有效的 articleId 项目凭证");
    const { openai, model_name } = await getOpenAIClient(req.user!.id);

    const count = generateCount || 3;

    // Build context about already-existing variants so AI avoids repeating them
    let existingSection = '';
    if (existingVariants && existingVariants.length > 0) {
      const names = existingVariants
        .map((v: any, i: number) => `  ${i + 1}. 「${v.variantName}」（核心思想: ${v.core_idea || v.style || '未记录'}）`)
        .join('\n');
      existingSection = `
《已存在的大纲变体（下列每个都不得在新结果中重复）》:
${names}

⚠️决对要求：新生成的大纲必须采用与上述已存在变体完全不同的视角、打法和情感基调！不得复用相同的标题功能、论述结构或者情感走向。`;
    }

    const prompt = `你是一个资深的微信公众号运营推手。你的核心任务是：基于主题，必须一次性设计并生成【绝对精确的 ${count} 份】截然不同的视角和打法的高质量推文大纲骨架，供下层系统自动接收处理。
【强制警告】：返回的 JSON 中的 outlines 数组必须包含且只包含 ${count} 个对象，缺少将被重罚！
${existingSection}
《大纲变体命名规则》：variantName 必须简短有力（4-8字），直接体现这份大纲的核心策略，例如「情绪共鸣流」「干货拆解佬」「悬疑痛点中场0」等，不得用「变体N」初驾。
必须输出符合以下 JSON 格式的数据：
{
  "outlines": [
    {
      "variantName": "简短有力的大纲流派命名",
      "core_idea": "文章的核心思想与痛点主旨",
      "logic_organization": "整篇文章的写作逻辑与起承转合结构组织",
      "sections": [
        { "title": "段落小标题", "desc": "该段落起承转合的核心逻辑与具体要讲解的内容" }
      ]
    }
  ]
}

主题: ${topic}
目标人群: ${audience || '无特定限制'}
额外要求/特定风格: ${customStyle || '无特定风格设定（必须自由发挥多角度想象，在每个大纲中体现出明显差异）'}`;

    const completion = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'system', content: prompt }],
      response_format: { type: "json_object" },
    });

    const outlineText = completion.choices[0].message.content || '{}';
    
    const article = await prisma.article.update({
      where: { id: articleId },
      data: {
        topic,
        outline: outlineText,
        status: 'OUTLINE_DONE',
      }
    });

    res.json({ articleId: article.id, outline: JSON.parse(outlineText) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/generate', async (req: AuthRequest, res) => {
  try {
    const { articleId, final_outline } = req.body;
    const { openai, model_name } = await getOpenAIClient(req.user!.id);
    
    const prompt = `你是资深金牌公众号撰稿人。请根据大纲撰写公众号推文。
你可以使用Markdown排版。多加金句。
大纲内容如下：
${JSON.stringify(final_outline, null, 2)}`;

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'system', content: prompt }],
      stream: true,
    });

    let fullContent = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        fullContent += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }
    
    res.write('event: end\ndata: {}\n\n');
    res.end();

    // Update article content — store as JSON array to persist multiple versions
    const existing = await prisma.article.findUnique({ where: { id: articleId } });
    let contentsArray: any[] = [];
    if (existing?.content) {
      try {
        const parsed = JSON.parse(existing.content);
        if (Array.isArray(parsed)) contentsArray = parsed;
      } catch {
        // Legacy single-string content — wrap it
        contentsArray = [{ id: 'legacy', name: '历史成品', content: existing.content }];
      }
    }
    const contentName = req.body.contentName || '未命名成品';
    contentsArray.push({ id: Date.now().toString(), name: contentName, content: fullContent });

    await prisma.article.update({
      where: { id: articleId },
      data: {
        content: JSON.stringify(contentsArray),
        status: 'COMPLETED'
      }
    });

  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  }
});

router.post('/suggest-section', async (req: AuthRequest, res) => {
  try {
    const { topic, core_idea, logic_organization, title, generateAll } = req.body;
    const { openai, model_name } = await getOpenAIClient(req.user!.id);

    if (generateAll) {
      // Generate a full sections array based on the outline context
      const prompt = `你是一位顶级微信公众号文章结构规划师。
我有一篇文章的全局框架如下，请为它设计一组完整的段落阵列（通常 4-7 段），包括开局导入、主体内容、结尾升华等。
主题: ${topic || '未提供'}
核心思想: ${core_idea || '未提供'}
逻辑组织: ${logic_organization || '未提供'}

必须以 JSON 格式返回：
{ "sections": [ { "title": "段落标题", "desc": "具体起承转合计划" } ] }`;

      const completion = await openai.chat.completions.create({
        model: model_name,
        messages: [{ role: 'system', content: prompt }],
        response_format: { type: 'json_object' }
      });
      const parsed = JSON.parse(completion.choices[0].message.content || '{}');
      return res.json({ sections: parsed.sections || [] });
    }

    // Single section suggestion
    const prompt = `你是一位顶级自媒体爆款结构拆解师。
现在我们需要为一个文章的特定小标题段落专门构思【该段落到底应该写什么内容、如何起到起承转合的作用】。
文章全局要求如下：
全局主题: ${topic || '未提供'}
全局核心思想: ${core_idea || '未提供'}
全局逻辑组织: ${logic_organization || '未提供'}

重点目标：请为以下的小标题提供一小段（约 50-100 字以内）精妙的写作指导/大纲推演（desc），直接输出推演内容本身，不需要任何多余的废话。
【当前需要推演的段落小标题】: ${title || '未命名小标题'}`;

    const completion = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'system', content: prompt }]
    });

    res.json({ suggestion: completion.choices[0].message.content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Revise a specific paragraph in the final article
router.post('/revise-paragraph', async (req: AuthRequest, res) => {
  try {
    const { paragraphContent, instruction, fullContext } = req.body;
    const { openai, model_name } = await getOpenAIClient(req.user!.id);

    const prompt = `你是一位资深公众号文章润色师。
用户希望对文章中的某一个段落进行调整。请严格按照用户的指令修改，只返回修改好的那个段落内容本身，不要解释，不要添加前言和后语，不要改动格式以外的标点，保持原有的 Markdown 格式。

【文章完整内容供参考】:
${fullContext ? fullContext.slice(0, 1500) + (fullContext.length > 1500 ? '...' : '') : '未提供'}

【需要修改的具体段落原文】:
${paragraphContent}

【用户的修改指令】:
${instruction}

请直接输出修改后的段落：`;

    const completion = await openai.chat.completions.create({
      model: model_name,
      messages: [{ role: 'system', content: prompt }]
    });

    res.json({ revised: completion.choices[0].message.content });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;

