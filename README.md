# AI 视频摘要助手

本期实现范围是本地自用的 AI 视频总结 MVP：粘贴公开视频链接，自动解析视频信息，优先读取公开字幕；如果视频没有公开字幕或字幕解析失败，会触发 StepAudio 2.5 ASR 生成文字稿，再调用 DeepSeek 生成结构化摘要、思维导图和临时问答会话。原视频 / 4K / 1080P / 720P / 音频下载能力保留为结果页附加操作。

暂不包含账号、会员、数据库、多用户队列、历史记录或公网部署安全策略。

抖音链接会优先走实验性专用解析链路；如果平台返回风控、加密参数缺失或媒体地址不可用，会给出明确错误提示，不承诺稳定绕过平台限制。

## 文档入口

- `docs/PRD.md`：产品愿景和长期功能范围。
- `docs/需求分析.md`：当前阶段需求边界、竞品观察、平台限制和后续扩展方向。
- `docs/方案设计.md`：当前工程架构、接口、部署演进和给后续 AI 的开发提示。
- `docs/B站解析接入记录.md`：B 站解析技术取舍、接入方式、清晰度限制和排障记录。
- `DESIGN/DESIGN.md`、`DESIGN/首页.html`：首页设计参考。

## 前置依赖

- Python 3.11+
- Node.js 20+
- ffmpeg
- StepFun API Key（自动 STT 需要）：在项目根目录 `.env` 中配置 `STEP_API_KEY`
- DeepSeek API Key（AI 总结需要）：在项目根目录 `.env` 中配置 `DEEPSEEK_API_KEY`

## 启动后端

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
# 编辑 .env，填入 STEP_API_KEY 和 DEEPSEEK_API_KEY
uvicorn backend.app.main:app --reload
```

后端默认运行在 `http://127.0.0.1:8000`。

## 启动前端

```bash
cd frontend
npm install
npm run dev
```

前端默认运行在 `http://127.0.0.1:5173`，并通过 Vite 代理访问 `/api` 后端接口。

## 接口

- `POST /api/videos/parse`：解析公开视频链接，返回视频基础信息和可用下载档位。
- `GET /api/videos/download?url=...&quality=1080p`：按指定档位下载，浏览器以附件形式保存文件。
- `POST /api/transcripts`：手动创建视频转写任务。
- `GET /api/transcripts/{taskId}`：查询转写任务状态和文稿结果。
- `POST /api/summaries/stream`：创建 AI 视频总结任务，使用 SSE 流式返回阶段进度、视频信息、文稿、摘要、思维导图和问答会话。
- `POST /api/summaries/{sessionId}/questions/stream`：基于当前视频文稿进行临时连续问答，使用 SSE 流式返回回答。

## 说明

- 只处理公开可访问视频，不读取 Cookie，不支持登录或会员内容。
- B 站公开视频优先走本项目内置网页解析链路，读取页面公开播放信息后下载并合并音视频。
- 其他平台下载能力由 `yt-dlp` 提供，支持平台范围以当前安装版本为准。
- 高画质音视频合并和音频导出依赖 `ffmpeg`。
- 自动 STT 仅在公开字幕不可用时触发；未在 `.env` 中配置 `STEP_API_KEY` 时不会影响视频解析和下载，只会提示文稿暂不可用。
- AI 总结依赖 DeepSeek；未配置 `DEEPSEEK_API_KEY` 时不会影响视频解析、转写和下载接口，但总结流式接口会返回清晰错误。
- DeepSeek 思考模式默认关闭；如需开启，在 `.env` 中设置 `DEEPSEEK_THINKING_ENABLED=true`。
- `.env` 中的 STT 时长和音频大小限制使用分钟与 MB 配置，见 `.env.example`。
