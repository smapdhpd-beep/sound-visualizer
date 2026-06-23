# Sound Visualizer — 架构与开发计划

## 1. 项目定位
浏览器端声音可视化 PWA，支持「麦克风实时输入」与「本地音乐文件」，输出三种可选视觉模板（数字克拉尼 / 呼吸光尘 / 液态纹路）。

核心体验：**好酷 + 治愈 + 可干预**。面向电子乐与人声优化音频响应。

---

## 2. 文件结构

```
sound-visualizer/
├── index.html                 # 入口，canvas 容器 + UI 控件
├── css/
│   └── style.css              # 全屏暗色主题，移动端适配
├── js/
│   ├── app.js                 # 主应用：生命周期、模式切换、动画循环、GUI
│   ├── audioEngine.js         # 音频引擎：路由、分析、特征提取
│   ├── params.js              # 全局参数定义与持久化（快照/分享链接）
│   └── renderers/
│       ├── baseRenderer.js    # 渲染器基类（接口契约）
│       ├── chladniRenderer.js # 模式 A：数字克拉尼（驻波粒子）
│       ├── dustRenderer.js    # 模式 B：呼吸光尘（噪声场粒子）
│       └── liquidRenderer.js  # 模式 C：液态纹路（WebGL 流体）
└── assets/                    # 预计算纹理、着色器文件（未来）
```

---

## 3. 核心模块职责

### AudioEngine（单例）
- **输入路由**：`<audio>` 文件流 ↔ `getUserMedia` 麦克风流，互斥切换
- **统一分析**：`AnalyserNode` (FFT 2048) + 自定义 Onset 检测
- **输出特征对象**（每帧消费）：
  ```ts
  {
    bass: number,      // 0-1  低频能量 (20-150Hz)
    mid: number,       // 0-1  中频能量 (150-4kHz)
    high: number,      // 0-1  高频能量 (4kHz+)
    overall: number,   // 0-1  全频平均
    onset: number,     // 0-1  节拍突检测（电子乐 Kick 触发）
    centroid: number,  // 0-1  频谱质心（明亮度，人声气声/齿音敏感）
    texture: number    // 0-1  频谱差异度（人声动态）
  }
  ```
- **平滑策略**：指数移动平均（EMA），防止跳变；但 Onset 保持低延迟响应

### Renderer Plugin Protocol
所有模式必须继承 `BaseRenderer`，实现以下接口：
- `init(canvas)` — 分配资源、编译 Shader/预计算
- `destroy()` — 释放资源，防止内存泄漏
- `update(features, dt)` — 根据音频特征更新状态，不直接绘图
- `render(ctx/gl, width, height)` — 执行绘制
- `resize(width, height)` — 响应屏幕变化
- `getParamConfig()` — 返回本模式专属的 Tweakpane 配置对象

### App（调度中心）
1. 初始化 AudioEngine 与 Canvas
2. 根据用户选择，动态 `new` 对应 Renderer
3. 每帧：
   - `audioEngine.getFeatures()` → features
   - `currentRenderer.update(features, dt)`
   - `currentRenderer.render(ctx, w, h)`
4. 维护全局 GUI（Tweakpane）：全局参数常驻，局部参数随模式切换热替换
5. 导出功能：
   - **截图**：`canvas.toBlob()` → PNG
   - **快照**：序列化当前全部参数 → JSON / URL hash
   - **录屏**：`MediaRecorder` 捕获 Canvas 流（可选 MVP 后实现）

---

## 4. 三模式差异与电子乐/人声适配

