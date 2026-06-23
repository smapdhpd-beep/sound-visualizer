/**
 * LiquidRenderer — 液态纹路（WebGL 占位）
 * ⚠️ 已废弃（2026-06-17）：项目聚焦克拉尼单模式，液态不再维护。
 * 保留文件仅作历史参考，App 中已移除注册。
 */

import { BaseRenderer } from './baseRenderer.js';

const VERT = `
attribute vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAG = `
precision mediump float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_high;
uniform float u_onset;
uniform vec3 u_colorA;
uniform vec3 u_colorB;
uniform vec3 u_colorC;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution;
  vec2 p = uv * 2.0 - 1.0;
  p.x *= u_resolution.x / u_resolution.y;

  float t = u_time;
  float d = length(p);

  // 基础波纹
  float wave = sin(p.x * 8.0 + t * 1.5) * cos(p.y * 8.0 - t * 1.2);
  wave += sin(p.x * 14.0 - t * 2.0 + u_bass * 3.0) * 0.3;
  wave += cos(p.y * 10.0 + t + u_mid * 3.0) * 0.3;

  // 环形扩散
  float ring = sin(d * 12.0 - t * 2.0 + u_onset * 6.0) * exp(-d * 1.5);

  float v = wave * 0.5 + ring;
  v = smoothstep(-0.5, 0.8, v);

  // 三色混合
  vec3 col = mix(u_colorA, u_colorB, v);
  col = mix(col, u_colorC, u_high * 0.5 + u_onset * 0.3);

  // 暗角
  col *= 1.0 - d * 0.35;

  gl_FragColor = vec4(col, 1.0);
}
`;

export class LiquidRenderer extends BaseRenderer {
  constructor() {
    super('liquid');
    this.gl = null;
    this.program = null;
    this.time = 0;
    this.features = {};
    this.uCache = {};
  }

  init(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl', { alpha: false, antialias: false, preserveDrawingBuffer: true });
    if (!this.gl) {
      console.warn('WebGL not supported');
      return;
    }
    this._compile(VERT, FRAG);
    this._setupBuffer();
    this._cacheUniforms();
    this.resize(this.canvas.width, this.canvas.height);
  }

  _compile(vsSrc, fsSrc) {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vs, vsSrc);
    gl.compileShader(vs);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    this.program = gl.createProgram();
    gl.attachShader(this.program, vs);
    gl.attachShader(this.program, fs);
    gl.linkProgram(this.program);
    gl.useProgram(this.program);
  }

  _setupBuffer() {
    const gl = this.gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
      -1,-1, 1,-1, -1,1,
      -1,1, 1,-1, 1,1
    ]), gl.STATIC_DRAW);
    const pos = gl.getAttribLocation(this.program, 'position');
    gl.enableVertexAttribArray(pos);
    gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);
  }

  _cacheUniforms() {
    const gl = this.gl;
    const names = ['u_resolution','u_time','u_bass','u_mid','u_high','u_onset','u_colorA','u_colorB','u_colorC'];
    names.forEach((n) => this.uCache[n] = gl.getUniformLocation(this.program, n));
  }

  setTheme(theme) {
    super.setTheme(theme);
  }

  resize(width, height) {
    super.resize(width, height);
    if (this.gl) {
      this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  update(features, dt) {
    this.time += dt;
    this.features = features;
  }

  render(width, height) {
    if (!this.gl) {
      // 2D 降级提示
      const ctx = this.canvas.getContext('2d');
      if (!ctx) return;
      ctx.fillStyle = '#0a0a0f';
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = '#556';
      ctx.textAlign = 'center';
      ctx.font = '14px sans-serif';
      ctx.fillText('Liquid Mode — WebGL preview', width / 2, height / 2);
      return;
    }
    const gl = this.gl;
    const f = this.features || {};
    const t = this.theme || {};

    gl.uniform2f(this.uCache['u_resolution'], this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uCache['u_time'], this.time);
    gl.uniform1f(this.uCache['u_bass'], f.bass || 0);
    gl.uniform1f(this.uCache['u_mid'], f.mid || 0);
    gl.uniform1f(this.uCache['u_high'], f.high || 0);
    gl.uniform1f(this.uCache['u_onset'], f.onset || 0);

    const ca = t.bg || [5,10,18];
    const cb = t.accent || [0,150,255];
    const cc = t.glow || [200,100,255];
    gl.uniform3f(this.uCache['u_colorA'], ca[0]/255, ca[1]/255, ca[2]/255);
    gl.uniform3f(this.uCache['u_colorB'], cb[0]/255, cb[1]/255, cb[2]/255);
    gl.uniform3f(this.uCache['u_colorC'], cc[0]/255, cc[1]/255, cc[2]/255);

    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  getParamConfig() {
    return {
      fluidDensity: { label: '流体密度', min: 0.1, max: 2.0, step: 0.1, default: 1.0 },
      colorShift: { label: '虹彩偏移', min: 0.0, max: 1.0, step: 0.01, default: 0.5 },
    };
  }
}
