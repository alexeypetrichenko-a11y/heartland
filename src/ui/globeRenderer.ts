import type { AtlasSize } from '../geography/atlas';
import { createGlobeMesh, globeRenderSize, globeRotationMatrix } from '../geography/globeMesh';
import { globeRadius, type WorldCamera } from '../geography/worldCamera';

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
varying vec2 textureUV;
varying vec3 surfaceNormal;
void main() {
  vec3 n = normalize(surfaceNormal);
  vec3 color = texture2D(world, textureUV).rgb;
  float light = 0.90 + 0.10 * max(0.0, dot(n, normalize(vec3(-0.35, 0.5, 1.0))));
  float rim = pow(1.0 - max(0.0, n.z), 4.0) * 0.10;
  gl_FragColor = vec4(color * light + vec3(0.12, 0.24, 0.32) * rim, 1.0);
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
  const mesh = createGlobeMesh();
  const vertices = gl.createBuffer()!, indices = gl.createBuffer()!, texture = gl.createTexture()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, mesh.vertices, gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);
  gl.useProgram(program);
  const position = gl.getAttribLocation(program, 'position'), uv = gl.getAttribLocation(program, 'uv');
  gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 20, 0);
  gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 20, 12);
  const rotation = gl.getUniformLocation(program, 'rotation'), scale = gl.getUniformLocation(program, 'scale');
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
  function draw(camera: WorldCamera, size: AtlasSize) {
    if (gl!.isContextLost()) return;
    const pixels = globeRenderSize(size.width, size.height, window.devicePixelRatio);
    if (canvas.width !== pixels.width || canvas.height !== pixels.height) { canvas.width = pixels.width; canvas.height = pixels.height; }
    gl!.viewport(0, 0, canvas.width, canvas.height);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.uniformMatrix3fv(rotation, false, globeRotationMatrix(camera.rotation));
    const radius = globeRadius(camera, size);
    gl!.uniform2f(scale, 2 * radius / size.width, 2 * radius / size.height);
    gl!.drawElements(gl!.TRIANGLES, mesh.indices.length, gl!.UNSIGNED_SHORT, 0);
  }
  function dispose() {
    gl!.deleteBuffer(vertices); gl!.deleteBuffer(indices); gl!.deleteTexture(texture); gl!.deleteProgram(program);
    // React's development effect replay keeps the canvas connected; real removal
    // releases the context as well as its resources.
    if (!canvas.isConnected) gl!.getExtension('WEBGL_lose_context')?.loseContext();
  }
  return { textureWidth, upload, draw, dispose };
}
