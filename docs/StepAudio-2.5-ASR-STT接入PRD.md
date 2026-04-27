# PRD: StepAudio 2.5 ASR STT 接入

## 1. Problem Statement

当前项目已经可以解析公开视频，并在 B 站场景下尽量获取匿名可访问字幕；但大量视频没有公开字幕，导致后续 AI 总结、原文稿检索和内容回顾缺少稳定文本输入。需要接入阶跃 StepAudio 2.5 ASR，在没有可用字幕时把视频音频转成文字稿，同时保持当前本地自用、无数据库、无账号和不读取 Cookie 的 MVP 边界。

不解决该问题的直接影响是：用户只能下载视频或音频，无法获得“不带字幕视频”的原文稿；长期的 AI 总结页、时间轴和知识提炼功能也缺少输入来源。

## 2. Goals

- **补齐无字幕视频文稿能力**：当用户输入链接解析视频时，若解析结果没有公开字幕或字幕解析失败，程序自动触发 STT，并获得完整转写文本。
- **复用现有解析与音频能力**：优先复用 Provider 调度、`ffmpeg` 和临时目录清理，不为 STT 单独重写视频解析链路。
- **控制成本和资源风险**：自动转写只在无字幕或字幕解析失败时发生，并通过单次音频时长、文件大小、并发数和超时限制控制资源消耗。
- **保护密钥和敏感信息**：StepFun API Key 只存在后端环境变量中，不进入前端、不写日志、不返回给客户端。
- **为 AI 总结提供文稿输入**：输出结构能被后续总结、关键词、导出功能复用。

## 3. Non-Goals

- **不做数据库和历史记录**：任务状态可以先用内存和临时文件承载，服务重启后任务丢失可接受。
- **不支持登录、会员或 Cookie 视频**：仍只处理公开视频，不读取浏览器 Cookie，也不新增用户 Cookie 输入框。
- **不做实时直播字幕**：StepAudio SSE 适合一次性提交音频并流式返回文本，本期不接 WebSocket 实时语音识别。
- **不承诺词级或句级时间戳**：当前 StepAudio 2.5 ASR SSE 文档返回增量文本和最终全文，未提供时间戳；本期只保证全文文本。

## 4. User Stories

### 本地自用用户

- 作为视频学习者，我想在视频没有公开字幕或字幕解析失败时自动获得文字稿，以便后续快速阅读、搜索和总结。
- 作为视频下载用户，我想明确看到“公开字幕可用”或“可转写生成文稿”，以便知道下一步该用字幕还是 ASR。
- 作为长视频用户，我想在转写过程中看到阶段状态，而不是页面长时间没有反馈。
- 作为成本敏感用户，我想只在公开字幕不可用时才自动转写，以免有字幕的视频也产生不必要的 ASR 调用费用。

### 维护者

- 作为项目维护者，我想把 StepAudio 调用封装为独立后端客户端，以便后续替换 ASR Provider 或补充测试。
- 作为项目维护者，我想通过 mock SSE 覆盖成功、错误、超时和缺少 API Key 等场景，以便不依赖真实外部调用完成回归。

## 5. Requirements

### P0 Must-Have

#### P0.1 后端配置与健康检查

后端通过项目根目录 `.env` 读取 StepFun API Key，配置项命名为 `STEP_API_KEY`。健康检查可扩展返回 STT 配置状态，但不得返回密钥值。

验收标准：

- [ ] `.env` 未配置 `STEP_API_KEY` 时，转写接口返回清晰中文错误。
- [ ] 日志、异常和接口响应中不出现 API Key。
- [ ] `GET /api/health` 至少能让前端判断 STT 是否可用或不可用。

#### P0.2 转写任务接口

新增异步任务式接口，避免把下载、抽音频、Base64 编码和 SSE 识别塞进现有解析接口。

建议接口：

- `POST /api/transcripts`：提交视频 URL，创建转写任务。
- `GET /api/transcripts/{taskId}`：查询任务状态和结果。

任务状态建议：

- `queued`
- `extracting_audio`
- `transcribing`
- `completed`
- `failed`

验收标准：

- [ ] 给定有效公开视频 URL，创建任务后返回 `taskId`。
- [ ] 查询任务可看到阶段状态、错误信息或最终 transcript。
- [ ] 服务重启后任务丢失时返回明确“任务不存在或已过期”提示。

