import type { AtlasSize } from '../geography/atlas';
import { createGlobeMesh, globeRenderSize, globeRotationMatrix } from '../geography/globeMesh';
import { cameraRotation, globeRadius, type WorldCamera } from '../geography/worldCamera';
import { borderStyle } from '../geography/borderRendering';
import { COUNTRY_HIGHLIGHT, COUNTRY_HIGHLIGHT_OPACITY } from '../geography/countrySelection';

const highlight = [1, 3, 5].map(index => parseInt(COUNTRY_HIGHLIGHT.slice(index, index + 2), 16) / 255) as [number, number, number];

const VERTEX = `
attribute vec3 position;
attribute vec2 uv;
uniform mat3 rotation;
uniform vec2 scale;
varying vec2 textureUV;
varying vec3 surfaceNormal;
void main() {
  vec3 p = rotation * position;
  surfaceNormal = p;
  textureUV = uv;
  gl_Position = vec4(p.xy * scale, -p.z * 0.5, 1.0);
}`;
const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D world;
uniform sampler2D selection;
uniform bool hasSelection;
uniform bool regionSelected;
uniform vec3 highlight;
varying vec2 textureUV;
varying vec3 surfaceNormal;
void main() {
  vec3 n = normalize(surfaceNormal);
  vec3 color = texture2D(world, textureUV).rgb;
  float light = 0.90 + 0.10 * max(0.0, dot(n, normalize(vec3(-0.35, 0.5, 1.0))));
  float rim = pow(1.0 - max(0.0, n.z), 4.0) * 0.10;
  color = color * light + vec3(0.12, 0.24, 0.32) * rim;
  if (hasSelection) {
    float alpha = texture2D(selection, textureUV).a;
    if (regionSelected) alpha = max(0.0, 2.0 * alpha - 1.0);
    color = mix(color, highlight, alpha * ${COUNTRY_HIGHLIGHT_OPACITY});
  }
  gl_FragColor = vec4(color, 1.0);
}`;
const BORDER_VERTEX = `
attribute vec3 position;
uniform mat3 rotation;
uniform vec2 scale;
varying float facing;
varying vec3 geographic;
void main() {
  vec3 p = rotation * position;
  facing = p.z;
  geographic = position;
  gl_Position = vec4(p.xy * scale, 0.0, 1.0);
}`;
const BORDER_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
varying float facing;
varying vec3 geographic;
uniform float opacity;
uniform vec3 color;
uniform sampler2D selection;
uniform bool clipToCountry;
void main() {
  if (facing < 0.0) discard;
  if (clipToCountry) {
    vec3 n = normalize(geographic);
    vec2 uv = vec2(0.5 + atan(n.x, n.z) / 6.2831853, 0.5 - asin(clamp(n.y, -1.0, 1.0)) / 3.1415927);
    if (texture2D(selection, uv).a < 0.25) discard;
  }
  gl_FragColor = vec4(color, opacity);
}`;

