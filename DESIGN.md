---
name: AI 视频摘要助手
description: 将公开视频链接转化为结构化知识资产的 AI 摘要工具，追求通透感与秩序感的现代专业主义界面。
colors:
  primary: "#004aad"
  primary-dark: "#003983"
  primary-soft: "#e8f0ff"
  primary-gradient-start: "#1f6fff"
  primary-gradient-mid: "#0052cc"
  primary-gradient-end: "#003d9b"
  secondary-blue-bg: "#eef4ff"
  secondary-blue-text: "#0052cc"
  ink: "#071b3a"
  hero-ink: "#03152f"
  muted: "#5d6678"
  surface: "#ffffff"
  surface-soft: "#f8fbff"
  line: "#dfe5ef"
  line-strong: "#c7d0df"
  success: "#087443"
  warning: "#8a5a00"
  danger: "#b42318"
  premium: "#f0a72f"
  premium-dark: "#8a5a00"
typography:
  headline:
    fontFamily: '"Avenir Next", "HarmonyOS Sans SC", Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: "26px"
    fontWeight: 850
    lineHeight: "1.35"
  title:
    fontFamily: '"Avenir Next", "HarmonyOS Sans SC", Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: "22px"
    fontWeight: 700
    lineHeight: "1.35"
  subtitle:
    fontFamily: '"Avenir Next", "HarmonyOS Sans SC", Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: "19px"
    fontWeight: 600
    lineHeight: "1.4"
  body:
    fontFamily: '"Avenir Next", "HarmonyOS Sans SC", Inter, ui-sans-serif, system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "1.78"
  label:
    fontFamily: '"Avenir Next", "HarmonyOS Sans SC", Inter, ui-sans-serif, system-ui, sans-serif'
    fontSize: "13px"
    fontWeight: 500
    lineHeight: "1.2"
    letterSpacing: "0.02em"
rounded:
  sm: "5px"
  md: "8px"
  lg: "12px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "16px"
  md: "24px"
  lg: "40px"
  xl: "64px"
  container-max: "1180px"
components:
  button-primary:
    backgroundColor: "linear-gradient(135deg, #1f6fff, #0052cc 62%, #003d9b)"
    textColor: "#ffffff"
    rounded: "10px"
    padding: "0 20px"
  button-primary-hover:
    textColor: "#ffffff"
  button-secondary:
    backgroundColor: "#f5f9ff"
    textColor: "#0052cc"
    rounded: "10px"
    padding: "0 20px"
  button-ghost:
    backgroundColor: "rgba(255,255,255,0.8)"
    textColor: "#1d3052"
    rounded: "10px"
    padding: "0 20px"
  input:
    backgroundColor: "#ffffff"
    textColor: "#041b3c"
    rounded: "{rounded.lg}"
    padding: "0 16px"
  card:
    backgroundColor: "rgba(255,255,255,0.92)"
    rounded: "{rounded.md}"
    padding: "28px 28px 30px"
---

# Design System: AI 视频摘要助手

## 1. Overview

**Creative North Star: "通透工作室 (The Translucent Studio)"**

这是一个为知识工作者打造的 AI 工具界面。设计语言的核心隐喻是"通透工作室"：一个光线充足、秩序井然的私人工作空间，AI 在这里是安静的协作者而非喧哗的主角。界面服务于内容 — 视频摘要、文稿、思维导图 — 而非自我展示。

色彩系统以信任蓝为单一强调色，大面积留白和冰蓝底色营造冷静、专注的氛围。排版强调层级对比：标题厚重锚定视线，正文行高慷慨（1.78）确保长文本阅读不疲劳。所有交互元素带有克制的微交互反馈 — 悬浮时轻微上浮 1px，聚焦时外发光环 — 不喧哗但明确可感知。

这个系统明确拒绝：AI 工具的"赛博/霓虹"刻板印象；过度的装饰性渐变和模糊效果；千篇一律的 SaaS 指标卡片模板；模态弹窗打断流程。