#### P0.3 音频抽取与临时文件清理

后端复用现有 Provider 能力获取音频，使用 `ffmpeg` 生成 StepAudio 可接受的音频文件。优先使用 `mp3` 或 `wav`，避免 P0 阶段引入 PCM 元信息处理复杂度；如果选择 PCM，则必须传入采样率、位深和声道数。

验收标准：

- [ ] 有音频流的视频可以抽取出 ASR 输入音频。
- [ ] 缺少 `ffmpeg` 时返回中文错误，并提示无法转写。
- [ ] 成功、失败、取消或超时后都会清理临时音频文件。
- [ ] 单次音频文件大小、视频时长和任务耗时有上限，超限时不调用外部 ASR。

#### P0.4 StepAudio 2.5 ASR SSE 调用

后端调用 `POST https://api.stepfun.com/v1/audio/asr/sse`，请求头包含 `Content-Type: application/json`、`Accept: text/event-stream` 和后端注入的 Bearer token。请求体使用 `stepaudio-2.5-asr` 模型，音频数据使用 Base64 编码。

默认参数建议：

- `model`: `stepaudio-2.5-asr`
- `language`: `zh`
- `enable_itn`: `true`
- `format.type`: `mp3` 或 `wav`

验收标准：

- [ ] 能解析 `transcript.text.delta` 事件并更新内部进度文本。
- [ ] 能解析 `transcript.text.done` 事件并保存最终全文。
- [ ] 能处理 `error` 事件、HTTP 非 2xx、连接中断和超时。
- [ ] 不依赖 `prompt` 作为 P0 能力，因为官方 API 文档说明 `prompt` 仅对 `stepaudio-2-asr-pro` 有效。

#### P0.5 字幕优先与自动触发

解析阶段仍优先使用公开视频字幕。当 `subtitleStatus=unavailable`、字幕接口失败、字幕文件不可访问或字幕格式异常时，后端应自动创建 STT 任务，并把任务状态随解析结果返回给前端或提供可查询的任务 ID。

验收标准：

- [ ] 有公开字幕且解析成功时，前端默认展示字幕状态，不触发 ASR。
- [ ] 无公开字幕、字幕需要登录、字幕接口失败或字幕文件格式异常时，系统自动创建 STT 任务。
- [ ] 解析响应能让前端立即进入转写状态展示，无需用户再次点击。
- [ ] STT 自动触发失败时，不影响视频基础信息和下载档位展示。

#### P0.6 前端转写状态与结果展示

前端在现有解析结果区域增加轻量文稿区，展示公开字幕或 ASR 文稿来源、状态和错误提示。

验收标准：

- [ ] `queued`、`extracting_audio`、`transcribing`、`completed`、`failed` 都有清晰中文状态。
- [ ] 转写中页面不空白，用户能看到正在处理。
- [ ] 完成后展示全文文稿，并标记来源为 `asr`。
- [ ] 失败时不影响已有视频下载能力。

#### P0.7 后端测试

新增后端测试覆盖任务创建、StepAudio SSE 解析、错误映射、缺少 API Key 和临时文件清理。

验收标准：

- [ ] 不需要真实 StepFun API Key 就能跑完后端测试。
- [ ] `.venv/bin/python -m pytest backend/tests` 通过。
- [ ] 前端类型或界面改动后 `cd frontend && npm run build` 通过。

### P1 Nice-to-Have

#### P1.1 文稿导出

支持把 ASR 文稿导出为 `.txt` 或 `.md`。

验收标准：

- [ ] 用户能下载当前文稿。
- [ ] 文件名沿用视频标题并清理非法字符。

#### P1.2 语言选择

前端允许用户选择中文或英文识别，默认中文。

验收标准：

- [ ] 创建任务时可传入 `language`。
- [ ] 不支持的语言返回前端可理解的错误。

#### P1.3 热词配置

允许在后端配置固定热词，改善课程、品牌名、专有名词识别。

验收标准：

- [ ] 热词只从后端配置读取，不让普通用户输入敏感提示。
- [ ] 热词为空时不影响转写。

#### P1.4 简单分段

对最终全文做段落切分，提升阅读体验。