/** One real 3D sphere, depth-tested and back-face culled. No framework or render loop. */
export function createGlobeRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: true, depth: true, powerPreference: 'low-power' });
  if (!gl || gl.isContextLost()) throw new Error('WebGL unavailable');
  const textureWidth = 2 ** Math.floor(Math.log2(Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number)));
  if (textureWidth < 1024) throw new Error('Insufficient globe texture capacity');
  function shader(type: number, source: string) {
    const result = gl!.createShader(type)!;
    gl!.shaderSource(result, source); gl!.compileShader(result);
    if (!gl!.getShaderParameter(result, gl!.COMPILE_STATUS)) { gl!.deleteShader(result); throw new Error('Globe shader unavailable'); }
    return result;
  }
  const vertex = shader(gl.VERTEX_SHADER, VERTEX), fragment = shader(gl.FRAGMENT_SHADER, FRAGMENT);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); throw new Error('Globe program unavailable'); }
  const borderProgram = gl.createProgram()!;
  const borderVertex = shader(gl.VERTEX_SHADER, BORDER_VERTEX), borderFragment = shader(gl.FRAGMENT_SHADER, BORDER_FRAGMENT);
  gl.attachShader(borderProgram, borderVertex); gl.attachShader(borderProgram, borderFragment); gl.linkProgram(borderProgram);
  gl.deleteShader(borderVertex); gl.deleteShader(borderFragment);
  if (!gl.getProgramParameter(borderProgram, gl.LINK_STATUS)) throw new Error('Globe borders unavailable');
  const borderBuffer = gl.createBuffer()!;
  const borderPosition = gl.getAttribLocation(borderProgram, 'position');
  const borderRotation = gl.getUniformLocation(borderProgram, 'rotation'), borderScale = gl.getUniformLocation(borderProgram, 'scale');
  const borderOpacity = gl.getUniformLocation(borderProgram, 'opacity'), borderColor = gl.getUniformLocation(borderProgram, 'color');
  const clipToCountry = gl.getUniformLocation(borderProgram, 'clipToCountry');
  gl.useProgram(borderProgram);
  gl.uniform1i(gl.getUniformLocation(borderProgram, 'selection'), 1);
  let borderCount = 0, previousBorderCount = 0;
  let regionBuffer: WebGLBuffer | null = null, regionCount = 0;
  const selectionBorder = gl.createBuffer()!, selectionTexture = gl.createTexture()!;
  let hasSelection = false, selectionBorderCount = 0, regionSelected = false;
  const mesh = createGlobeMesh();
  const vertices = gl.createBuffer()!, indices = gl.createBuffer()!, texture = gl.createTexture()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'position'), uv = gl.getAttribLocation(program, 'uv');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
  const rotation = gl.getUniformLocation(program, 'rotation'), scale = gl.getUniformLocation(program, 'scale');
  const selectionActive = gl.getUniformLocation(program, 'hasSelection');
  const selectionRegion = gl.getUniformLocation(program, 'regionSelected');
  gl.uniform3f(gl.getUniformLocation(program, 'highlight'), ...highlight);
  gl.uniform1i(gl.getUniformLocation(program, 'selection'), 1);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, selectionTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.ALPHA, 1, 1, 0, gl.ALPHA, gl.UNSIGNED_BYTE, new Uint8Array(1));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(gl.getUniformLocation(program, 'world'), 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([24, 45, 61, 255]));
  gl.generateMipmap(gl.TEXTURE_2D);
  gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
  gl.clearColor(0, 0, 0, 0);
  if (gl.getError() !== gl.NO_ERROR) throw new Error('Globe resources unavailable');
  function upload(source: HTMLCanvasElement) {
    if (gl!.isContextLost()) return;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    // Our UV v=0 is north, matching the first row of the source canvas.
    gl!.pixelStorei(gl!.UNPACK_FLIP_Y_WEBGL, 0);
    gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source);
    gl!.generateMipmap(gl!.TEXTURE_2D);
    if (gl!.getError() !== gl!.NO_ERROR) throw new Error('Globe texture unavailable');
  }
  function uploadBorders(vertices: Float32Array, previous?: Float32Array) {
    const data = previous ? new Float32Array(previous.length + vertices.length) : vertices;
    if (previous) { data.set(previous); data.set(vertices, previous.length); }
    gl!.bindBuffer(gl!.ARRAY_BUFFER, borderBuffer); gl!.bufferData(gl!.ARRAY_BUFFER, data, gl!.STATIC_DRAW);
    borderCount = vertices.length / 3; previousBorderCount = (previous?.length ?? 0) / 3;
    if (gl!.getError() !== gl!.NO_ERROR) throw new Error('Globe border buffer unavailable');
  }
  function uploadRegions(outline?: Float32Array) {
    if (gl!.isContextLost()) return;
    if (!outline?.length) {
      if (regionBuffer) gl!.deleteBuffer(regionBuffer);
      regionBuffer = null;
      regionCount = 0;
      return;
    }
    regionBuffer ??= gl!.createBuffer();
    if (!regionBuffer) throw new Error('Globe regional buffer unavailable');
    gl!.bindBuffer(gl!.ARRAY_BUFFER, regionBuffer);
    gl!.bufferData(gl!.ARRAY_BUFFER, outline, gl!.STATIC_DRAW);
    regionCount = outline.length / 3;
    if (gl!.getError() !== gl!.NO_ERROR) throw new Error('Globe regional buffer unavailable');
  }

  function uploadSelection(source: HTMLCanvasElement | null, outline?: Float32Array, regional = false) {
    if (gl!.isContextLost() || (!source && !hasSelection)) return;
    gl!.activeTexture(gl!.TEXTURE1);
    if (source) gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.ALPHA, gl!.ALPHA, gl!.UNSIGNED_BYTE, source);
    else gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.ALPHA, 1, 1, 0, gl!.ALPHA, gl!.UNSIGNED_BYTE, new Uint8Array(1));
    gl!.generateMipmap(gl!.TEXTURE_2D);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindBuffer(gl!.ARRAY_BUFFER, selectionBorder);
    if (outline) gl!.bufferData(gl!.ARRAY_BUFFER, outline, gl!.STATIC_DRAW);
    else gl!.bufferData(gl!.ARRAY_BUFFER, 0, gl!.STATIC_DRAW);
    hasSelection = source !== null;
    regionSelected = regional;
    selectionBorderCount = (outline?.length ?? 0) / 3;
    if (gl!.getError() !== gl!.NO_ERROR) throw new Error('Globe selection unavailable');
  }
  function surfaceAttributes() {
    gl!.useProgram(program); gl!.bindBuffer(gl!.ARRAY_BUFFER, vertices);
    gl!.enableVertexAttribArray(position); gl!.vertexAttribPointer(position, 3, gl!.FLOAT, false, 20, 0);
    gl!.enableVertexAttribArray(uv); gl!.vertexAttribPointer(uv, 2, gl!.FLOAT, false, 20, 12);
  }
  function draw(camera: WorldCamera, size: AtlasSize, borderMix = 1) {
    if (gl!.isContextLost()) return;
    const pixels = globeRenderSize(size.width, size.height, window.devicePixelRatio);
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) { canvas.width = pixels.width; canvas.height = pixels.height; }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    surfaceAttributes();
    const matrix = globeRotationMatrix(cameraRotation(camera));
    gl!.uniformMatrix3fv(rotation, false, matrix);
    gl!.uniform1i(selectionActive, Number(hasSelection));
    gl!.uniform1i(selectionRegion, Number(regionSelected));
    const radius = globeRadius(camera, size);
    gl!.uniform2f(scale, 2 * radius / size.width, 2 * radius / size.height);
    gl!.drawElements(gl!.TRIANGLES, mesh.indices.length, gl!.UNSIGNED_SHORT, 0);
    if (borderCount || selectionBorderCount || regionCount) {
      gl!.useProgram(borderProgram); gl!.bindBuffer(gl!.ARRAY_BUFFER, borderBuffer);
      gl!.disableVertexAttribArray(position); gl!.disableVertexAttribArray(uv);
      gl!.enableVertexAttribArray(borderPosition); gl!.vertexAttribPointer(borderPosition, 3, gl!.FLOAT, false, 12, 0);
      gl!.uniformMatrix3fv(borderRotation, false, matrix);
      gl!.uniform2f(borderScale, 2 * radius / size.width, 2 * radius / size.height);
      const opacity = borderStyle(camera, size, window.devicePixelRatio).opacity;
      gl!.disable(gl!.DEPTH_TEST); gl!.enable(gl!.BLEND); gl!.blendFunc(gl!.SRC_ALPHA, gl!.ONE_MINUS_SRC_ALPHA);
      gl!.lineWidth(1);
      gl!.uniform1i(clipToCountry, 0);
      gl!.uniform3f(borderColor, .141176, .231373, .258824);
      if (previousBorderCount) { gl!.uniform1f(borderOpacity, opacity * (1 - borderMix)); gl!.drawArrays(gl!.LINES, 0, previousBorderCount); }
      gl!.uniform1f(borderOpacity, opacity * borderMix); gl!.drawArrays(gl!.LINES, previousBorderCount, borderCount);
      if (regionBuffer && hasSelection) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, regionBuffer);
        gl!.vertexAttribPointer(borderPosition, 3, gl!.FLOAT, false, 12, 0);
        gl!.uniform1i(clipToCountry, 1);
        gl!.uniform3f(borderColor, .075, .145, .224);
        gl!.uniform1f(borderOpacity, .92);
        gl!.drawArrays(gl!.LINES, 0, regionCount);
      }
      if (selectionBorderCount) {
        gl!.bindBuffer(gl!.ARRAY_BUFFER, selectionBorder);
        gl!.vertexAttribPointer(borderPosition, 3, gl!.FLOAT, false, 12, 0);
        gl!.uniform3f(borderColor, ...highlight);
        gl!.uniform1i(clipToCountry, Number(regionSelected));
        gl!.uniform1f(borderOpacity, 1);
        gl!.drawArrays(gl!.LINES, 0, selectionBorderCount);
      }
      gl!.disable(gl!.BLEND); gl!.enable(gl!.DEPTH_TEST); surfaceAttributes();
    }
  }
  function dispose() {
    gl!.deleteBuffer(vertices); gl!.deleteBuffer(indices); gl!.deleteTexture(texture); gl!.deleteProgram(program);
    gl!.deleteBuffer(borderBuffer); gl!.deleteProgram(borderProgram);
    gl!.deleteBuffer(selectionBorder); gl!.deleteTexture(selectionTexture);
    if (regionBuffer) gl!.deleteBuffer(regionBuffer);
    // React's development effect replay keeps the canvas connected; real removal
    // releases the context as well as its resources.
    if (!canvas.isConnected) gl!.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return { textureWidth, upload, uploadBorders, uploadRegions, uploadSelection, draw, dispose };
}
