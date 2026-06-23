# 04-API 文档

## AudioEngine

```js
import { AudioEngine } from './js/audioEngine.js';
```

### Methods
- `async init()` — 初始化 AudioContext 与 AnalyserNode
- `async setFile(File)` — 从本地音频文件创建源并播放
- `async setMicrophone()` — 从麦克风创建源
- `getFeatures(dt): AudioFeatures` — 每帧调用，返回当前音频特征

### AudioFeatures
```ts
interface AudioFeatures {
  bass: number;       // 0-1 低频能量 (20-150Hz)
  mid: number;        // 0-1 中频能量 (150-4kHz)
  high: number;       // 0-1 高频能量 (4kHz+)
  overall: number;    // 0-1 全频平均
  onset: number;      // 0-1 节拍突检测
  centroid: number;   // 0-1 频谱质心（明亮度）
  texture: number;    // 0-1 频谱差异度（动态）
  spectrum: Float32Array; // 128 频带对数降采样频谱（指数 1.6）
}
```

## BaseRenderer

所有模式必须继承此类。

### Methods
- `init(canvas)` — 初始化资源
- `destroy()` — 释放资源
- `update(features, dt)` — 更新逻辑（不绘图）
- `render(ctx, width, height)` — 绘图
- `resize(width, height)` — 响应尺寸变化
- `getParamConfig(): ParamConfig` — 返回参数定义
- `onPointerDown/Move/Up(x, y)` — 交互事件

### ParamConfig 格式
```ts
type ParamConfig = Record<string, {
  label: string;
  min?: number;
  max?: number;
  step?: number;
  default: number;
  options?: Record<string, string>; // 若存在，则渲染为下拉框而非滑块
}>;
```

## ChladniRenderer

当前唯一活跃渲染器，位于 `js/renderers/chladniRenderer.js`。

### 参数配置示例
```ts
{
  particleCount:   { label: '粒子数',    min: 500,  max: 8000, step: 100,  default: 4000 },
  viscosity:       { label: '黏滞',      min: 0.5,  max: 0.99, step: 0.01, default: 0.88 },
  strength:        { label: '场强',      min: 0.1,  max: 3.0,  step: 0.1,  default: 1.2 },
  symmetry:        { label: '对称',      min: 1,    max: 8,    step: 1,    default: 2 },
  trailAlpha:      { label: '拖尾',      min: 0.02, max: 0.3,  step: 0.01, default: 0.12 },
  glowStrength:    { label: '光晕强度',  min: 0,    max: 10,   step: 0.5,  default: 3 },
  particleSize:    { label: '粒子大小',  min: 0.5,  max: 4.0,  step: 0.1,  default: 1.5 },
  responseSpeed:   { label: '响应速度',  min: 0.01, max: 0.5,  step: 0.01, default: 0.08 },
  complexity:      { label: '复杂度',    min: 0,    max: 3,    step: 1,    default: 1 },
  boundaryShape:   { label: '边界形态',  default: 'circle', options: {
    圆形: 'circle', 方形: 'square', 环形: 'annular',
    椭圆: 'ellipse', 三角形: 'triangle', 六边形: 'hexagon'
  }},
}
```

### 核心方法
- `_waveField(px, py, m, n, time, complexity)` — 统一势场分发器，根据 `boundaryShape` 路由到六种形态公式
- `_spawnParticles(count)` — 在边界形态内部均匀生成粒子（各形态独立采样策略）
- `_onParamsChange()` — 监听参数变化；若 `boundaryShape` 改变，立即触发粒子重生成（`_lastShape` 追踪）

### 边界策略
- **硬边界**：界外返回 `amp=1.0`，粒子受 `-amp·grad` 自然推回形内
- **多边形禁用旋转对称**：square / triangle / hexagon 自动设置 `sym=1`，避免旋转叠加破坏直线节线

## Global Color Themes

通过 `app.globalParams.theme` 切换，渲染器内读取 `app.getThemeColors()`。