验收标准：

- [ ] 分段不改变原文顺序。
- [ ] 切分失败时仍展示完整全文。

### P2 Future Considerations

- **持久化任务系统**：当 STT、总结和导出串联后，引入数据库或轻量持久化任务表。
- **多 ASR Provider**：把 StepAudio 封装在 Provider 接口后，未来可接入本地 Whisper 或其他云 ASR。
- **时间戳文稿**：当 ASR Provider 支持时间戳时，扩展 `SubtitleCue` 或新增 `TranscriptSegment`。
- **AI 总结消费链路**：已实现，以字幕或 ASR 文稿作为输入生成摘要、关键词和思维导图。

## 6. Success Metrics

### Leading Indicators

- **转写任务完成率**：有效无字幕公开视频的 STT 任务完成率达到 90% 以上。
- **可理解错误率**：失败任务中 95% 以上能归因到缺少 API Key、平台限制、音频抽取失败、ASR 失败、超时或超限。
- **用户等待可见性**：100% 转写任务都有阶段状态，不出现无反馈等待。
- **测试覆盖**：StepAudio 客户端 SSE 解析和任务状态核心分支有后端单元测试覆盖。

### Lagging Indicators

- **文稿可用率**：无公开字幕视频中，至少 80% 能通过 ASR 获得可阅读全文。
- **AI 总结准备度**：后续总结功能可以直接复用同一 transcript 数据结构，不需要重做输入层。
- **成本可控性**：本地记录每次转写音频时长，月度成本可按 StepAudio 2.5 ASR 单价估算。

## 7. Open Questions

- **[产品 / 非阻塞]** 有公开字幕时是否还允许用户手动“重新转写”？P0 默认不提供，避免额外成本。
- **[工程 / 阻塞]** P0 的单次时长上限是多少？建议先设 30 分钟或更低，避免 Base64 JSON 请求占用过多内存。
- **[工程 / 阻塞]** 是否接受内存任务状态？建议 P0 接受，后续总结链路再引入持久化。
- **[工程 / 非阻塞]** ASR 输入格式选择 `mp3` 还是 `wav`？建议 P0 选 `mp3`，实现更贴近当前音频下载链路。
- **[产品 / 非阻塞]** 文稿结果是否需要复制按钮、下载按钮和来源标签？建议 P0 至少做来源标签和复制。
- **[工程 / 非阻塞]** 是否需要 Step Plan 接入路径？如果使用 Step Plan，应把 API base URL 做成配置项。

## 8. Timeline Considerations

### Phase 1: 后端最小闭环

- 新增 StepAudio ASR 客户端。
- 新增内存任务管理与转写接口。
- 复用现有下载/音频抽取能力生成 ASR 输入文件。
- 用 mock SSE 完成后端测试。

### Phase 2: 前端入口与状态

- 在解析结果区增加字幕/文稿模块。
- 无字幕或字幕解析失败时自动进入转写状态。
- 轮询任务状态并展示最终文稿或错误。
- 运行前端构建验证。

### Phase 3: 边界加固

- 补充时长、文件大小、并发和超时配置。
- 清理临时文件和任务过期策略。
- 增加成本估算和错误分类文案。

## 9. Technical Notes

StepAudio 2.5 ASR 官方文档信息：

- 模型名：`stepaudio-2.5-asr`。
- 官方说明为 4B 参数 ASR 模型，支持中英文识别。
- HTTP/SSE 接口：`POST https://api.stepfun.com/v1/audio/asr/sse`。
- Step Plan 接口：`POST https://api.stepfun.com/step_plan/v1/audio/asr/sse`。
- 支持音频格式：`ogg`、`mp3`、`wav`、`pcm`。
- SSE 事件包括 `transcript.text.delta`、`transcript.text.done` 和 `error`。
- 当前公开定价为 `0.15 元 / 小时`。

资料来源：

- [StepAudio 2.5 ASR 模型文档](https://platform.stepfun.com/docs/zh/guides/models/stepaudio-2.5-asr)
- [语音识别（流式返回文本）API](https://platform.stepfun.com/docs/zh/api-reference/audio/asr-sse)
- [StepFun 定价与限速](https://platform.stepfun.com/docs/zh/guides/pricing/details)
