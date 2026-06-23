/**
 * BaseRenderer
 * 所有视觉模式的抽象基类，定义插件协议
 */

export class BaseRenderer {
  constructor(name) {
    this.name = name;
    this.width = 0;
    this.height = 0;
    this.canvas = null;
    this.ctx = null;
    this.theme = null;
    this.params = {};
  }

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize(canvas.width, canvas.height);
  }

  destroy() {
    this.canvas = null;
    this.ctx = null;
  }

  setTheme(theme) {
    this.theme = theme;
  }

  setParams(params) {
    this.params = { ...this.params, ...params };
    this._onParamsChange();
  }

  // 子类可覆盖，响应参数变化
  _onParamsChange() {}

  update(features, dt) {
    throw new Error('update() must be implemented by subclass');
  }

  render(width, height) {
    throw new Error('render() must be implemented by subclass');
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  getParamConfig() {
    return {};
  }

  onPointerDown(x, y) {}
  onPointerMove(x, y) {}
  onPointerUp() {}
}
