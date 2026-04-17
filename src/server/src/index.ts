import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth';
import configRoutes from './routes/config';
import workflowRoutes from './routes/workflow';
import projectRoutes from './routes/project';
import adminRoutes from './routes/admin';
import templateRoutes from './routes/template';
import toolsRoutes from './routes/tools';
import logsRoutes from './routes/logs';
import kbRoutes from './routes/kb';

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3001;
const HOST = process.env.HOST || '0.0.0.0';
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Boot-time Seeder: 确保自动建立 default admin/admin 顶级账号
const ensureDefaultAdmin = async () => {
  try {
    const adminExists = await prisma.user.findUnique({ where: { username: 'admin' } });
    if (!adminExists) {
      const password_hash = await bcrypt.hash('admin', 10);
      await prisma.user.create({
        data: { username: 'admin', password_hash, is_admin: true }
      });
      console.log('[System Init] 默认预置管理员账号 (admin / admin) 注入成功！');
    }
  } catch (error) {
    console.error('[System Init] 预置管理员注入异常:', error);
  }
};
ensureDefaultAdmin();

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/config', configRoutes);
app.use('/api/workflow', workflowRoutes);
app.use('/api/project', projectRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/template', templateRoutes);
app.use('/api/tools', toolsRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/kb', kbRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

app.listen(PORT, HOST, () => {
  console.log(`Server listening on http://${HOST}:${PORT}`);
});
