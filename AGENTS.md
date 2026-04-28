# AGENTS

## 常用命令

```bash
# 后端
source .venv/bin/activate
uvicorn backend.app.main:app --reload          # 启动后端 (127.0.0.1:8000)
.venv/bin/python -m pytest backend/tests       # 运行后端测试

# 前端
cd frontend
npm run dev                                    # 启动前端 (127.0.0.1:5173)
npm run build                                  # 类型检查 + 构建
npm test                                       # 运行前端测试 (vitest run)
```

前端开发服务器自动将 `/api` 请求代理到后端 `127.0.0.1:8000`，无需额外配置。

## 架构

### 核心流程

```
用户粘贴公开视频链接 → POST /api/summaries/stream (SSE)
  → Provider 层解析视频元信息
  → 字幕优先 (B站公开字幕)，无字幕时 StepAudio 2.5 ASR 自动转写
  → DeepSeek V4 Flash 流式生成 Markdown 摘要 (前端打字机效果)
  → 独立调用生成思维导图 (JSON Output)  + 建立问答内存会话
  → 前端通过 ReadableStream 解析 SSE 事件，逐步渲染
```

### 后端关键模块

- **Provider 层** (`backend/app/providers/`): B 站专用 → 抖音专用 → yt-dlp 兜底。B 站只读匿名公开数据，不登录、不读 Cookie、不含 WBI 签名。
- **文稿层**: `summary_transcript_resolver.py` 调度字幕/ASR；`stepaudio_client.py` 调用 StepAudio 2.5 ASR SSE 接口
- **DeepSeek 客户端**: `deepseek_client.py` — 使用 `httpx`（非 `openai` SDK），支持流式 Chat Completions 和 JSON Output。默认关闭 thinking mode
- **总结编排器**: `summary_service.py` — 串联解析→稿→摘要→脑图→问答，SSE 流式输出阶段事件
- **内存存储**: 无数据库。转写任务和问答会话都存在内存 dict 中，默认 24h TTL，服务重启即丢失

### 前端关键模块

- **`App.tsx`**: 状态编排与页面切换（`home` ↔ `summary` 双页面）。核心状态：`url`、`stages`、`summaryMarkdown`、`mindmap`、`transcript`、`qaSessionId`、`isRunning`、`error`
- **组件组织**: `components/home/`（首页各区块）、`components/summary/`（总结页各面板）、`components/ui/`（Button、Input、TabButton、EmptyPanel、ErrorBoundary 等通用组件）
- **样式**: CSS 自定义属性 Token 系统在 `App.css` `:root` 中（~90 个 Token）。首页样式按区块拆分为 `HomeHero.css` 等 6 个文件。没有 CSS Modules，所有样式全局作用域
- **SSE 解析**: `api.ts` 用 `fetch` + `ReadableStream` 解析 SSE（不用原生 `EventSource`，因为需要 POST body 和 AbortController）
- **i18n**: `src/i18n/zh-CN.ts` 导出 `t()` 函数，目前仅中文
- **测试**: Vitest + @testing-library/react，配置文件在 `vite.config.ts` 的 `test` 块

## 重要约束

- **本地 MVP**: 无认证、无数据库、无多用户队列、无持久化。不要擅自引入登录/支付/数据库
- **不读取用户 Cookie**: 前端不提供 Cookie 输入框，后端不读取浏览器 Cookie。B 站只走匿名公开数据
- **字幕优先、ASR 兜底**: 有公开字幕直接使用，无字幕才自动触发 StepAudio 2.5 ASR。ASR 不应该是首选项
- **DeepSeek 密钥在后端**: `DEEPSEEK_API_KEY` 从 `.env` 读取，不返回前端、不写日志。默认模型 `deepseek-v4-flash`，默认关闭 thinking mode
- **优雅降级**: 思维导图或问答失败不影响摘要和原文稿展示（`partial_error` 事件）
- **设计系统**: 遵循 `DESIGN.md`（Stitch 格式），Restrained 色彩策略，单一强调色 `#004aad`。禁止玻璃拟态、禁止渐变文字、禁止侧边竖线装饰
- **CSS 变量优先**: 所有颜色/间距/圆角/阴影/动效使用 `var(--token)` 引用，`App.css` 中有完整 token 定义

## 平台 Provider 调度

B 站和抖音走专用 Provider，其他平台走 yt-dlp：

- **B 站**: 解析 HTML 页面中的 `window.__playinfo__`（DASH 流 + 普通 MP4 `durl`），兜底走 `x/player/playurl`。字幕走 `x/player/v2`。媒体下载带原页 Referer
- **抖音**: 实验性，优先 `iesdouyin` item info，兜底分享页 `_ROUTER_DATA`。只暴露 `source` + `audio` 档位
- **yt-dlp**: 兜底，覆盖其他平台

下载档位：`source`(最高可用MP4) / `4k` / `1080p` / `720p` / `audio`(纯音频MP3)。不可用档位标记 `available: false`。

## 错误处理模式

- 后端错误返回中文 `detail` 字段；SSE 流中错误分 `partial_error`（部分失败）和 `fatal_error`（致命失败）
- 前端 `ErrorBoundary` 包裹整个 App，捕获渲染崩溃后显示"出错了"界面+刷新按钮
- 前端可重试错误通过 `retryableError` 状态区分类型（`asr` / `deepseek`），提供差异化重试入口