**Key Characteristics:**
- 通透感优先：大量留白、冰蓝底色、半透明白色卡片，信息不被容器压迫
- 单一信任蓝强调色：≤10% 表面占比，通过稀缺性建立视觉权重
- 微交互明确但不张扬：1px 悬浮抬升、指数缓出过渡、聚焦外发光环
- 内容即界面：摘要 Markdown 区、文稿区以类文档排版呈现，不嵌套多余卡片
- 优雅降级视觉化：失败不影响已有结果，警告信息以淡色背景横向展开而非模态阻断

## 2. Colors

本系统为 Restrained 策略：tinted neutrals + 单一强调色 ≤10% 表面占比。信任蓝 (#004aad) 是唯一强调色，通过稀缺性建立权重 — 只有 CTA、链接、聚焦态、活跃标签使用。

### Primary
- **信任蓝 (Trust Blue)** (#004aad): 主 CTA 按钮、文字链接、聚焦边框、活跃标签页指示器。系统中最稀缺的颜色。
- **深蓝墨 (Deep Blue Ink)** (#003983): 主按钮悬浮态加深。不单独出现。
- **晨雾蓝 (Morning Mist Blue)** (#e8f0ff): AI 摘要区底色、信息提示背景、行内代码背景。柔化内容区边界的最浅蓝。
- **渐变蓝按钮 (Blue Gradient Button)**: `linear-gradient(135deg, #1f6fff, #0052cc 62%, #003d9b)` — 仅用于主行动按钮，赋予 CTA 微妙的立体感和能量。

### Secondary
- **冰蓝底 (Ice Blue Background)** (#eef4ff): 次要按钮背景色。
- **蓝墨文字 (Blue Ink Text)** (#0052cc): 次要按钮文字色、部分强调链接。

### Neutral
- **深海军蓝 (Deep Navy Ink)** (#071b3a): 主标题和正文文字。非纯黑，带微量蓝调 (chroma ~0.01)。
- **石板灰 (Slate Ash)** (#5d6678): 辅助文字、说明标注。对比度满足 WCAG AA 正文标准。
- **纯白壳 (Pure White Shell)** (#ffffff): 卡片和面板背景。
- **冰蓝白 (Ice Blue White)** (#f8fbff): 页面底色、空状态区域。极微量蓝调区分纯白卡片。
- **冷灰线 (Cool Gray Line)** (#dfe5ef): 默认边框、分割线。
- **钢灰线 (Steel Line)** (#c7d0df): 强调边框、虚线边框（空状态区域）。

### Functional
- **林绿 (Forest Green)** (#087443): 成功状态。
- **琥珀棕 (Amber Brown)** (#8a5a00): 警告状态。
- **红陶 (Red Clay)** (#b42318): 错误状态、危险操作。

### Premium
- **金色时刻 (Golden Hour)** (#f0a72f): 高级功能标识。
- **深琥珀 (Deep Amber)** (#8a5a00): 高级功能深色变体。

### Named Rules
**The One Accent Rule.** 信任蓝仅用于 ≤10% 的表面区域。CTA、链接、聚焦环、活跃指示器 — 仅此四处。不允许蓝色装饰性边框、蓝色背景区块、蓝色强调文字。稀缺性是它的力量。

**The Tinted Neutral Rule.** 每个中性色都带有微量的蓝调 (chroma 0.005–0.01)。禁止纯黑 (#000) 或纯白 (#fff)。即使是"白色"卡片也是在冰蓝白底色上。

## 3. Typography

**Display Font:** "Avenir Next", "HarmonyOS Sans SC", Inter（含中文回退：PingFang SC, Microsoft YaHei）
**Body Font:** 同上栈
**Label/Mono Font:** "SFMono-Regular", Consolas, "Liberation Mono"（仅代码块使用）

**Character:** 几何化人文无衬线体组合。Avenir Next 带来温润的几何骨架，Inter 保证屏幕可读性，HarmonyOS Sans SC 在中文环境下提供多字重和谐排版。整体气质偏理性与亲和，避免 Helvetica 式的机械冷淡感。

### Hierarchy
- **Headline** (850, 26px, 1.35): 页面主标题、摘要 H1。极高字重建立权威锚点。比例与下一级差异 ≥1.18。
- **Title** (700, 22px, 1.35): 摘要 H2、面板标题。清晰但不过度。
- **Subtitle** (600, 19px, 1.4): 摘要 H3、区块副标题。
- **Body** (400, 16px, 1.78): 正文、摘要 Markdown 主体。1.78 行高为长文本留足呼吸感。行宽上限 75ch。
- **Label** (500, 13px, 1.2, letter-spacing 0.02em): 按钮文字（800 字重）、字段标签、辅助标注。加宽字间距保证小尺寸可读性。

### Named Rules
**The Weight Contrast Rule.** 相邻层级间的字重差异 ≥150。Headline 850 / Title 700 / Subtitle 600 / Body 400。平坦的字重阶梯无法建立信息层级。

**The Reading Comfort Rule.** 任何正文块的行高不得低于 1.6。摘要和文稿是核心产物，用户需长时间阅读 — 行高不足是对核心体验的直接损害。

## 4. Elevation

本系统采用 **环境阴影 (Ambient Shadows)** 策略。阴影大扩散半径、低不透明度、微蓝色调注入 (tinted)，与冷色背景自然融合。三层系统：Flat (Level 0) 为默认背景，Soft (Level 1) 为卡片和面板，Floating (Level 2) 仅用于下拉菜单等临时覆盖层。无 Level 2+ — 无模态、无弹出层。处于静止状态的表面是平的，悬浮态触发轻微抬升做反馈。

### Shadow Vocabulary
- **Panel Shadow** (`0 18px 44px rgba(14, 37, 70, 0.08)`): 分析面板、结果卡片。Level 1 标准阴影。
- **Button Shadow** (`0 12px 24px rgba(0, 74, 173, 0.18)`): 主 CTA 按钮专属。蓝色调的投影强化可点击性。
- **Gradient Button Shadow** (`0 15px 30px rgba(0, 82, 204, 0.22)`): 渐变主按钮的增强阴影，配合渐变更强地提升 CTA 权重。
- **Hover Lift**: 所有按钮 hover 时 `translateY(-1px)` + 阴影增强。不是通过增加阴影来提亮，而是物理抬升。

### Named Rules
**The Flat-By-Default Rule.** 界面在静止状态下保持平坦。阴影仅在交互响应（hover、focus）或容器边界（卡片、面板）时出现。禁止装饰性阴影。

**The Zero Modal Rule.** 不设 Level 2+ 阴影层级。所有信息展开使用内联/渐进式方案 — 拓展面板、内联消息、可折叠区域 — 而非模态弹窗。

## 5. Components

### Buttons
- **Shape:** 圆角 8px（旧版 ghost/primary/soft）或 10px（新版 ui-button 系统）。统一使用 10px。
- **Primary (Gradient):** 蓝紫色渐变 `linear-gradient(135deg, #1f6fff, #0052cc 62%, #003d9b)`，白色文字，字重 900，内边距 0 20px，最小高度 44px。专属阴影 `0 15px 30px rgba(0, 82, 204, 0.22)`。Hover 时抬升 1px。
- **Secondary:** 冰蓝底 (#f5f9ff)，蓝墨文字 (#0052cc)，1px 半透明蓝色边框。Hover 时抬升 1px。
- **Ghost:** 半透明白底 (rgba(255,255,255,0.8))，深色文字 (#1d3052)，半透明灰蓝边框。用于导航栏和低优先级操作。
- **Compact (sm):** 最小高度 36px，内边距 0 13px，字号 13px。用于工具栏内嵌操作。
- **Focus:** 所有按钮 `:focus-visible` 显示 `3px solid rgba(0, 82, 204, 0.2)` 外发光环，偏移 3px。
- **Transition:** `transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease` — 指数缓出，无弹性。

### Tab Navigation
- **Style:** 四列网格 (`grid-template-columns: repeat(4, 1fr)`)，最小高度 82px，底部分割线。
- **Tab Button:** 透明背景，图标+文字水平排列，字号 16px，字重 850。默认色 #424b5e，活跃态切换为信任蓝 (#004aad)。
- **Active Indicator:** `::after` 伪元素，高 3px、信任蓝背景、左右 12px 定位、顶部圆角。移动端切换为左侧竖条（高 32px、宽 3px、全圆角）。
- **Hover/Focus:** 通过颜色变化传达（非背景反转），focus-visible 外发光环。

### Cards / Containers
- **Corner Style:** 8px 圆角。
- **Background:** 半透明白 (rgba(255,255,255,0.92))，配合 1px 灰蓝边框 (rgba(201,214,234,0.74))。
- **Shadow:** Panel Shadow (`0 18px 44px rgba(14,37,70,0.08)`)。
- **Internal Padding:** 28px 28px 30px（tab body）。
- **Nesting:** 禁止卡片嵌套。容器内直接放置内容。

### Inputs / Fields
- **Style:** 白色背景、1px 灰蓝边框 (rgba(171,192,226,0.82))、12px 圆角、字号 15px、最小高度 52px、内边距 0 16px。
- **Textarea:** 同色系，最小高度 70px，内边距 12px 14px，行高 1.6，可纵向调整大小。
- **Focus:** 边框切换为 #1f6fff，外发光 `0 0 0 4px rgba(31, 111, 255, 0.14)`。
- **Disabled:** 整体透明度 0.58，光标 `not-allowed`。

### Status Messages
- **Layout:** 水平 flex，图标+文字，间距 10px，内边距 12px 14px，8px 圆角，字号 14px，行高 1.55。
- **Error:** 红陶文字 (#b42318)、浅粉底 (#fff1f0)、18% 透明度红色边框。
- **Info:** 深蓝文字 (#003b8e)、晨雾蓝底 (#edf4ff)、16% 透明度蓝色边框。
- **Warning:** 琥珀棕文字 (#8a5a00)、浅黄底 (#fff8e6)、16% 透明度琥珀边框。

### AI Summary Area
- **Background:** 晨雾蓝 (#e8f0ff) 底色的独立区块，与普通内容区视觉分离。
- **Typing Effect:** 流式 Markdown 渐进渲染，光标闪烁指示器。
- **Markdown Styling:** 代码块深蓝黑底 (#0c1a31) 浅蓝文字 (#dbeafe)；blockquote 左侧 4px 蓝色细条、淡蓝灰底、右侧圆角；链接信任蓝加下划线。

### Empty State
- **Style:** flex column 居中、最小高度 320px、冰蓝白底 (#f8fbff)、1px 虚线钢灰边框、8px 圆角。
- **Icon:** 信任蓝色，置于文字上方。
- **Copy:** 石板灰文字，引导性但不啰嗦。

## 6. Do's and Don'ts

### Do:
- **Do** 让内容决定容器大小。摘要 Markdown 区和文稿区采用流动宽度而非固定卡片网格。
- **Do** 用空间节奏区分信息层级。关键区块间留 40px+ 间距，区块内部用 16-24px。
- **Do** 用颜色稀缺性建立权重。信任蓝仅用于 ≤10% 的表面元素。
- **Do** 每个交互元素都有 `:focus-visible` 外发光环（3px, rgba(0,82,204,0.2), offset 3px）。
- **Do** 使用 1px hover 抬升 (`translateY(-1px)`) 做交互反馈，过渡时间 0.18s ease。
- **Do** 为 `prefers-reduced-motion` 用户关闭所有过渡和动画（已全局实现）。

### Don't:
- **Don't** 使用侧边彩条 (border-left > 1px 作为彩色强调)。用完整边框、背景色块或前置图标替代。
- **Don't** 使用渐变文字 (background-clip: text)。强调通过字重或大小变化完成。
- **Don't** 使用玻璃态模糊作为默认风格。App shell 的渐变背景是唯一例外且位于最底层。
- **Don't** 堆叠等大的图标+标题+文字卡片网格。内容区应流动排版而非僵硬网格。
- **Don't** 第一时间用模态弹窗。优先考虑内联展开、可折叠区域、内联消息。
- **Don't** 使用纯黑 (#000) 或纯白 (#fff)。所有中性色带微量蓝调。
- **Don't** 在正文中使用花哨动画。动画仅限状态过渡（hover, focus, active）和加载指示器。
- **Don't** 让 AI 生成区看起来像普通文本区。始终用晨雾蓝底或等效视觉线索区分。
