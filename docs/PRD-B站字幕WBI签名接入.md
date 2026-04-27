# B 站字幕 WBI 签名接入 PRD

> 文档类型：产品需求文档  
> 状态：待评审  
> 关联文档：`docs/B站解析接入记录.md`、`docs/方案设计.md`  
> 调研参考：[Bili23-Downloader](https://github.com/ScottSloan/Bili23-Downloader) (GPL-3.0) WBI 签名实现

---

## 1. 问题陈述

当前 `BilibiliProvider` 调用 B 站未签名的 `x/player/v2` 接口获取字幕列表，绝大多数视频因缺少 WBI 签名和设备指纹参数而返回空结果或 `need_login_subtitle=true`，导致字幕获取成功率极低。用户只能依赖 StepAudio 2.5 ASR 转写，但 ASR 准确率波动大，影响了 AI 视频总结质量。

调研确认：B 站已逐步强制要求 API 携带 WBI 签名和会话级设备指纹参数。**WBI 签名不依赖登录态**，仅需从 B 站公开接口获取 `img_key` 和 `sub_key` 即可完成，技术上可在保持"不读取用户 Cookie"的安全边界下实施。

## 2. 目标

| # | 目标 | 衡量方式 |
|---|------|----------|
| G1 | 字幕获取成功率从当前 ~10% 提升至 85%+（匿名可访问视频） | 随机抽样 50 个 B 站公开视频，对比改造前后 `subtitleStatus=available` 的比例 |
| G2 | 保持"无 Cookie / 无登录"的安全边界，不引入新的隐私风险 | 代码审计确认：无 Cookie 读取、无 SESSDATA 存储、无扫码登录流程 |
| G3 | 为后续视频解析 API 升级（`/wbi/view` 替代 HTML 页面解析）提供可复用的 WBI 签名基础设施 | WBI 签名封装为独立可复用模块，被字幕和视频解析共用 |
| G4 | 改造不破坏现有视频解析、下载、DASH 合并等主流程 | `backend/tests` 全部通过；使用真实 B 站链接手工验证完整链路 |

## 3. 非目标

| # | 非目标 | 原因 |
|---|--------|------|
| N1 | 引入 Bili23-Downloader 作为代码依赖 | 其深度依赖 PySide6 GUI 框架，不适合服务端部署；WBI 签名逻辑可自主实现（约 30 行） |
| N2 | 实现扫码登录或 SESSDATA/Cookie 管理 | 违反项目"不读取用户 Cookie"的安全边界；登录态字幕属于少数场景，优先级低 |
| N3 | 全面重写 BilibiliProvider 为纯 API 驱动 | 当前 HTML 解析 + API 兜底的混合架构在生产中已验证稳定；API 化可作为后续独立迭代 |
| N4 | 支持弹幕下载、歌词下载或其他附加文件 | 超出 AI 视频总结 MVP 范围；可在后续需求中基于 WBI 基础设施扩展 |
| N5 | 替换 `yt-dlp` 或其他平台 Provider | 改动范围仅限 B 站 Provider |

## 4. 用户故事

### 核心用户：使用 AI 视频总结的普通用户

| 优先级 | 用户故事 |
|--------|----------|
| P0 | 作为用户，我希望粘贴 B 站视频链接后，系统能优先读取 B 站官方字幕（而非 ASR 转写），这样我得到的 AI 总结更准确 |
| P0 | 作为用户，当视频确实没有公开字幕时，我仍能看到清晰的提示并自动降级到 ASR 转写，不会因为字幕失败而中断整个流程 |
| P1 | 作为用户，当字幕获取成功时，我能看到字幕来源标注为"B 站公开字幕"而非"ASR"，以便了解文稿可信度 |
| P2 | 作为开发者，我希望 WBI 签名模块可被字幕和视频解析共用，后续升级视频解析时不需要重复实现签名逻辑 |

### 边缘场景

- **WBI 密钥获取失败**（B 站接口临时不可用）：应返回友好中文错误并降级到 ASR，不阻塞视频解析
- **字幕接口返回 `need_login_subtitle=true`**：标记为字幕不可用 + 具体原因（"需要登录"），自动走 ASR 兜底
- **字幕 JSON 格式异常**（与现有已处理场景一致）：标记为字幕不可用并走 ASR，不抛异常
- **WBI 签名计算错误**（参数格式异常）：不影响视频标题/封面/流解析，仅字幕不可用

## 5. 需求

### 5.1 Must-Have (P0)

#### R1: WBI 签名模块

**描述**：实现一个独立的 WBI 签名模块，供 BilibiliProvider 内部调用。

**关键行为**：
- 首次调用或密钥过期时，从 `https://api.bilibili.com/x/web-interface/wbi/index` 获取 `img_key` 和 `sub_key`
- 根据标准 WBI 算法计算 `mixin_key`（参考 [SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) 的 `mixinKeyEncTab`）
- 对任意 `dict[str, Any]` 参数自动添加 `wts`（时间戳）和 `w_rid`（MD5 签名），返回 URL-encoded 签名字符串
- 密钥缓存在 Provider 实例生命周期内，避免每次请求都重新获取

**验收标准**：
- [ ] 给定已知的 `img_key`、`sub_key`、时间戳和参数，签名结果与参考实现一致
- [ ] 连续调用多次 API 不会重复请求 `wbi/index`
- [ ] 签名计算发生在 Provider 内部，不对外暴露 `img_key`/`sub_key`

#### R2: 字幕接口升级为 WBI 签名版本

**描述**：将 `_fetch_subtitle_result` 中的 `x/player/v2` 调用替换为 `x/player/wbi/v2`，并添加设备指纹参数。

**关键行为**：
- API 端点从 `https://api.bilibili.com/x/player/v2` 改为 `https://api.bilibili.com/x/player/wbi/v2`
- 请求参数通过 WBI 签名模块签名
- 新增设备指纹参数：`dm_img_list`、`dm_img_str`、`dm_cover_img_str`、`dm_img_inter`（使用与 Bili23-Downloader 一致的固定常量值）
- 保持现有的 `need_login_subtitle` 检测和降级逻辑不变
- 保持现有的字幕 JSON 下载和解析不变

**验收标准**：
- [ ] 给定一个有公开字幕的 B 站视频链接，`subtitleStatus` 返回 `"available"` 且 `subtitles` 非空
- [ ] 给定一个已知 `need_login_subtitle=true` 的视频链接，`subtitleStatus` 返回 `"unavailable"` 且提示"需要登录"
- [ ] 给定一个没有字幕的视频链接，`subtitleStatus` 返回 `"unavailable"` 且提示"没有可匿名访问字幕"
- [ ] 字幕获取失败不影响 `VideoInfo` 的标题、封面、下载档位等字段

#### R3: 保持现有降级和错误处理策略

**描述**：WBI 签名升级后，原有的"字幕优先、ASR 兜底"策略不变。

**关键行为**：
- 字幕成功 → 使用公开字幕生成总结
- 字幕失败（签名失败、接口不可用、`need_login_subtitle`、无字幕数据）→ 自动创建 ASR 转写任务
- BilibiliProvider 本身不直接调用 ASR（与现有行为一致）
- 视频解析本身不因字幕失败而中断（与现有行为一致）

**验收标准**：
- [ ] WBI 密钥获取失败时，`subtitleStatus=unavailable`，解析仍成功
- [ ] WBI 签名后的接口返回 412/403 时，`subtitleStatus=unavailable`，解析仍成功
- [ ] 字幕成功后，`summary_transcript_resolver.py` 优先使用字幕而非 ASR

### 5.2 Nice-to-Have (P1)

#### R4: 前端展示字幕来源标识

**描述**：当字幕来源为 B 站公开字幕时，前端显示"B 站公开字幕"；来源为 ASR 时显示"AI 语音识别"。

**验收标准**：
- [ ] 前端 `SummaryTranscript.source` 为 `"subtitle"` 时显示对应标识
- [ ] 前端 `SummaryTranscript.source` 为 `"asr"` 时显示对应标识

#### R5: 视频信息接口也接入 WBI 签名（可选）

**描述**：将 `_fetch_playurl_data` 中的播放地址接口也改为 WBI 签名版本（`x/player/wbi/playurl`）。

**说明**：当前 HTML 页面解析的 `window.__playinfo__` 仍作为主路径，API 为兜底。改为签名版 API 可能提高兜底成功率，但不是字幕改造的必要部分。

**验收标准**：
- [ ] 当页面 `__playinfo__` 缺失时，WBI 签名的播放地址接口能正常返回数据
- [ ] WBI 签名失败时回退到现有无签名接口

### 5.3 Future Considerations (P2)

#### F1: 视频元信息接口 API 化

将 `build_media_from_page` 中的 HTML 页面解析（`window.__INITIAL_STATE__`）替换为 `x/web-interface/wbi/view` API 调用。减少对页面 DOM 结构的耦合，提高稳定性。

#### F2: 设备指纹参数动态化

当前使用固定常量值作为 `dm_img_*` 参数。后续可以动态生成更真实的设备指纹，进一步提高 API 成功率。

#### F3: 多语言字幕自动选择

当前只取第一条匹配字幕。后续可根据用户偏好语言或视频原标题语言自动选择最合适的字幕。

## 6. 成功指标

### 前置指标（上线后 1-2 周可观察）

| 指标 | 现状（估算） | 目标 | 测量方法 |
|------|-------------|------|----------|
| 字幕获取成功率 | ~10% | ≥ 85% | 后端日志统计 `subtitleStatus=available` 比例 |
| 字幕链路 P99 延迟 | N/A（几乎都是失败） | < 3s（含 WBI 密钥获取 + 字幕接口 + JSON 下载） | 后端打点计时 |
| WBI 密钥获取成功率 | 0%（不存在） | ≥ 99% | 后端日志统计 `wbi/index` 调用成功率 |

### 后置指标（上线后 1 个月可观察）

| 指标 | 目标 | 测量方法 |
|------|------|----------|
| ASR 调用量下降 | 下降 ≥ 60%（字幕命中的视频不再走 ASR） | 统计 `transcript_service.create_transcript_task` 调用量 |
| AI 总结质量提升 | 无法直接量化，但用户反馈中"识别不准"相关投诉减少 | 人工巡检：随机抽样 20 个视频对比字幕版 vs ASR 版摘要质量 |
| STT API 费用下降 | 与 ASR 调用量下降成正比 | StepFun API 账单对比 |

## 7. 技术约束

- **语言**：Python 3.11+，仅使用标准库 (`hashlib`, `urllib.parse`, `time`, `functools`) + 已有依赖 (`httpx`)
- **依赖**：不新增任何 PyPI 包
- **代码位置**：WBI 签名模块放在 `backend/app/providers/bilibili_wbi.py`；`bilibili_provider.py` 中引用
- **测试**：新增 `backend/tests/test_bilibili_wbi.py` 覆盖签名计算
- **安全**：签名计算只依赖从 B 站公开接口获取的 `img_key`/`sub_key`，不涉及 Cookie 或用户隐私数据

## 8. 架构设计概要

```
backend/app/providers/
├── bilibili_wbi.py          # [新增] WBI 签名模块
│   ├── get_wbi_keys()       #   获取并缓存 img_key + sub_key
│   └── sign_params(params)  #   对参数字典进行 WBI 签名，返回 URL-encoded 字符串
├── bilibili_provider.py     # [修改]
│   ├── _fetch_subtitle_result()    #   x/player/v2 → x/player/wbi/v2 + 签名 + 设备指纹
│   └── _resolve_media()            #   不变（保持 HTML 解析主路径）
└── ...
```

**WBI 签名流程**：

```
1. 检查缓存 → 有效则直接用
2. GET https://api.bilibili.com/x/web-interface/wbi/index → {img_key, sub_key}
3. mixin_key = 按 mixinKeyEncTab 对 (img_key + sub_key) 重排取前 32 字符
4. params["wts"] = 当前 Unix 时间戳（秒）
5. params 按 key 字母排序，过滤特殊字符 '!()*'
6. query = URL-encode(params)
7. w_rid = MD5(query + mixin_key)
8. params["w_rid"] = w_rid
9. 返回 URL-encode(params)
```

**字幕请求参数差异**：

| 参数 | 当前（x/player/v2） | 改造后（x/player/wbi/v2） |
|------|---------------------|--------------------------|
| `bvid` | ✓ | ✓ |
| `cid` | ✓ | ✓ |
| `wts` | ✗ | ✓（时间戳） |
| `w_rid` | ✗ | ✓（签名） |
| `dm_img_list` | ✗ | ✓（设备指纹） |
| `dm_img_str` | ✗ | ✓（设备指纹） |
| `dm_cover_img_str` | ✗ | ✓（设备指纹） |
| `dm_img_inter` | ✗ | ✓（设备指纹） |

## 9. 未解决问题

| # | 问题 | 负责人 | 阻塞性 |
|---|------|--------|--------|
| Q1 | 是否需要在 `_fetch_playurl_data` 中也接入 WBI 签名？（当前仍用无签名版，作为 HTML 解析的兜底） | 开发 | 不阻塞 |
| Q2 | 设备指纹常量值（`dm_img_str` 等）是使用 Bili23-Downloader 硬编码的值还是动态生成？ | 开发 | 不阻塞，先用硬编码值 |
| Q3 | 是否需要对接入前/后的字幕成功率做一段时间的数据对比？ | 产品 | 不阻塞 |

## 10. 时间线

| 阶段 | 内容 | 预估工期 |
|------|------|----------|
| Phase 1 | WBI 签名模块 + 单元测试 | 0.5 天 |
| Phase 2 | 字幕接口升级 + 集成测试 | 0.5 天 |
| Phase 3 | 前端来源标识（P1） | 0.25 天 |
| Phase 4 | 手工验证（多场景 B 站链接） | 0.25 天 |
| **合计** | | **1.5 天** |

**依赖**：无外部依赖。

**风险**：
- 低风险：WBI 签名算法是公开标准，Bili23-Downloader 和 bilibili-API-collect 均提供了经过验证的实现
- 中风险：B 站可能进一步收紧匿名 API 权限或修改 WBI 签名算法 → 需关注 [SocialSisterYi/bilibili-API-collect](https://github.com/SocialSisterYi/bilibili-API-collect) 更新

---

> **建议**：Phase 1-2 完成后即合并到 main 并手工验证；Phase 3 前端标识可随下个需求一起上线。
