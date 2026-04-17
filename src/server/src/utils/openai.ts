import { PrismaClient } from '@prisma/client';
import OpenAI from 'openai';

const prisma = new PrismaClient();

export const getOpenAIClient = async (user_id: string) => {
  const userRow = await prisma.user.findUnique({ where: { id: user_id } });
  if (!userRow || !userRow.active_model_id) {
    throw new Error('请先在顶部的【配置】中心挂载一个属于您的底层模型算力源');
  }

  const config = await prisma.systemAiModel.findUnique({
    where: { id: userRow.active_model_id }
  });
  if (!config) throw new Error('您所绑定的系统基础模型资产已下线废弃，请重新配置选取');
  
  return {
    openai: new OpenAI({
      apiKey: config.api_key,
      baseURL: config.base_url || 'https://api.openai.com/v1',
    }),
    model_name: config.model || 'gpt-4o'
  };
};
