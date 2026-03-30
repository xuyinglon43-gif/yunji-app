# 云吉合院运营管理系统 - 开发指南

## 技术栈
- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **数据库**: Supabase (PostgreSQL)
- **部署**: Vercel (海外) + 阿里云服务器 (国内)

## 项目结构
```
src/
  app/           # Next.js App Router 页面
  components/    # 所有页面组件
  lib/           # 工具库
    auth.tsx     # 登录认证 Context (密码角色映射)
    constants.ts # 场地/时段/角色/状态等常量
    types.ts     # TypeScript 类型定义
    supabase.ts  # Supabase 客户端
    audit.ts     # 审计日志/软删除/恢复工具函数
supabase/        # SQL 迁移脚本
```

## 环境变量
`.env.local` 文件（不提交到 Git）：
```
NEXT_PUBLIC_SUPABASE_URL=https://hbjutnnlfhsctjxrholw.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_eZt6DOJAS7Tlx9y9POz5ng_C3JJ8H-O
```

## 角色权限
| 密码 | 角色 | 显示名 | 可见页面 |
|------|------|--------|----------|
| zhangze123 | approve | 老板 | 全部7页 |
| 8888 | approve | 老板 | 全部7页 |
| 16586666 | finance | 财务(录入) | 首页/档期/订单/财务/会员/商务 |
| 666 | service | 客服(录入) | 首页/档期/订单/会员 |
| 1658666 | view | 云吉员工 | 首页/档期/订单/会员 |

- 只有老板密码(8888/zhangze123)可以硬删除数据
- 其他角色删除操作都是软删除(设置 deleted_at)

## 部署方式

### 一键部署（推荐）
代码改完后执行：
```bash
git add -A && git commit -m "描述改了什么" && git push
```
push 后会自动部署到两个地方：
- **Vercel**: https://yunji-app.vercel.app （自动，GitHub 集成触发）
- **阿里云**: http://47.242.155.214:3000 （自动，GitHub Actions 触发）

### Vercel 配置
- 仓库: https://github.com/xuyinglon43-gif/yunji-app
- 连接方式: GitHub 集成，push to main 自动部署
- 环境变量在 Vercel Dashboard → Settings → Environment Variables 中配置

### 阿里云配置
- 服务器: 47.242.155.214
- 项目目录: ~/yunji-app
- 进程管理: PM2 (进程名: yunji)
- 部署方式: GitHub Actions → rsync → pm2 restart
- 环境变量: 服务器上的 ~/yunji-app/.env.local + GitHub Secrets (build 时注入)

### 手动更新阿里云（如果自动部署失败）
SSH 登录服务器后执行：
```bash
cd ~/yunji-app && git pull && npm run build && pm2 restart yunji
```

## 本地开发
```bash
npm install    # 安装依赖
npm run dev    # 启动开发服务器 http://localhost:3000
npm run build  # 生产构建（部署前必须通过）
```

## 数据库
- SQL 迁移脚本在 `supabase/` 目录下
- 新增表或字段需要在 Supabase SQL Editor 中手动执行
- 所有表都有 `deleted_at` / `deleted_by` 字段用于软删除
- `audit_logs` 表记录所有删除/编辑/恢复操作

## 注意事项
- 改完代码先 `npm run build` 确认无报错再 push
- 不要把 .env.local 提交到 Git
- 数据库结构变更要同时更新 supabase/ 下的 SQL 文件
- 时段固定5个: 上午、午餐、下午、晚餐、晚场
- 订单类型4个: 餐饮、喝茶、活动/会议、KTV
