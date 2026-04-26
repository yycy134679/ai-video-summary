# AGENTS.md

## 项目概览

这是“AI 视频摘要助手”的本地自用 MVP。当前核心流程是：粘贴公开视频链接，解析视频信息，优先读取公开字幕；无公开字幕或字幕解析失败时使用 StepAudio 2.5 ASR 生成文稿，再调用 DeepSeek 生成结构化摘要、思维导图和临时问答会话。原视频、清晰度档位和音频下载保留为结果页附加操作。

暂不包含账号、会员、数据库、多用户队列、历史记录或公网部署安全策略。

- 后端：`FastAPI + yt-dlp + httpx + ffmpeg + StepAudio 2.5 ASR + DeepSeek`，入口在 `backend/app/main.py`。
- 前端：`React + Vite + TypeScript + Tailwind CSS v4 + lucide-react`，入口在 `frontend/src/App.tsx`。
- 存储：无数据库；下载文件使用临时目录，请求结束后清理；转写任务和总结问答会话只保存在后端内存中并按 TTL 清理。
- 平台 Provider：B 站和抖音有专用 Provider，其他平台优先走 `yt-dlp`。
- 关键文档：`README.md`、`docs/方案设计.md`、`docs/AI视频总结功能方案.md`、`docs/StepAudio-2.5-ASR-STT接入PRD.md`、`docs/B站解析接入记录.md`、`docs/PRD.md`、`docs/需求分析.md`、`DESIGN/DESIGN.md`、`DESIGN/首页.html`。

继续开发前先阅读 `README.md` 和 `docs/方案设计.md`；涉及 AI 总结、STT、SSE、问答会话或提示词时再读 `docs/AI视频总结功能方案.md` 与 `docs/StepAudio-2.5-ASR-STT接入PRD.md`；涉及 B 站解析、清晰度、字幕、封面或第三方解析 API 取舍时读取 `docs/B站解析接入记录.md`；涉及产品边界或视觉改动时读取 PRD、需求分析和设计稿。

## 本地环境

需要本机已有：

- Python 3.11+
- Node.js 20+
- ffmpeg
- StepFun API Key：自动 STT 需要，配置为 `STEP_API_KEY`
- DeepSeek API Key：AI 总结和问答需要，配置为 `DEEPSEEK_API_KEY`

后端依赖安装：

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

只把真实密钥写入本地 `.env`，不要读取、打印、提交或暴露 `.env` 内容。未配置 `STEP_API_KEY` 不影响视频解析和下载，但自动转写会失败并返回清晰错误；未配置 `DEEPSEEK_API_KEY` 不影响解析、转写和下载，但总结流式接口不可用。

前端依赖安装：

```bash
cd frontend
npm install
```

## 开发命令

从仓库根目录启动后端：

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload
```

后端默认地址是 `http://127.0.0.1:8000`，健康检查是：

```bash
curl http://127.0.0.1:8000/api/health
```

健康检查返回 `ffmpegAvailable`、`sttAvailable` 和 `deepseekAvailable`。排查 AI 总结链路前先确认这三个状态。

启动前端：

```bash
cd frontend
npm run dev
```

前端默认地址是 `http://127.0.0.1:5173`，Vite 会把 `/api` 代理到 `http://127.0.0.1:8000`。

生产构建前端：

```bash
cd frontend
npm run build
```

预览前端构建：

```bash
cd frontend
npm run preview
```

如果默认端口已被其他本地项目占用，先用 `lsof` / `ps` 确认占用来源。不要盲目停止其他项目；优先改用备用端口并同步检查 Vite 代理目标。

## 接口与主流程

