# AI 视频摘要助手

<div align="center">

粘贴公开视频链接，一键获得结构化摘要、思维导图、完整文稿和交互式问答。

[![Python](https://img.shields.io/badge/Python-3.11+-3c873a?style=flat-square&logo=python)](https://www.python.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-3c873a?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4_Flash-4f46e5?style=flat-square)](https://platform.deepseek.com)

[概览](#概览) • [快速开始](#快速开始) • [接口](#接口) • [项目结构](#项目结构) • [配置](#配置) • [平台支持](#平台支持)

</div>

## 概览

AI 视频摘要助手是一个本地自用 MVP，可将公开视频链接自动转化为结构化知识资产。处理链路为：

1. 解析视频元信息（标题、作者、时长、封面、可用下载档位）
2. 获取文稿 — 公开字幕优先，无字幕时由 **StepAudio 2.5 ASR** 自动转写
3. 调用 **DeepSeek V4 Flash** 生成结构化 Markdown 摘要，前端流式打出
4. 生成可折叠的**思维导图**（支持导出 SVG / PNG）
5. 建立临时**问答会话**，支持基于完整文稿的连续追问

无数据库、无账号、无历史记录 — 所有数据存于内存并按 TTL 自动清理。

> [!NOTE]
> 当前为本地自用 MVP。不要将同步下载、内存转写或内存问答接口直接暴露为公网多用户服务。

## 特性

- **一键式流程** — 单次请求完成解析、转写、摘要、思维导图和问答准备
- **字幕优先、ASR 兜底** — 有公开字幕时直接用，否则自动触发 StepAudio 2.5 ASR，大文件自动分段
- **流式摘要** — DeepSeek 流式返回 Markdown 增量，前端打字机效果
- **结构化输出** — 后端确定性规则从摘要 Markdown 中提取一句话总结、核心观点、章节概览、关键词、行动建议和注意事项
- **可折叠思维导图** — 树形可视化（最多 4 层、每层 12 节点），支持 SVG/PNG 导出，JSON 校验失败自动重试
- **交互式问答** — 基于文稿 + 摘要的内存问答会话，默认 24 小时 TTL
- **多平台下载** — `source` / 4K / 1080p / 720p / 纯音频 MP3，支持 `FileSystemWritableFileStream` 流式进度显示
- **优雅降级** — 思维导图或问答失败不影响摘要和原文稿展示

## 架构

```
浏览器 (React + Vite + Tailwind CSS v4)
        │  SSE (fetch + ReadableStream)
        ▼
FastAPI 后端
 ├── Provider 层       → Bilibili / Douyin（专用）、yt-dlp（兜底）
 ├── 文稿层             → 公开字幕 → StepAudio 2.5 ASR
 ├── DeepSeek 客户端    → Chat Completions（流式 + JSON Output）
 ├── 总结编排器          → SSE 阶段事件、思维导图、问答会话
 └── 内存存储           → 转写任务 + 问答会话（TTL）
```

前端通过 `POST /api/summaries/stream` 读取 SSE 事件（不依赖原生 `EventSource`），以支持 POST 请求体和 `AbortController` 取消。

## 前置依赖

- **Python 3.11+**（含 venv）
- **Node.js 20+**（含 npm）
- **[ffmpeg](https://ffmpeg.org)** — 音频抽取、DASH 流合并、音频分段
- **StepFun API Key** — 无字幕时自动 STT 所需（[获取地址](https://platform.stepfun.com)）
- **DeepSeek API Key** — AI 摘要、思维导图、问答所需（[获取地址](https://platform.deepseek.com)）

## 快速开始

### 1. 克隆并安装

```bash
git clone <repo-url> && cd ai-video-summary

# 后端
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

```bash
# 前端
cd frontend
npm install
```

### 2. 启动服务

```bash
# 终端 1 — 后端（项目根目录）
source .venv/bin/activate
uvicorn backend.app.main:app --reload
# → http://127.0.0.1:8000

# 终端 2 — 前端
cd frontend
npm run dev
# → http://127.0.0.1:5173
```

### 3. 验证健康状态

```bash
curl http://127.0.0.1:8000/api/health
# → {"status":"ok","ffmpegAvailable":true,"sttAvailable":true,"deepseekAvailable":true}
```

若 `sttAvailable` 或 `deepseekAvailable` 为 `false`，请检查 `.env` 中的密钥配置。

### 4. 使用

打开 `http://127.0.0.1:5173`，粘贴公开视频链接，选择总结风格，点击 "立即生成报告"。

### 5. 运行测试

```bash
.venv/bin/python -m pytest backend/tests
cd frontend && npm run build
```

## 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/health` | 后端状态、ffmpeg/STT/DeepSeek 可用性 |
| `POST` | `/api/videos/parse` | 解析视频信息、下载档位、字幕状态 |
| `GET` | `/api/videos/download?url=&quality=` | 按档位下载视频/音频 |
| `POST` | `/api/transcripts` | 手动创建转写任务 |
| `GET` | `/api/transcripts/{taskId}` | 查询转写任务状态与结果 |
| `POST` | `/api/summaries/stream` | SSE 流：阶段进度、视频信息、文稿、摘要增量/完成、思维导图、问答会话 |
| `POST` | `/api/summaries/{sessionId}/questions/stream` | SSE 流：基于文稿的连续追问 |

SSE 响应使用 `text/event-stream`，头部包含 `Cache-Control: no-cache`。事件类型包括 `stage`、`video`、`transcript`、`summary_delta`、`summary_done`、`mindmap_done`、`qa_ready`、`partial_error`、`fatal_error`、`done`。

## 项目结构

```
ai-video-summary/
├── backend/
│   ├── app/
│   │   ├── main.py                        # FastAPI 入口，CORS，路由
│   │   ├── models.py                      # Pydantic 模型
│   │   ├── env_config.py                  # .env 加载器
│   │   ├── video_service.py               # Provider 调度与下载
│   │   ├── transcript_service.py          # 内存转写任务与 TTL
│   │   ├── stepaudio_client.py            # StepAudio 2.5 ASR SSE 客户端
│   │   ├── deepseek_client.py             # DeepSeek Chat Completions（流式 + JSON）
│   │   ├── summary_service.py             # 总结编排器与问答 SSE
│   │   ├── summary_models.py              # 摘要、思维导图、问答模型
│   │   ├── summary_events.py              # SSE 事件格式化
│   │   ├── summary_markdown_parser.py     # 摘要确定性规则解析
│   │   ├── summary_session_store.py       # 内存问答会话存储与 TTL
│   │   ├── summary_transcript_resolver.py # 字幕/ASR 文稿调度
│   │   ├── prompt_templates.py            # 系统提示词与风格模板
│   │   └── providers/                     # 平台特定 Provider
│   │       ├── base.py
│   │       ├── bilibili_provider.py       # B 站 HTML 页面解析
│   │       ├── douyin_provider.py         # 抖音实验性解析
│   │       └── yt_dlp_provider.py         # yt-dlp 兜底
│   ├── requirements.txt
│   └── tests/
│       ├── test_video_service.py
│       └── test_ai_summary.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx                        # 首页 + 总结结果页
│   │   ├── App.css                        # Tailwind CSS v4 入口
│   │   ├── api.ts                         # Fetch 封装与 SSE 解析
│   │   ├── types.ts
│   │   ├── constants/
│   │   │   ├── home.ts                    # 首页文案与营销数据
│   │   │   └── summary.ts                 # 总结风格与阶段定义
│   │   └── utils/
│   │       ├── format.ts                  # 时长/时间戳格式化
│   │       ├── mindmap.ts                 # 思维导图布局与树操作
│   │       ├── summaryExport.ts           # Markdown 导出构建
│   │       └── url.ts                     # URL 校验与安全文件名
│   ├── package.json
│   └── vite.config.ts
├── docs/                                  # 设计文档、PRD、平台接入记录
├── DESIGN/                                # 视觉设计稿
├── .env.example
└── README.md
```

## 配置

所有配置通过项目根目录的 `.env` 文件管理。主要变量：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `STEP_API_KEY` | — | StepFun API Key（ASR 必填） |
| `STEP_ASR_MAX_DURATION_MINUTES` | `30` | 单个视频 ASR 最大时长 |
| `STEP_ASR_MAX_REQUEST_FILE_MB` | `39` | 触发分段 ASR 的音频大小阈值 |
| `DEEPSEEK_API_KEY` | — | DeepSeek API Key（摘要必填） |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | 摘要和问答使用的模型 |
| `DEEPSEEK_THINKING_ENABLED` | `false` | 是否开启 DeepSeek 思考模式 |
| `DEEPSEEK_REQUEST_TIMEOUT_SECONDS` | `900` | 请求超时（完整文稿可能需较长连接） |
| `AI_SUMMARY_SESSION_TTL_SECONDS` | `86400` | 问答会话过期时间（24 小时） |
| `AI_SUMMARY_CUSTOM_PROMPT_MAX_CHARS` | `2000` | 自定义提示词最大长度 |

## 平台支持

| 平台 | Provider | 下载档位 | 字幕 | 备注 |
|------|----------|---------|------|------|
| B 站 | 专用 (`bilibili_provider`) | `source`（当前最高可用 MP4）、720p、音频 | 通过 `x/player/v2` 获取匿名公开字幕 | 不登录 — 实际可用档位取决于匿名访问权限 |
| 抖音 | 专用 (`douyin_provider`) | `source`、音频 | 无 | 实验性 — 不承诺稳定无水印 |
| 其他平台 | `yt-dlp` | 4K / 1080p / 720p / 音频 | 由 yt-dlp 提取器提供 | 覆盖范围取决于已安装的 yt-dlp 版本 |

**下载档位**：`source`（最高可用 MP4）、`4k`、`1080p`、`720p`、`audio`（纯音频 MP3）。不可用档位在解析响应中标记为 `available: false`。

B 站 `source` 档位仅表示当前匿名访问下可获取的最高 MP4 画质，不代表平台最高权限画质。封面图使用 `referrerPolicy="no-referrer"` 以避免 B 站 CDN 的 Referer 拦截。

## 已知限制

- 本地/开发用 MVP — 无认证、限流、配额、SSRF 防护、持久化存储
- 转写任务和问答会话在服务重启后丢失
- 抖音 Provider 为实验性质，不保证无水印
- B 站 Provider 仅读取匿名公开数据 — 登录态字幕、区域限制内容和高清流（1080p+）可能不可用
- 页面刷新后所有当前结果丢失，无恢复路径