| 维度 | A 数字克拉尼 | B 呼吸光尘 | C 液态纹路 |
|------|-------------|-----------|-----------|
| **渲染器** | Canvas 2D 粒子 | Canvas 2D 粒子 | WebGL 片元着色器 |
| **核心算法** | 2D 驻波势场，粒子滑向波节 | Simplex 噪声力场 + 音频驱动 | 简化 Navier-Stokes 流体 |
| **电子乐表现** | Bass → 高阶模态跳变，Onset → 沙纹爆裂重组 | Bass → 大尺度漩涡，Onset → 光尘迸发 | Onset → 注入强涡量，Bass → 流体抬升 |
| **人声表现** | Mid → 缓慢雕刻对称纹理，Texture → 边缘微颤 | Mid/High → 细碎闪烁，Centroid → 色彩冷暖 | Centroid → 流体粘度变化，像墨水晕染 |
| **互动参数** | 板形状、模态对(m,n)、沙粒粘性、对称阶数 | 粒子数、拖尾长度、噪声缩放、黏滞度、对称镜像 | 流体密度、扰动强度、虹彩周期、流速 |
| **性能（手机）** | 中（3000 粒子） | 高（2000 粒子） | 低（需 WebGL，老手机发热） |

**MVP 优先级**：B 最先完整实现（验证链路），A 随后，C 最后（因涉及 WebGL）。

---

## 5. 关键技术决策（待你确认）

### 决策 1：GUI 库选型
- **Option A**：Tweakpane（现代，主题好改，但移动端面板偏大）
- **Option B**：自研轻量面板（仅按钮+滑块，更契合全屏沉浸，开发成本高一点）
- **建议**：MVP 用 Tweakpane，后期如果移动端体验不佳再自研。

### 决策 2：Onset 检测实现位置
- **Option A**：纯时域能量差分（简单，JS 内完成，够用）
- **Option B**：引入第三方库（如 `meyda` 提取频谱通量，更准确但包体大）
- **建议**：MVP 用自研时域+频域简易 Onset，后期可换 meyda。

### 决策 3：液态纹路的 WebGL 方案
- **Option A**：单文件内联 GLSL（快速，难维护）
- **Option B**：独立 `.frag` / `.vert` 文件，构建时或运行时加载（干净，需本地服务器）
- **建议**：MVP 阶段 A/B 模式先跑通，C 模式先放一个占位 Shader，架构上预留接口即可。

### 决策 4：状态管理
- **Option A**：全局 mutable state（简单直接，小项目够用）
- **Option B**：引入微型状态机（如 zustand/vanilla，略重）
- **建议**：纯原生 JS Class 管理，不引入框架依赖。

---

## 6. MVP 边界（第一版可玩目标）

- [ ] 支持文件播放 + Mic 切换
- [ ] 三种模式可切换，B 模式功能完整
- [ ] 全局参数：音量、音频平滑度、暂停/播放
- [ ] B 模式局部参数：粒子数、拖尾、黏滞、扩散、对称阶数、配色主题
- [ ] 支持鼠标/触摸交互（推开粒子）
- [ ] 截图导出
- [ ] 响应式（桌面 + 手机横屏/竖屏）

**非 MVP**：录视频、参数 URL 分享、预设库、A/C 模式完整效果。

---

## 7. 待确认问题

1. **GUI 用 Tweakpane 是否接受？** 如果不接受，我改自研极简面板。
2. **手机端默认横屏还是竖屏？** 这会影响 Canvas 分辨率策略和 UI 布局。
3. **C 模式液态纹路是否要在 MVP 里出现一个“基础效果”？** 还是只留黑屏占位，等 A/B 完成后再做？
4. **配色倾向**：我预设几套（霓虹紫、暖沙金、水墨灰、极光绿），你有偏好吗？

请回复以上 4 点，我立刻开始填充核心代码。

---

## 8. 测试体系改进 TODO（coach cc 方案借鉴）

> 来源：coach cc《QuotaMonitor v1.0 - 单元测试逐条清单》
> 原则：补一层"单元测试护城墙"，保留现有截图测试作为视觉回归。

### 8.1 目录重构