- `GET /api/health`：返回后端状态、ffmpeg、STT 和 DeepSeek 可用性。
- `POST /api/videos/parse`：解析公开视频链接，返回视频信息、下载档位、公开字幕状态；无字幕时会自动创建内存转写任务。
- `GET /api/videos/download?url=...&quality=...`：按 `source`、`4k`、`1080p`、`720p` 或 `audio` 下载。
- `POST /api/transcripts`：手动创建视频转写任务。
- `GET /api/transcripts/{taskId}`：查询转写任务状态和文稿结果。
- `POST /api/summaries/stream`：使用 SSE 流式返回阶段进度、视频信息、文稿、摘要增量、摘要完成、思维导图、问答会话和错误事件。
- `POST /api/summaries/{sessionId}/questions/stream`：基于当前视频文稿和摘要进行临时连续问答，使用 SSE 流式返回回答。

AI 总结流程应保持“字幕优先、STT 兜底、摘要可用优先”的降级策略：思维导图或问答准备失败时，摘要和原文稿仍应尽量可用；只有视频解析、文稿获取或 DeepSeek 摘要主体失败时才中断主流程。

## 测试与验证

后端最小测试：

```bash
.venv/bin/python -m pytest backend/tests
```

前端最小验证：

```bash
cd frontend
npm run build
```

前端界面、下载流程或总结交互改动后，尽量同时启动前后端并用浏览器验证主流程：

1. 打开 `http://127.0.0.1:5173`。
2. 粘贴公开视频链接。
3. 确认解析结果、文稿来源、总结阶段进度、摘要流式输出、思维导图、问答入口、错误提示和下载触发行为符合预期。

修复 bug 时优先补充或更新 `backend/tests` 中能覆盖该问题的测试。当前没有前端单元测试框架；前端改动至少运行 `npm run build`。

## 代码结构

- `backend/app/main.py`：FastAPI 应用、CORS、接口路由、SSE 响应和 HTTP 错误映射。
- `backend/app/models.py`：视频解析、下载档位、字幕、转写任务和健康检查模型。
- `backend/app/video_service.py`：Provider 调度、URL 校验、档位构建和下载入口。
- `backend/app/transcript_service.py`：内存转写任务、音频抽取、STT 限制、任务 TTL 和清理。
- `backend/app/stepaudio_client.py`：StepAudio 2.5 ASR SSE 调用和响应解析。
- `backend/app/deepseek_client.py`：DeepSeek OpenAI-compatible Chat Completions 封装、流式解析和 JSON 输出。
- `backend/app/summary_service.py`：AI 总结编排、SSE 事件、结构化摘要、思维导图和临时问答会话。
- `backend/app/summary_models.py`：摘要、思维导图、阶段事件、文稿和问答模型。
- `backend/app/prompt_templates.py`：总结、思维导图和问答提示词。
- `backend/app/providers/`：平台 Provider。抖音优先走 `douyin_provider.py`，B 站优先走 `bilibili_provider.py`，其他平台走 `yt_dlp_provider.py`。
- `backend/tests/test_video_service.py`：后端核心服务、Provider 调度和平台解析辅助函数测试。
- `backend/tests/test_ai_summary.py`：DeepSeek、总结 SSE、问答会话和健康检查测试。
- `frontend/src/api.ts`：前端 API 调用、SSE 读取、下载流读取和文件名解析。
- `frontend/src/types.ts`：前端类型。
- `frontend/src/App.tsx`：首页、解析、总结、文稿、思维导图、问答和下载主流程。
- `frontend/src/App.css`：当前主要样式文件，已引入 Tailwind CSS v4。

## 开发约定

