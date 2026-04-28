# AGENTS.md

## 项目概览

这是"AI 视频摘要助手"的本地自用 MVP。核心流程：粘贴公开视频链接 → 解析视频信息 → 优先读取公开字幕 → 无字幕时使用 StepAudio 2.5 ASR 生成文稿 → 调用 DeepSeek 生成结构化摘要、思维导图和临时问答会话。

**暂不包含**：账号、会员、数据库、多用户队列、历史记录、公网部署安全策略。

| 层 | 技术栈 | 入口 |
|---|---|---|
| 后端 | FastAPI + yt-dlp + httpx + ffmpeg + StepAudio 2.5 ASR + DeepSeek | `backend/app/main.py` |
| 前端 | React + Vite + TypeScript + Tailwind CSS v4 + lucide-react | `frontend/src/App.tsx` |
| 存储 | 无数据库 — 下载临时目录、内存转写任务、内存问答会话（均按 TTL 清理） | — |
| Provider | B 站、抖音专用 Provider，其他平台走 yt-dlp | `backend/app/providers/` |

**关键文档**：`README.md`、`docs/方案设计.md`、`docs/AI视频总结功能方案.md`、`docs/StepAudio-2.5-ASR-STT接入PRD.md`、`docs/B站解析接入记录.md`、`docs/PRD.md`、`docs/需求分析.md`、`DESIGN.md`、`PRODUCT.md`、`DESIGN/首页.html`。

涉及相应模块改动前先阅读对应文档；涉及 B 站解析、字幕、封面时必读 `docs/B站解析接入记录.md`。

## 环境搭建

### 前置依赖

- Python 3.11+（含 venv）
- Node.js 20+
- ffmpeg（音频抽取、DASH 流合并、音频分段）
- StepFun API Key（ASR 自动转写需要）
- DeepSeek API Key（AI 摘要和问答需要）

### 后端安装

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

编辑 `.env`，填入密钥：

```env
STEP_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

> 不读取、不打印、不提交 `.env` 内容。未配置 `STEP_API_KEY` 不影响视频解析和下载，但自动转写会失败；未配置 `DEEPSEEK_API_KEY` 不影响解析、转写和下载，但总结流式接口不可用。

### 前端安装

```bash
cd frontend
npm install
```

## 开发命令

### 启动后端

```bash
source .venv/bin/activate
uvicorn backend.app.main:app --reload
```

后端默认地址 `http://127.0.0.1:8000`。

### 启动前端

```bash
cd frontend
npm run dev
```

前端默认地址 `http://127.0.0.1:5173`，Vite 将 `/api` 代理到 `http://127.0.0.1:8000`。

> 端口冲突时先用 `lsof` / `ps` 确认占用来源，不要盲目停止其他项目。优先改用备用端口并同步检查 Vite 代理目标。

### 健康检查

```bash
curl http://127.0.0.1:8000/api/health
```

返回 `ffmpegAvailable`、`sttAvailable`、`deepseekAvailable`。排查 AI 总结链路前先确认这三个状态。

### 生产构建

```bash
cd frontend
npm run build        # tsc 类型检查 + vite build
npm run preview      # 预览构建产物
```

## 接口与主流程

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 后端状态、ffmpeg/STT/DeepSeek 可用性 |
| `POST` | `/api/videos/parse` | 解析视频信息、下载档位、字幕状态 |
| `GET` | `/api/videos/download?url=&quality=` | 按 `source`/`4k`/`1080p`/`720p`/`audio` 下载 |
| `POST` | `/api/transcripts` | 手动创建转写任务 |
| `GET` | `/api/transcripts/{taskId}` | 查询转写任务状态和文稿 |
| `POST` | `/api/summaries/stream` | SSE 流：阶段进度、视频信息、文稿、摘要增量、摘要完成、思维导图、问答会话 |
| `POST` | `/api/summaries/{sessionId}/questions/stream` | SSE 流：基于文稿和摘要的连续追问 |

**降级策略**：字幕优先 → STT 兜底 → 摘要可用优先。思维导图或问答失败时不丢弃已有摘要或文稿；只有视频解析、文稿获取或 DeepSeek 摘要主体失败时才中断主流程。

SSE 事件类型：`stage`、`video`、`transcript`、`summary_delta`、`summary_done`、`mindmap_done`、`qa_ready`、`partial_error`、`fatal_error`、`done`。