```
tests/
├── unit/                    # 新增：单元测试（assertion-based）
│   ├── core/
│   │   ├── waveField.test.js      # 物理场计算
│   │   ├── particleSystem.test.js # 粒子运动/碰撞/边界
│   │   └── audioFeatures.test.js  # 频带划分/质心/峰值
│   ├── engine/
│   │   └── audioEngine.test.js    # AudioEngine 状态机 + 特征提取
│   └── renderers/
│       └── chladniRenderer.test.js # 渲染器纯逻辑（不含 Canvas）
├── visual/                  # 现有截图测试迁移到这里
│   ├── wave/
│   ├── chladni/
│   ├── polar/
│   └── snapshots/           # PNG 归拢到这里
└── README.md                # 测试总览表格
```

### 8.2 反直觉场景清单（必须配套单测）

| # | 反直觉场景 | 如果不测会引入的 bug | 计划测试名 |
|---|-----------|---------------------|-----------|
| 1 | `audioCtx.state` 初始化后是 `'suspended'` | 未交互时自动 play() 抛 `NotAllowedError`，引擎卡住 | `testAudioContext_startsSuspended` |
| 2 | `analyser.getByteFrequencyData()` **不会清零** | 静音时频谱不归零，可视化仍抖动 | `testFrequencyData_zerosWhenNoSource` |
| 3 | `analyser.frequencyBinCount == fftSize / 2` | 数组越界或只取一半数据 | `testBinCount_isHalfOfFFTSize` |
| 4 | EMA 平滑系数 0.75，但 `onset` 用 0.3 | onset 改 0.75 会滞后半秒 | `testOnset_decayFasterThanFeatures` |
| 5 | `_findPeaks()` 强制 padding 到 3 个峰值 | 某帧只检测到 1 个峰值，下游解构出 `undefined` | `testFindPeaks_alwaysReturnsThree` |
| 6 | 麦克风不连 `ctx.destination` | 误连会产生啸叫 | `testMicrophone_doesNotConnectDestination` |
| 7 | `rebirthProb` 在 `activity < 0.15` 时必须为 0 | 低活跃度下粒子仍不断重生，图案无法收敛 | `testRebirth_disabledBelowActivityThreshold` |

### 8.3 核心契约保护测试

| 契约 | 计划测试名 | 意图 |
|-----|-----------|------|
| 频谱平滑不倒退 | `testSmoothing_preventsFeatureDecreaseOnSilence` | 静音时 bass/mid/high 不断崖下跌 |
| 峰值永远 3 个 | `testFindPeaks_alwaysReturnsTriple` | 下游数组解构安全 |
| 降采样 band 128 个 | `testSpectrumBands_fixedLength` | 瀑布渲染器依赖固定长度 |
| 总能量守恒 | `testBandEnergy_sumEqualsOverall` | bass+mid+high 加权应与 overall 一致 |

### 8.4 执行步骤（按 ROI 排序）

- [ ] **P0**：安装 Vitest，把 `AudioEngine` 中 `getFeatures` 的纯计算逻辑抽出可测函数
- [ ] **P0**：给反直觉清单 7 条各写一个单元测试
- [ ] **P1**：把 `waveField` / `simulate` 从测试文件抽成 `js/core/physics.js`，截图测试改为 import 生产代码
- [ ] **P1**：给所有现有截图测试加 README 说明（是什么/测什么/参考 PNG）
- [ ] **P2**：把 `test-screenshots/` 接入 `pixelmatch`，让 CI 能自动报视觉回归

### 8.5 测试写法规范（借鉴 coach cc）

每个测试按三段描述：
1. **是什么**：测试名 + 一句话定义
2. **内容**：输入数据 + 断言点
3. **作用**：防什么 bug / 固化什么决策 / 文档化什么行为

示例：
```javascript
/**
 * 是什么：粒子边界反弹能量衰减测试
 * 内容：粒子以 vx=100 撞右墙，断言反弹后 vx ≈ -50
 * 作用：防止有人"优化"边界处理时去掉 *0.5 阻尼，导致粒子在墙边疯狂震荡
 */
test('particle_bounce_dampsVelocity', () => { ... });
```