- 默认使用简体中文回复、写文档和提交信息。
- 优先沿用当前前后端分离架构、Provider 边界、SSE 事件风格和现有 UI 风格。
- 修改后端共享逻辑前先确认 Provider、转写、总结和下载调用关系，避免只改单一路径导致统一接口行为不一致。
- 新增平台能力优先封装为 Provider；站点解析优先复用 `yt-dlp`，只有在目标站点有明确、可维护的公开页面数据来源时才补专用解析链路。
- 新增 AI 模型、第三方 API 或持久化能力前先确认必要性，并说明密钥、隐私、成本、稳定性和失败降级边界。
- 自定义总结提示词只能作为摘要关注点补充，不应允许覆盖系统边界、输出结构、安全限制或后续问答规则。
- 摘要、思维导图和问答的模型失败应返回清晰中文错误；能保留部分结果时不要丢弃已有摘要或文稿。
- 抖音专用链路是实验能力，不承诺稳定绕过风控或一定无水印。
- B 站专用链路只复用公开视频页和公开播放地址接口中的匿名可访问数据，不读取 Cookie，不承诺登录、会员、地区限制、风控或高画质权限。
- B 站 `source` 档位表示“当前匿名访问下最高可用 MP4”，不等于原站所有权限下的最高画质。
- B 站字幕只处理匿名可访问的公开字幕；字幕不存在、需要登录或字幕接口失败时，必须降级为字幕不可用或 STT 兜底状态，不要让视频解析失败。
- B 站 DASH 分离流需要用 `ffmpeg` 合并；普通 MP4 `durl` 流包含音频时不要再强制合并音频。
- B 站封面图在本地前端加载时可能因 Referer 被 CDN 拒绝；前端封面 `<img>` 应保留 `referrerPolicy="no-referrer"`，不要改回默认 Referer 策略。
- 遇到 B 站 412、登录、会员、地区限制、风控等问题，应返回清晰中文错误，不要承诺代码必然绕过平台限制。
- 不默认接入第三方视频解析 API；如需引入，必须封装为独立 Provider、默认关闭，并说明隐私、稳定性和安全边界。
- 前端视觉继续贴近 `DESIGN/首页.html` 和 `DESIGN/视频总结页.png` 的蓝白 SaaS 风格；不要为小改动大规模重写稳定 UI。
- 当前样式主要在 `App.css`，新增局部组件可以逐步使用 Tailwind utility class，但避免无关的全局样式重排。
- 使用 `lucide-react` 提供图标，避免手写重复 SVG。
- 下载进度必须保留可见状态；大文件下载优先使用 `showSaveFilePicker` 和 `FileSystemWritableFileStream` 流式写盘，不要退回把完整视频聚合成前端 `Blob`。
- 新增依赖前先确认必要性，优先使用已有依赖和标准库。

## 安全边界

- 只处理公开可访问的 `http` / `https` 视频链接。
- 不读取浏览器 Cookie，不新增普通用户 Cookie 输入框，不在日志或错误中打印 Cookie、Authorization、API Key、令牌或其他敏感信息。
- `.env` 只在后端本地读取；前端不得接收或展示 `STEP_API_KEY`、`DEEPSEEK_API_KEY` 等密钥。
- 公网部署前必须补齐认证、限流、SSRF 防护、任务队列、文件大小和时长限制、临时文件生命周期、资源隔离、费用控制和可观测日志。
- 不要直接把当前同步下载、内存转写任务或内存问答会话接口暴露为公网多用户服务。
- 下载、转写和总结相关改动要注意临时目录清理、内存任务 TTL、并发限制和大文件资源占用。

## Git 工作流

- 开发前先运行 `git status --short`。
- 如有未提交改动，不要擅自覆盖、回滚或整理；需要改同一文件时先理解现有改动并基于其继续。
- 当前在 `main` 且任务不是低风险小改动时，先从 `main` 创建独立分支。
- 当前已在合适分支上时，直接继续。
- 不使用 `git reset --hard`、`git checkout -- <file>`、强制覆盖或强制推送，除非用户明确要求。
- 提交信息使用中文 Conventional Commits，并包含标题和正文。
- 用户说“提交合并”时，表示提交当前修改后合并到 `main`，再删除当前临时分支。

## 交付前检查

根据改动范围选择最小必要验证：

- 后端逻辑：`.venv/bin/python -m pytest backend/tests`
- 前端类型或界面：`cd frontend && npm run build`
- 接口联调、总结或下载流程：启动前后端后用浏览器验证主流程

最终回复需要说明：改了什么、运行了哪些验证、当前分支、是否还有未提交改动。