## 代码结构

```
backend/
├── app/
│   ├── main.py                        # FastAPI 入口、CORS、路由、SSE
│   ├── models.py                      # Pydantic 模型
│   ├── env_config.py                  # .env 加载
│   ├── video_service.py               # Provider 调度、URL 校验、下载
│   ├── transcript_service.py          # 内存转写任务、TTL 清理
│   ├── stepaudio_client.py            # StepAudio 2.5 ASR SSE 客户端
│   ├── deepseek_client.py             # DeepSeek Chat Completions（流式 + JSON）
│   ├── summary_service.py             # AI 总结编排、问答 SSE
│   ├── summary_models.py              # 摘要、思维导图、问答模型
│   ├── summary_events.py              # SSE 事件格式化
│   ├── summary_markdown_parser.py     # 摘要 Markdown 确定性解析
│   ├── summary_session_store.py       # 内存问答会话存储与 TTL
│   ├── summary_transcript_resolver.py # 字幕/ASR 文稿调度
│   ├── prompt_templates.py            # 提示词模板
│   └── providers/
│       ├── base.py
│       ├── bilibili_provider.py       # B 站 HTML 页面解析
│       ├── douyin_provider.py         # 抖音实验性解析
│       └── yt_dlp_provider.py         # yt-dlp 兜底
├── requirements.txt
└── tests/
    ├── test_video_service.py          # Provider 调度、平台解析
    ├── test_ai_summary.py             # DeepSeek、总结 SSE、问答、健康检查
    ├── test_stepaudio_transcript.py   # StepAudio STT
    └── test_bilibili_wbi.py           # B 站 WBI 签名
frontend/
├── src/
│   ├── App.tsx                        # 首页 + 总结结果页
│   ├── App.css                        # Tailwind CSS v4 样式入口
│   ├── api.ts                         # Fetch 封装、SSE 读取、下载流
│   ├── types.ts                       # 前端类型
│   ├── constants/
│   │   ├── home.ts                    # 首页文案与营销数据
│   │   └── summary.ts                # 总结风格与阶段定义
│   └── utils/
│       ├── format.ts                  # 时长/时间戳格式化
│       ├── mindmap.ts                 # 思维导图布局、节点展开折叠
│       ├── summaryExport.ts           # 摘要 Markdown 导出
│       └── url.ts                     # URL 校验与安全文件名
├── package.json
├── vite.config.ts
└── tsconfig.json
```

## 测试

### 运行所有后端测试

```bash
.venv/bin/python -m pytest backend/tests
```

### 运行特定测试文件

```bash
.venv/bin/python -m pytest backend/tests/test_video_service.py
.venv/bin/python -m pytest backend/tests/test_ai_summary.py
```

### 前端验证

```bash
cd frontend
npm run build        # 包含 tsc 类型检查 + Vite 构建
```

当前没有前端单元测试框架。前端改动至少需通过 `npm run build`。

### 浏览器手动验证

- 打开 `http://127.0.0.1:5173`
- 粘贴公开视频链接
- 验证：解析结果、文稿来源、总结阶段进度、摘要流式输出、思维导图、问答入口、错误提示、下载触发行为

修复 bug 时优先补充或更新 `backend/tests` 中能覆盖该问题的测试。

## 代码规范

### 通用

- 使用简体中文回复、写文档和提交信息
- 优先沿用当前前后端分离架构、Provider 边界、SSE 事件风格和现有 UI 风格
- 修改后端共享逻辑前先确认 Provider、转写、总结和下载调用关系
- 新增依赖前先确认必要性，优先使用已有依赖和标准库

### 后端

- Python 3.11+，类型标注适度（Pydantic 模型即类型来源）
- Provider 模式：新增平台能力优先封装为 Provider；站点解析优先复用 yt-dlp
- 新增 AI 模型或第三方 API 前需说明密钥、隐私、成本、稳定性和失败降级边界
- 自定义总结提示词只能作为摘要关注点补充，不应覆盖系统边界、输出结构或安全限制
- 模型失败返回清晰中文错误；能保留部分结果时不丢弃已有摘要或文稿

### 前端

