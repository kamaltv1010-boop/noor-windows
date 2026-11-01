// Noor's WebGL Vendor & Renderer (config.gpu, see main/gpus.js): the
// profile's graphics card, not this PC's, as Chrome on Windows names it.
// In WebGL, once the page asked for WEBGL_debug_renderer_info (before, the
// browser tells nothing, as Chrome does); in WebGPU, an adapter's info and
// a device's: the card's maker and family, no model or description (as
// Chrome tells neither). In a window and in a worker. The browser's own
// method and getters still run first: they refuse what Chrome refuses.
{
  const graphics = config.gpu;
  for (const Context of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    const proto = Context && Context.prototype;
    if (!proto) continue;
    define(proto, "getParameter", (original) => function (pname) {
      const value = original.apply(this, arguments);
      if (!arguments.length || value === null) return value;
      const p = +pname;
      if (p === 0x9245) return graphics.vendor;
      if (p === 0x9246) return graphics.renderer;
      return value;
    });
  }
  const told = { vendor: graphics.webgpu.vendor, architecture: graphics.webgpu.architecture, device: "", description: "" };
  const nameInfo = () => {
    const infoProto = window.GPUAdapterInfo && window.GPUAdapterInfo.prototype;
    if (!infoProto) return false;
    for (const name of Object.keys(told)) defineGetter(infoProto, name, () => told[name]);
    return true;
  };
  // A worker gets WebGPU (as what a secure context alone has) only after
  // this script ran, as its own script is about to run: then it is named
  // (see lateTasks).
  if (!nameInfo()) lateTasks.push(nameInfo);
}
