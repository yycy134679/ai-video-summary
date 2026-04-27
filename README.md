# AI 视频摘要助手

<div align="center">

Paste a public video link, get a structured summary, mind map, full transcript, and interactive Q&A — in one shot.

[![Python](https://img.shields.io/badge/Python-3.11+-3c873a?style=flat-square&logo=python)](https://www.python.org)
[![Node.js](https://img.shields.io/badge/Node.js-20+-3c873a?style=flat-square&logo=nodedotjs)](https://nodejs.org)
[![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square&logo=react)](https://react.dev)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi)](https://fastapi.tiangolo.com)
[![DeepSeek](https://img.shields.io/badge/DeepSeek-V4_Flash-4f46e5?style=flat-square)](https://platform.deepseek.com)

[Overview](#overview) • [Quick Start](#quick-start) • [APIs](#api-endpoints) • [Project Structure](#project-structure) • [Configuration](#configuration) • [Platform Support](#platform-support)

</div>

## Overview

AI Video Summary Assistant is a local self-serve MVP that transforms public video links into actionable knowledge assets. The pipeline automatically:

1. Parses the video metadata (title, author, duration, cover, available download qualities)
2. Extracts the transcript — preferring public subtitles, falling back to **StepAudio 2.5 ASR**
3. Calls **DeepSeek V4 Flash** to generate a structured Markdown summary with streaming typewriter effect
4. Produces a collapsible **mind map** (SVG/PNG exportable)
5. Sets up a temporary **Q&A session** for follow-up questions based on the full transcript

No database, no accounts, no history — everything lives in memory with TTL cleanup.

> [!NOTE]
> This is a local/dev-only MVP. Do not expose the current synchronous download, in-memory transcript, or Q&A endpoints directly as a multi-user public service.

## Features

- **One-click pipeline** — parse, transcribe, summarize, mind-map, and Q&A readiness in a single request
- **Subtitle-first, ASR fallback** — uses public subtitles when available, otherwise triggers StepAudio 2.5 ASR with automatic audio chunking for large files
- **Streaming summary** — DeepSeek streams Markdown deltas for a typewriter effect in the UI
- **Structured output** — deterministic rule-based parser extracts one-sentence summary, key points, chapter overview, keywords, actions, and cautions from the generated Markdown
- **Collapsible mind map** — tree visualization (max 4 levels, 12 nodes/level) with SVG and PNG export; auto-retry on JSON validation failure
- **Interactive Q&A** — in-memory chat session scoped to the transcript + summary, with TTL-based expiry (default 24 h)
- **Multi-platform download** — `source` / 4K / 1080p / 720p / audio MP3 qualities, with streaming `FileSystemWritableFileStream` progress
- **Graceful degradation** — mind-map or Q&A failures do not block the summary or transcript display

## Architecture

```
Browser (React + Vite + Tailwind CSS v4)
        │  SSE (fetch + ReadableStream)
        ▼
FastAPI backend
 ├── Provider layer      → Bilibili / Douyin (custom), yt-dlp (fallback)
 ├── Transcript layer    → subtitles → StepAudio 2.5 ASR
 ├── DeepSeek client     → Chat Completions (streaming + JSON Output)
 ├── Summary orchestrator → SSE stage events, mind-map, Q&A session
 └── In-memory store     → transcript tasks + Q&A sessions (TTL)
```

The frontend reads SSE events from `POST /api/summaries/stream` (not native `EventSource`) to support POST bodies and cancellation via `AbortController`.

## Prerequisites

- **Python 3.11+** with venv
- **Node.js 20+** with npm
- **[ffmpeg](https://ffmpeg.org)** — required for audio extraction, DASH stream merging, and audio segmenting
- **StepFun API Key** — needed for automatic STT when subtitles are unavailable ([get one](https://platform.stepfun.com))
- **DeepSeek API Key** — needed for AI summary, mind-map, and Q&A ([get one](https://platform.deepseek.com))

## Quick Start

### 1. Clone & install

```bash
git clone <repo-url> && cd ai-video-summary

# Backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r backend/requirements.txt
cp .env.example .env
```

Edit `.env` and set your keys:

```env
STEP_API_KEY=sk-...
DEEPSEEK_API_KEY=sk-...
```

```bash
# Frontend
cd frontend
npm install
```

### 2. Start the services

```bash
# Terminal 1 — backend (from repo root)
source .venv/bin/activate
uvicorn backend.app.main:app --reload
# → http://127.0.0.1:8000

# Terminal 2 — frontend
cd frontend
npm run dev
# → http://127.0.0.1:5173
```

### 3. Verify health

```bash
curl http://127.0.0.1:8000/api/health
# → {"status":"ok","ffmpegAvailable":true,"sttAvailable":true,"deepseekAvailable":true}
```

If `sttAvailable` or `deepseekAvailable` is `false`, check your `.env` keys.

### 4. Use the app

Open `http://127.0.0.1:5173`, paste a public video link, select a summary style, and click "立即生成报告".

### 5. Run tests

```bash
.venv/bin/python -m pytest backend/tests
cd frontend && npm run build
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/health` | Backend status, ffmpeg/STT/DeepSeek availability |
| `POST` | `/api/videos/parse` | Parse video info, download qualities, and subtitle status |
| `GET` | `/api/videos/download?url=&quality=` | Download video/audio by quality level |
| `POST` | `/api/transcripts` | Manually create a transcript task |
| `GET` | `/api/transcripts/{taskId}` | Poll transcript task status and result |
| `POST` | `/api/summaries/stream` | SSE stream: stages, video info, transcript, summary delta/done, mind-map, Q&A session |
| `POST` | `/api/summaries/{sessionId}/questions/stream` | SSE stream: ask follow-up questions against the transcript |

SSE responses use `text/event-stream` with `Cache-Control: no-cache`. Event types include `stage`, `video`, `transcript`, `summary_delta`, `summary_done`, `mindmap_done`, `qa_ready`, `partial_error`, `fatal_error`, `done`.

## Project Structure

```
ai-video-summary/
├── backend/
│   ├── app/
│   │   ├── main.py                    # FastAPI entry, CORS, routes
│   │   ├── models.py                  # Pydantic models
│   │   ├── env_config.py              # .env loader
│   │   ├── video_service.py           # Provider dispatch & download
│   │   ├── transcript_service.py      # In-memory transcript tasks & TTL
│   │   ├── stepaudio_client.py        # StepAudio 2.5 ASR SSE client
│   │   ├── deepseek_client.py         # DeepSeek Chat Completions (stream + JSON)
│   │   ├── summary_service.py         # Summary orchestrator & Q&A SSE
│   │   ├── summary_models.py          # Summary, mind-map, Q&A models
│   │   ├── summary_events.py          # SSE event formatter
│   │   ├── summary_markdown_parser.py # Deterministic summary parser
│   │   ├── summary_session_store.py   # In-memory Q&A session store & TTL
│   │   ├── summary_transcript_resolver.py  # Subtitle/ASR dispatch
│   │   ├── prompt_templates.py        # System prompts & style templates
│   │   └── providers/                 # Platform-specific providers
│   │       ├── base.py
│   │       ├── bilibili_provider.py   # Bilibili HTML-page parsing
│   │       ├── douyin_provider.py     # Douyin experimental provider
│   │       └── yt_dlp_provider.py     # yt-dlp fallback
│   ├── requirements.txt
│   └── tests/
│       ├── test_video_service.py
│       └── test_ai_summary.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx                    # Home page + summary result page
│   │   ├── App.css                    # Tailwind CSS v4 entry
│   │   ├── api.ts                     # Fetch wrappers & SSE parser
│   │   ├── types.ts
│   │   ├── constants/
│   │   │   ├── home.ts               # Homepage copy & marketing data
│   │   │   └── summary.ts            # Summary styles & stage definitions
│   │   └── utils/
│   │       ├── format.ts             # Duration / timestamp formatting
│   │       ├── mindmap.ts            # Mind-map layout & tree utilities
│   │       ├── summaryExport.ts      # Markdown export builder
│   │       └── url.ts                # URL validation & safe filenames
│   ├── package.json
│   └── vite.config.ts
├── docs/                              # Design docs, PRDs, platform notes
├── DESIGN/                            # Visual design mockups
├── .env.example
└── README.md
```

## Configuration

All config lives in `.env` at the repo root. Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `STEP_API_KEY` | — | StepFun API key (required for ASR) |
| `STEP_ASR_MAX_DURATION_MINUTES` | `30` | Max single-video STT duration |
| `STEP_ASR_MAX_REQUEST_FILE_MB` | `39` | Audio size threshold before chunked ASR |
| `DEEPSEEK_API_KEY` | — | DeepSeek API key (required for summary) |
| `DEEPSEEK_MODEL` | `deepseek-v4-flash` | Model for summaries and Q&A |
| `DEEPSEEK_THINKING_ENABLED` | `false` | Enable DeepSeek thinking mode |
| `DEEPSEEK_REQUEST_TIMEOUT_SECONDS` | `900` | Request timeout (longer for full transcripts) |
| `AI_SUMMARY_SESSION_TTL_SECONDS` | `86400` | Q&A session expiry (24 h) |
| `AI_SUMMARY_CUSTOM_PROMPT_MAX_CHARS` | `2000` | Max custom prompt length |

## Platform Support

| Platform | Provider | Download | Subtitles | Notes |
|----------|----------|----------|-----------|-------|
| Bilibili | Custom (`bilibili_provider`) | `source` (best available MP4), 720p, audio | Anonymous public subtitles via `x/player/v2` | No login — availability depends on anonymous access level |
| Douyin | Custom (`douyin_provider`) | `source`, audio | N/A | Experimental — watermark removal not guaranteed |
| Other platforms | `yt-dlp` | 4K / 1080p / 720p / audio | Via yt-dlp extractors | Coverage depends on installed yt-dlp version |

**Download qualities**: `source` (best available MP4), `4k`, `1080p`, `720p`, `audio` (MP3). Unavailable qualities are marked `available: false` in the parse response.

For Bilibili videos, the `source` quality reflects the best MP4 available under anonymous access — it does not represent the platform's maximum possible quality. Frontend cover images use `referrerPolicy="no-referrer"` to avoid Bilibili CDN Referer blocks.

## Limitations

- Local/dev-only MVP — no authentication, rate limiting, quota management, SSRF protection, or persistent storage
- Transcript tasks and Q&A sessions reset on server restart
- Douyin provider is experimental and does not guarantee watermark-free output
- Bilibili provider reads only anonymous public data — login-only subtitles, region-locked content, and high-quality streams (1080p+) may be unavailable
- Page refresh discards all current results with no recovery path
