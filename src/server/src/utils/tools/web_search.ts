export const webSearchTool = {
  name: "web_search",
  schema: {
    type: "function",
    function: {
      name: "web_search",
      description: "当需要实效性信息、最新资讯、或者查找你不确定的客观事实数据时，使用此工具进行网络搜索。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "需要搜索的关键句子或词组（推荐精确的关键字）"
          }
        },
        required: ["query"]
      }
    }
  },
  execute: async ({ query }: { query: string }): Promise<string> => {
    try {
      console.log(`[Tool] 正在执行网络搜索: ${query}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时强制熔断

      // 使用不易受特殊网络屏蔽的国际大众搜索引擎(Yahoo)做备用检索源
      const res = await fetch(`https://search.yahoo.com/search?p=${encodeURIComponent(query)}`, {
        method: 'GET',
        headers: { 
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        },
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (!res.ok) throw new Error(`HTTP Error: ${res.status}`);

      const html = await res.text();
      
      // 轻量级提取网页中的可见文本片段进行组装
      let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '\n');
      text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '\n');
      text = text.replace(/<[^>]+>/g, ' ');
      
      // 清洗并提取含金量比较高的段落
      const lines = text.split('\n')
        .map(l => l.trim())
        .filter(l => l.length > 20 && !l.includes('DuckDuckGo') && !l.includes('Settings'));
        
      const output = lines.slice(0, 20).join('\n---\n'); 
      return output || "未找到有用的搜索结果。";
    } catch (e: any) {
      console.error(`[Tool] 搜索出错:`, e);
      return `搜索执行失败: ${e.message}`;
    }
  }
};