- TypeScript 严格模式（`tsc --noEmit` 在 build 中自动运行）
- 视觉风格参见根目录 `DESIGN.md`，页面布局参考 `DESIGN/首页.html` 和 `DESIGN/视频总结页.png`
- 样式主要在 `App.css`，新增局部组件使用 Tailwind utility class，避免全局样式重排
- 图标使用 `lucide-react`，不手写重复 SVG
- 下载保留可见进度；大文件使用 `showSaveFilePicker` + `FileSystemWritableFileStream` 流式写盘

### 平台相关约定

- **B 站**：仅读取匿名公开数据，不读取 Cookie。`source` 档位为当前匿名访问下最高可用 MP4。封面 `<img>` 使用 `referrerPolicy="no-referrer"`。字幕不存在时降级为 STT 兜底，不让视频解析失败。DASH 分离流用 ffmpeg 合并；普通 MP4 `durl` 流包含音频时不强制合并。412、登录等错误返回清晰中文提示。
- **抖音**：实验能力，不承诺稳定无水印。
- **第三方解析 API**：如需引入必须封装为独立 Provider、默认关闭，说明隐私、稳定性和安全边界。

## 安全边界

- 只处理公开 `http`/`https` 视频链接
- 不读取浏览器 Cookie，不在日志或错误中打印 Cookie、Authorization、API Key 等敏感信息
- `.env` 仅后端本地读取；前端不得接收或展示密钥
- 公网部署前必须补齐：认证、限流、SSRF 防护、任务队列、文件大小/时长限制、资源隔离、费用控制、可观测日志
- 不要将同步下载、内存转写、内存问答会话接口直接暴露为公网多用户服务

## Git 工作流

- 开发前先运行 `git status --short`
- 有未提交改动时不擅自覆盖、回滚或整理
- 在 `main` 上且非低风险小改动时，先创建分支；已在合适分支上时直接继续
- 提交信息使用中文 Conventional Commits（标题 + 正文）
- 禁用 `git reset --hard`、`git checkout -- <file>`、强制覆盖或强制推送（除非用户明确要求）
- 用户说"提交合并"时：提交当前修改 → 合并到 `main` → 删除临时分支

> 以下可直接在 `main` 修改：README、文档拼写、配置/样式小调、用户明确要求。

### 提交信息格式

```
<type>: <简短描述>

<详细说明>
```

常用 type：`feat`（新功能）、`fix`（修复）、`docs`（文档）、`refactor`（重构）、`test`（测试）、`chore`（杂项）。

## 调试与故障排查

### 常见问题

| 症状 | 可能原因 | 排查步骤 |
|------|----------|----------|
| `sttAvailable: false` | `STEP_API_KEY` 未配置或无效 | 检查 `.env` 中 `STEP_API_KEY` |
| `deepseekAvailable: false` | `DEEPSEEK_API_KEY` 未配置或无效 | 检查 `.env` 中 `DEEPSEEK_API_KEY` |
| 视频解析失败 | 链接不公开、平台不支持或反爬 | 检查 URL 可公开访问，确认平台在支持列表中 |
| B 站 412 错误 | 反爬拦截 | 当前匿名访问限制，无法代码绕过 |
| 下载无声音 | DASH 分离流未合并 | 确认 ffmpeg 已安装且在 PATH 中 |
| 前端封面不显示 | B 站 CDN Referer 策略 | 确认 `<img>` 使用 `referrerPolicy="no-referrer"` |
| SSE 连接中断 | 后端异常或超时 | 检查后端日志，确认 `DEEPSEEK_REQUEST_TIMEOUT_SECONDS` 足够 |
| 端口 5173/8000 被占用 | 其他项目占用 | `lsof -i :5173` 或 `lsof -i :8000` 确认占用来源 |

### 日志

后端使用 Python 标准 `logging` 模块，开发模式下 `uvicorn --reload` 会自动输出请求日志。排查问题时优先检查终端中的后端输出。

## 交付前检查

根据改动范围选择最小必要验证，完成后回复中需说明：

1. 改了什么
2. 运行了哪些验证
3. 当前分支
4. 是否还有未提交改动

| 改动范围 | 验证命令 |
|----------|----------|
| 后端逻辑 | `.venv/bin/python -m pytest backend/tests` |
| 前端类型/界面 | `cd frontend && npm run build` |
| 接口联调、总结或下载流程 | 启动前后端后用浏览器验证主流程 |
