---
name: this design system
colors:
  surface: '#f9f9ff'
  surface-dim: '#cadaff'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e8edff'
  surface-container-high: '#e0e8ff'
  surface-container-highest: '#d7e2ff'
  on-surface: '#041b3c'
  on-surface-variant: '#434654'
  inverse-surface: '#1d3052'
  inverse-on-surface: '#edf0ff'
  outline: '#737685'
  outline-variant: '#c3c6d6'
  surface-tint: '#0c56d0'
  primary: '#003d9b'
  on-primary: '#ffffff'
  primary-container: '#0052cc'
  on-primary-container: '#c4d2ff'
  inverse-primary: '#b2c5ff'
  secondary: '#535f70'
  on-secondary: '#ffffff'
  secondary-container: '#d6e3f7'
  on-secondary-container: '#596576'
  tertiary: '#5e3c00'
  on-tertiary: '#ffffff'
  tertiary-container: '#7d5200'
  on-tertiary-container: '#ffca81'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2ff'
  primary-fixed-dim: '#b2c5ff'
  on-primary-fixed: '#001848'
  on-primary-fixed-variant: '#0040a2'
  secondary-fixed: '#d6e3f7'
  secondary-fixed-dim: '#bbc7db'
  on-secondary-fixed: '#101c2b'
  on-secondary-fixed-variant: '#3b4858'
  tertiary-fixed: '#ffddb3'
  tertiary-fixed-dim: '#ffb950'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#624000'
  background: '#f9f9ff'
  on-background: '#041b3c'
  surface-variant: '#d7e2ff'
typography:
  h1:
    fontFamily: Inter
    fontSize: 40px
    fontWeight: '700'
    lineHeight: '1.2'
  h2:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: '1.3'
  h3:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.2'
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  container-max: 1280px
  gutter: 24px
---

## Brand & Style

该设计系统旨在传达“专业、高效、可靠”的品牌核心价值。作为一款 AI 视频摘要工具，界面需要展现出极高的技术成熟度与处理能力，同时通过克制的视觉语言消除用户对 AI 生成内容的疑虑。

风格定位为 **现代专业主义 (Modern Corporate)**。它结合了极简主义的排版布局与细腻的质感表现。通过大量留白处理来突出视频摘要的核心内容，减少视觉干扰。整体氛围应如同高品质的 SaaS 产品，既能满足个人用户的审美，也能无缝接入企业级工作流。视觉上追求“通透感”与“秩序感”，利用柔和的阴影和蓝白色调营造出一种安全、高价值的数字资产管理环境。

## Colors

本色板以“信任蓝”为核心。**Primary Blue (#0052CC)** 承载了品牌的力量感与专业性，主要用于关键行动点（CTA）和导航状态。**Secondary Blue (#DEEBFF)** 则作为辅助色，用于背景染色、标签（Chips）或悬停态，以柔化视觉边界。

*   **文本色彩层级**：主要标题使用 #172B4D（深海军蓝），相比纯黑更具高级感；正文使用 #44546F，确保长时间阅读的舒适度。
*   **功能色**：引入微量的 Tertiary Color（如琥珀色）用于提示高级会员专属功能，增加转化诱导。
*   **背景处理**：背景保持极简纯白，通过不同深浅的灰色（如 #F4F5F7）来区分侧边栏与内容区，确立清晰的层级结构。

## Typography

字体系统选用 **Inter** 作为英文与数字的核心字体，其几何化且具有人文气息的线条非常契合科技产品。在中文环境下，应优先调用系统默认的高品质无衬线体（如 PingFang SC 或 Microsoft YaHei），以确保渲染的清晰度。

*   **层级对比**：通过极大的字号差异（H1 vs Body）来引导用户视线，标题加粗以增强权威感。
*   **阅读节奏**：正文行高设定在 1.6 倍，为视频摘要的长文本提供充足的呼吸感，防止视觉疲劳。
*   **功能标注**：标签和细小的说明文字采用略重的字重（Medium 500），并适当增加字间距，确保在小尺寸下依然具备极高的可读性。

## Layout & Spacing

采用严格的 **8px 网格系统**，确保所有元素在视觉上的对齐与和谐。布局模型选择 **固定宽度网格 (Fixed Grid)** 进行核心内容呈现，以维持专业文档式的阅读体验。

*   **容器策略**：主内容区域最大宽度限制在 1280px，侧边栏保持固定宽度（如 280px），右侧内容区随屏幕伸缩。
*   **节奏感**：组件内部使用 16px (sm) 或 24px (md) 的内边距。在关键转化模块（如订阅卡片）周围留出 40px (lg) 以上的大面积空白，通过空间引导注意力。
*   **呼吸感**：强调“高质量间距”，即在复杂的 AI 数据展示区（如时间轴、关键词云）使用更慷慨的外边距，避免信息过载带来的压迫感。

## Elevation & Depth

该设计系统通过 **环境阴影 (Ambient Shadows)** 建立纵深，而非厚重的拟物化效果。阴影应具有大扩散半径、低不透明度的特征，并带有微弱的蓝色色调（Tinted Shadows），使其与背景融合得更加自然。

*   **层级定义**：
    *   **Level 0 (Flat)**：基础背景。
    *   **Level 1 (Soft)**：标准卡片，使用极淡的边框（#E1E4E8）配合极轻的阴影。
    *   **Level 2 (Floating)**：下拉菜单、浮动操作按钮或悬停态卡片，阴影更加明显以提示可交互性。
*   **深度隐喻**：通过半透明的白色背景与模糊效果（Backdrop Blur）处理顶部导航栏，模拟磨砂玻璃质感，让用户在滚动时仍能感知下层内容。

## Shapes

形状语言以“克制的圆角”为特征。通过 **8px - 12px** 的圆角设定，在专业严谨感与现代亲和力之间取得平衡。

*   **基础组件**：按钮、输入框统一采用 8px 圆角（rounded-md），体现工具的精准度。
*   **容器组件**：大型卡片、模态框、视频预览容器采用 12px 圆角（rounded-lg），传达高价值与容器化的包裹感。
*   **特殊元素**：标签（Chips）和头像可使用全圆角（Pill-shaped），增加界面的灵动感。

## Components

*   **Buttons (按钮)**：
    *   **Primary**: #0052CC 背景，白色文字，带有微弱的底部投影，展现力量感。
    *   **Secondary**: #DEEBFF 背景，#0052CC 文字，用于次要操作或取消。
    *   **CTA**: 在订阅页面，使用更大的 Padding 和更醒目的对比色，增强点击欲望。
*   **Cards (卡片)**：作为视频摘要的核心载体，卡片需具备极简的白底、精细的灰边及悬停时的阴影增强效果。
*   **AI Summary Area (AI 摘要区)**：使用柔和的 Secondary Blue 作为背景底色，与普通内容区分。内置打字机动效或闪烁的 AI 图标，增强“正在处理”或“智能生成”的感知。
*   **Input Fields (输入框)**：强调聚焦态（Focus State），当用户输入视频链接时，边框变为 Primary Blue 并伴有外发光，提供清晰的反馈。
*   **Progress Bars (进度条)**：采用平滑的动画效果，颜色从淡蓝向主色蓝渐变，展示 AI 分析进度，减少用户焦虑。