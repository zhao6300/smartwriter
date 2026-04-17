import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { requireAuth, AuthRequest } from '../middlewares/auth';
import { getOpenAIClient } from '../utils/openai';
import { logAction } from '../utils/logger';

const router = Router();
const prisma = new PrismaClient();

router.use(requireAuth);


router.post('/outline', async (req: AuthRequest, res) => {
  try {
    const { articleId, topic, audience, customStyle, existingVariants, generateCount, selectedTools } = req.body;
    if (!articleId) throw new Error("缺少有效的 articleId 项目凭证");
    const { openai, model_name } = await getOpenAIClient(req.user!.id);
    
    // Tools parsing
    const agentTools = getActiveTools(selectedTools || []);
    const openaiTools = agentTools.length > 0 ? agentTools.map(t => t.schema) : undefined;

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

    const prompt = `你是一个资深的微信公众号运营推手。你的核心任务是：基于主题，必须一次性设计并生成【绝对精确的 ${count} 份】截然不同的视角和打法的高质量推文大纲骨架，供下层系统自动接收处理。若启用了网络搜素，可以先搜索参考资料。
【强制警告】：无论如何最终都必须直接输出符合 JSON 格式的数据。数组 outlines 必须包含且只包含 ${count} 个对象，缺少将被重罚！
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

除了 JSON 以外不要说多余的话！

主题: ${topic}
目标人群: ${audience || '无特定限制'}
额外要求/特定风格: ${customStyle || '无特定风格设定（必须自由发挥多角度想象，在每个大纲中体现出明显差异）'}`;

    let messages: any[] = [{ role: 'system', content: prompt }];
    let outlineText = "{}";

    let maxLoops = 5;
    while (maxLoops > 0) {
      maxLoops--;
      
      const completion = await openai.chat.completions.create({
        model: model_name,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        response_format: { type: "json_object" }
      });

      const msg = completion.choices[0].message;
      messages.push(msg);

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        for (const tc of msg.tool_calls as any[]) {
          const fnName = tc.function.name;
          const args = JSON.parse(tc.function.arguments || '{}');
          const tool = agentTools.find(t => t.name === fnName);
          
          let toolResult = "Tool execution failed or not found.";
          if (tool) {
            toolResult = await tool.execute(args);
          }
          
          messages.push({
            tool_call_id: tc.id,
            role: "tool",
            name: fnName,
            content: toolResult
          });
        }
      } else {
        outlineText = msg.content || "{}";
        break;
      }
    }
    
    let finalSavedOutline = outlineText;
    try {
      const newlyGenerated = JSON.parse(outlineText);
      const newItems = Array.isArray(newlyGenerated.outlines) ? newlyGenerated.outlines : (Array.isArray(newlyGenerated) ? newlyGenerated : [newlyGenerated]);
      
      if (existingVariants && existingVariants.length > 0) {
        // Recover the full objects from the request, assuming frontend passes the full array if it has them.
        // Wait, frontend only passes {variantName, core_idea}. We can't save just that.
        // The DB article already has the old outlines. We should just merge into them!
        const existingArticle = await prisma.article.findUnique({ where: { id: articleId } });
        if (existingArticle && existingArticle.outline) {
          const parsedOld = JSON.parse(existingArticle.outline);
          const oldItems = Array.isArray(parsedOld.outlines) ? parsedOld.outlines : (Array.isArray(parsedOld) ? parsedOld : []);
          
          finalSavedOutline = JSON.stringify({ outlines: [...oldItems, ...newItems] });
        }
      }
    } catch(e) {
      console.warn("解析合成大纲异常，采用覆盖策略", e);
    }

    const article = await prisma.article.update({
      where: { id: articleId },
      data: {
        topic,
        outline: finalSavedOutline,
        status: 'OUTLINE_DONE',
      }
    });

    await logAction(req.user!.id, "智能发散推演大纲", `为 ${topic} 脑爆了新的骨架分支`, article.id);


    // To remain backward compatible for frontend which just concatenates the delta array, 
    // we should return the JUST newly generated data, OR the frontend should replace instead of merge.
    // The previous frontend uses `setOutlines(prev => [...prev, ...parsedOutlines])` assuming backend returns ONLY the delta.
    res.json({ articleId: article.id, outline: JSON.parse(outlineText) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

import { getActiveTools } from '../utils/tools';

router.post('/generate', async (req: AuthRequest, res) => {
  try {
    const { articleId, final_outline, customStyle, selectedTools } = req.body;
    const { openai, model_name } = await getOpenAIClient(req.user!.id);
    
    // Tools parsing
    const agentTools = getActiveTools(selectedTools || []);
    const openaiTools = agentTools.length > 0 ? agentTools.map(t => t.schema) : undefined;

    const prompt = `你是资深金牌公众号撰稿人。请严格根据以下大纲与风格设定撰写推文。
【极其重要的高优指令】文风设定：${customStyle || '暂无特定风格设定，请用专业生动的自媒体口吻'}
你必须100%像素级模仿上述文风分析中刻画的语言习惯、语气词、修辞手法和句子长短节奏来行文。
你可以在撰写前通过提供的工具检索最新资料。请使用Markdown排版。
大纲内容如下：
${JSON.stringify(final_outline, null, 2)}`;

    let messages: any[] = [{ role: 'system', content: prompt }];
    let finalContent = "";

    await logAction(req.user!.id, "深度整合最终排版起草", `结合最终定制大纲进行长文生成`, articleId);

    // Set headers for SSE immediately to avoid timeout
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let maxLoops = 5;
    while (maxLoops > 0) {
      maxLoops--;
      
      const stream = await openai.chat.completions.create({
        model: model_name,
        messages,
        tools: openaiTools,
        tool_choice: "auto",
        stream: true 
      });

      let contentBuffer = "";
      let toolCallBuffer: any = {};
      let hasToolCalls = false;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (!delta) continue;

        if (delta.content) {
          contentBuffer += delta.content;
          res.write(`data: ${JSON.stringify({ text: delta.content })}\n\n`);
        }

        if (delta.tool_calls) {
          hasToolCalls = true;
          for (const tc of delta.tool_calls) {
            if (!toolCallBuffer[tc.index]) {
              toolCallBuffer[tc.index] = { id: tc.id, type: 'function', function: { name: tc.function?.name || "", arguments: "" } };
            }
            if (tc.function?.name) toolCallBuffer[tc.index].function.name += tc.function.name;
            if (tc.function?.arguments) toolCallBuffer[tc.index].function.arguments += tc.function.arguments;
          }
        }
      }

      const msg: any = { role: "assistant", content: contentBuffer || null };
      if (hasToolCalls) {
        msg.tool_calls = Object.values(toolCallBuffer);
      }
      messages.push(msg);

      if (hasToolCalls) {
        // Send a status update to frontend
        const toolNames = msg.tool_calls.map((t: any) => t.function.name).join(', ');
        res.write(`data: ${JSON.stringify({ text: `\n\n> 🤖 AI 正在使用工具 [${toolNames}] 检索资料...\n\n` })}\n\n`);

        for (const tc of msg.tool_calls as any[]) {
          const fnName = tc.function.name;
          const args = JSON.parse(tc.function.arguments || '{}');
          const tool = agentTools.find(t => t.name === fnName);
          
          let toolResult = "Tool execution failed or not found.";
          if (tool) {
            toolResult = await tool.execute(args);
          }
          
          messages.push({
            tool_call_id: tc.id,
            role: "tool",
            name: fnName,
            content: toolResult
          });
        }
      } else {
        // AI yielded final text completely
        finalContent = contentBuffer || "";
        break; // break the loop and finish
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
    contentsArray.push({ id: Date.now().toString(), name: contentName, content: finalContent });

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

