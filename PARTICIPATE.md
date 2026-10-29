# 参赛操作清单（需要你本人完成的部分）

比赛：**Vultr: Agent Rush Hackathon**（lablab.ai × Vultr）
线上开发：2026-11-03 ~ 11-08 · 免费 · 可单人 · 总奖金 $15,000（现金 $9,000 + 云额度 $5,000）
比赛页：https://lablab.ai/ai-hackathons/vultr-hackathon

作品已完成并通过本地测试，位于本目录（`vultr-agent-rush/`）。
你只需要完成下面 6 步（约 30 分钟，其中部署 10 分钟，其他是注册等待）：

## 1. 报名比赛（比赛开始前完成即可）
- 注册/登录 https://lablab.ai，打开比赛页点 **Enroll**
- 加入官方 Discord（提交和答疑都在 Discord）

## 2. 领取 Vultr 账号和额度
- 注册 https://www.vultr.com（比赛通常会送 $200 试用额度）
- 控制台开通 **Serverless Inference**，复制 API key
- 开一台 Ubuntu 22.04 云主机（1 vCPU / 1GB 足够），防火墙放行 3000 端口

## 3. 部署（10 分钟）
把 `vultr-agent-rush/` 整个目录上传到服务器（或推到你的 GitHub 后 clone），然后：
```bash
curl -fsSL https://get.docker.com | sh
npm install
export LLM_API_KEY="你的Vultr推理key"
export SANDBOX_BACKEND=docker
npm start
```
验证：`curl http://localhost:3000/api/health` 返回 `{"ok":true,...}`
详细步骤见 `DEPLOY.md`。

## 4. 录 3 分钟演示视频（脚本见 `SUBMISSION.md`）
演示要点（评审明确要求画面里出现"遏制时刻"）：
1. 输入问题 → 展示 plan、逐段生成代码、沙箱执行、最终带 [R1][R2] 引用的答案
2. 点开任一 receipt，展示"运行的代码 + 原始输出"
3. 提一个会跑死循环的任务，展示沙箱超时击杀和 UI 里的 "⚠ Containment" 事件

## 5. 创建 GitHub 仓库并推送代码（公开仓库）

## 6. 在 lablab.ai 提交
提交时直接粘贴 `SUBMISSION.md` 里的内容，补上三个链接（线上地址、GitHub、视频）。

---

## 时间线提醒
- **11-03**：比赛正式开始（部署可以提前做完，但代码提交应在开赛窗口内进行）
- **11-08**：提交截止（UTC 时间，注意时差）
- 若进入决赛：11-08 在美国盐湖城现场（不强制到场，线上参与也可以）

## 项目当前状态（我做好的部分）
- ✅ 完整可运行的前后端代码（`server/` + `public/`）
- ✅ Agent 编排循环：规划 → 写代码 → 沙箱执行 → 失败重试 → 带引用的总结
- ✅ 沙箱隔离已实测：API key 不泄露、死循环 3 秒内被击杀、产物收集正常
- ✅ README（架构图 + 评分点覆盖）、部署文档、提交文案、演示脚本
- ⚠ 唯一没做的：真实 LLM 调用联调（本地没有可用的推理 key）。部署填入 Vultr key 后如有个别报错，把报错发给我即可修复。
