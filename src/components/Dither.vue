<template>
  <div
    ref="containerRef"
    class="dither-surface"
    aria-hidden="true"
  />
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, useTemplateRef } from 'vue';
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl';
import type { OGLRenderingContext } from 'ogl';

type RgbColor = [number, number, number];

interface DitherProps {
  waveSpeed?: number;
  waveFrequency?: number;
  waveAmplitude?: number;
  waveColor?: RgbColor;
  waveMidColor?: RgbColor;
  waveShadowColor?: RgbColor;
  colorNum?: number;
  pixelSize?: number;
  disableAnimation?: boolean;
  enableMouseInteraction?: boolean;
  mouseRadius?: number;
}

const props = withDefaults(defineProps<DitherProps>(), {
  waveSpeed: 0.05,
  waveFrequency: 3,
  waveAmplitude: 0.3,
  waveColor: () => [1, 0.8, 0],
  waveMidColor: () => [1, 0.529, 0],
  waveShadowColor: () => [1, 0.267, 0.267],
  colorNum: 4,
  pixelSize: 2,
  disableAnimation: false,
  enableMouseInteraction: true,
  mouseRadius: 0.3,
});

const containerRef = useTemplateRef<HTMLDivElement>('containerRef');

let renderer: Renderer | null = null;
let gl: OGLRenderingContext | null = null;
let program: Program | null = null;
let mesh: Mesh | null = null;
let animationId: number | null = null;
let currentMouse = [0, 0];
let targetMouse = [0, 0];

const vertexShader = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const fragmentShader = `
precision highp float;

uniform float time;
uniform vec2 resolution;
uniform float waveSpeed;
uniform float waveFrequency;
uniform float waveAmplitude;
uniform vec3 waveColor;
uniform vec3 waveMidColor;
uniform vec3 waveShadowColor;
uniform vec2 mousePos;
uniform int enableMouseInteraction;
uniform float mouseRadius;
uniform float colorNum;
uniform float pixelSize;

varying vec2 vUv;

vec4 mod289(vec4 x) {
  return x - floor(x * (1.0 / 289.0)) * 289.0;
}

vec4 permute(vec4 x) {
  return mod289(((x * 34.0) + 1.0) * x);
}

vec4 taylorInvSqrt(vec4 r) {
  return 1.79284291400159 - 0.85373472095314 * r;
}

vec2 fade(vec2 t) {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0);
}

float cnoise(vec2 p) {
  vec4 pi = floor(p.xyxy) + vec4(0.0, 0.0, 1.0, 1.0);
  vec4 pf = fract(p.xyxy) - vec4(0.0, 0.0, 1.0, 1.0);
  pi = mod289(pi);

  vec4 ix = pi.xzxz;
  vec4 iy = pi.yyww;
  vec4 fx = pf.xzxz;
  vec4 fy = pf.yyww;
  vec4 i = permute(permute(ix) + iy);
  vec4 gx = fract(i * (1.0 / 41.0)) * 2.0 - 1.0;
  vec4 gy = abs(gx) - 0.5;
  vec4 tx = floor(gx + 0.5);
  gx -= tx;

  vec2 g00 = vec2(gx.x, gy.x);
  vec2 g10 = vec2(gx.y, gy.y);
  vec2 g01 = vec2(gx.z, gy.z);
  vec2 g11 = vec2(gx.w, gy.w);
  vec4 norm = taylorInvSqrt(
    vec4(
      dot(g00, g00),
      dot(g01, g01),
      dot(g10, g10),
      dot(g11, g11)
    )
  );
  g00 *= norm.x;
  g01 *= norm.y;
  g10 *= norm.z;
  g11 *= norm.w;

  float n00 = dot(g00, vec2(fx.x, fy.x));
  float n10 = dot(g10, vec2(fx.y, fy.y));
  float n01 = dot(g01, vec2(fx.z, fy.z));
  float n11 = dot(g11, vec2(fx.w, fy.w));
  vec2 fadeXY = fade(pf.xy);
  vec2 noiseX = mix(vec2(n00, n01), vec2(n10, n11), fadeXY.x);
  return 2.3 * mix(noiseX.x, noiseX.y, fadeXY.y);
}

const int OCTAVES = 8;

float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 1.0;
  float frequency = waveFrequency;

  for (int i = 0; i < OCTAVES; i++) {
    value += amplitude * abs(cnoise(p));
    p *= frequency;
    amplitude *= waveAmplitude;
  }

  return value;
}

float pattern(vec2 p) {
  vec2 shifted = p - time * waveSpeed;
  return fbm(p - fbm(p + fbm(shifted)));
}

float bayer2(vec2 p) {
  return mod(3.0 * p.x + 2.0 * p.y, 4.0);
}

float bayer8(vec2 p) {
  vec2 lowBits = mod(p, 2.0);
  vec2 midBits = mod(floor(p / 2.0), 2.0);
  vec2 highBits = floor(p / 4.0);
  float threshold = 16.0 * bayer2(lowBits);
  threshold += 4.0 * bayer2(midBits);
  threshold += bayer2(highBits);
  return threshold / 64.0;
}

vec3 fireRamp(float value) {
  float normalized = clamp(value, 0.0, 1.0);
  vec3 nearBlack = vec3(0.012, 0.003, 0.002);
  vec3 shadow = mix(
    nearBlack,
    waveShadowColor,
    smoothstep(0.06, 0.42, normalized)
  );
  vec3 middle = mix(
    waveShadowColor,
    waveMidColor,
    smoothstep(0.28, 0.72, normalized)
  );
  vec3 highlight = mix(
    waveMidColor,
    waveColor,
    smoothstep(0.62, 1.0, normalized)
  );
  vec3 ramp = mix(shadow, middle, smoothstep(0.16, 0.54, normalized));
  return mix(ramp, highlight, smoothstep(0.54, 0.94, normalized));
}

vec3 dither(vec2 uv, vec3 color) {
  vec2 scaled = floor(uv * resolution / pixelSize);
  vec2 matrixCoordinate = mod(scaled, 8.0);
  float threshold = bayer8(matrixCoordinate) - 0.25;
  float levels = max(colorNum - 1.0, 1.0);
  color += threshold / levels;
  color = clamp(color - 0.12, 0.0, 1.0);
  return floor(color * levels + 0.5) / levels;
}

void main() {
  vec2 uv = gl_FragCoord.xy / resolution.xy;
  vec2 centeredUv = uv - 0.5;
  centeredUv.x *= resolution.x / resolution.y;

  float field = pattern(centeredUv);

  if (enableMouseInteraction == 1) {
    vec2 mouseNdc = (mousePos / resolution - 0.5) * vec2(1.0, -1.0);
    mouseNdc.x *= resolution.x / resolution.y;
    float distanceToMouse = length(centeredUv - mouseNdc);
    float mouseEffect = 1.0 - smoothstep(0.0, mouseRadius, distanceToMouse);
    field -= 0.5 * mouseEffect;
  }

  float intensity = smoothstep(0.08, 1.18, field);
  vec3 color = fireRamp(intensity);
  color = dither(uv, color);
  gl_FragColor = vec4(color, 1.0);
}
`;

const shouldAnimate = () => {
  return !props.disableAnimation && !document.hidden;
};

const moveMouseToCenter = () => {
  if (!gl) return;

  const centerX = gl.canvas.width / 2;
  const centerY = gl.canvas.height / 2;
  targetMouse = [centerX, centerY];
};

const syncColorUniform = (name: string, color: RgbColor) => {
  if (!program) return;

  const uniformColor = program.uniforms[name].value as Color;
  uniformColor.r = color[0];
  uniformColor.g = color[1];
  uniformColor.b = color[2];
};

const syncUniforms = (timestamp: number) => {
  if (!program || !gl) return;

  const smoothing = 0.05;
  currentMouse[0] += smoothing * (targetMouse[0] - currentMouse[0]);
  currentMouse[1] += smoothing * (targetMouse[1] - currentMouse[1]);

  program.uniforms.time.value = timestamp * 0.001;
  program.uniforms.waveSpeed.value = props.waveSpeed;
  program.uniforms.waveFrequency.value = props.waveFrequency;
  program.uniforms.waveAmplitude.value = props.waveAmplitude;
  program.uniforms.mousePos.value[0] = currentMouse[0];
  program.uniforms.mousePos.value[1] = currentMouse[1];
  program.uniforms.enableMouseInteraction.value = props.enableMouseInteraction ? 1 : 0;
  program.uniforms.mouseRadius.value = props.mouseRadius;
  program.uniforms.colorNum.value = props.colorNum;
  program.uniforms.pixelSize.value = props.pixelSize;

  syncColorUniform('waveColor', props.waveColor);
  syncColorUniform('waveMidColor', props.waveMidColor);
  syncColorUniform('waveShadowColor', props.waveShadowColor);
};

const renderFrame = (timestamp: number) => {
  if (!renderer || !mesh) return;

  syncUniforms(timestamp);
  renderer.render({ scene: mesh });
};

const animate = (timestamp: number) => {
  animationId = null;
  renderFrame(timestamp);

  if (!shouldAnimate()) return;
  animationId = requestAnimationFrame(animate);
};

const stopAnimation = () => {
  if (animationId === null) return;

  cancelAnimationFrame(animationId);
  animationId = null;
};

const restartAnimation = () => {
  stopAnimation();
  renderFrame(performance.now());

  if (!shouldAnimate()) return;
  animationId = requestAnimationFrame(animate);
};

const resize = () => {
  if (!containerRef.value || !renderer || !program || !gl) return;

  const width = Math.max(containerRef.value.clientWidth, 1);
  const height = Math.max(containerRef.value.clientHeight, 1);
  renderer.setSize(width, height);
  program.uniforms.resolution.value[0] = gl.canvas.width;
  program.uniforms.resolution.value[1] = gl.canvas.height;
  moveMouseToCenter();
  currentMouse = [...targetMouse];
  renderFrame(performance.now());
};

const handlePointerMove = (event: PointerEvent) => {
  if (!containerRef.value || !gl || !props.enableMouseInteraction) return;

  const rect = containerRef.value.getBoundingClientRect();
  const pointerInside = event.clientX >= rect.left
    && event.clientX <= rect.right
    && event.clientY >= rect.top
    && event.clientY <= rect.bottom;

  if (!pointerInside) {
    moveMouseToCenter();
    return;
  }

  const normalizedX = (event.clientX - rect.left) / rect.width;
  const normalizedY = (event.clientY - rect.top) / rect.height;
  targetMouse = [
    normalizedX * gl.canvas.width,
    normalizedY * gl.canvas.height,
  ];
};

const handleVisibilityChange = () => {
  restartAnimation();
};

const cleanup = () => {
  stopAnimation();
  window.removeEventListener('resize', resize);
  window.removeEventListener('pointermove', handlePointerMove);
  document.removeEventListener('visibilitychange', handleVisibilityChange);

  const canvas = containerRef.value?.querySelector('canvas');
  canvas?.remove();
  gl?.getExtension('WEBGL_lose_context')?.loseContext();

  renderer = null;
  gl = null;
  program = null;
  mesh = null;
  currentMouse = [0, 0];
  targetMouse = [0, 0];
};

const initializeScene = () => {
  if (!containerRef.value) return;

  cleanup();

  try {
    renderer = new Renderer({
      alpha: true,
      dpr: Math.min(window.devicePixelRatio, 1.5),
    });
    gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);

    const geometry = new Triangle(gl);
    program = new Program(gl, {
      vertex: vertexShader,
      fragment: fragmentShader,
      uniforms: {
        time: { value: 0 },
        resolution: { value: new Float32Array([1, 1]) },
        waveSpeed: { value: props.waveSpeed },
        waveFrequency: { value: props.waveFrequency },
        waveAmplitude: { value: props.waveAmplitude },
        waveColor: { value: new Color(...props.waveColor) },
        waveMidColor: { value: new Color(...props.waveMidColor) },
        waveShadowColor: { value: new Color(...props.waveShadowColor) },
        mousePos: { value: new Float32Array([0, 0]) },
        enableMouseInteraction: {
          value: props.enableMouseInteraction ? 1 : 0,
        },
        mouseRadius: { value: props.mouseRadius },
        colorNum: { value: props.colorNum },
        pixelSize: { value: props.pixelSize },
      },
    });
    mesh = new Mesh(gl, { geometry, program });

    const canvas = gl.canvas as HTMLCanvasElement;
    canvas.style.display = 'block';
    canvas.style.height = '100%';
    canvas.style.pointerEvents = 'none';
    canvas.style.width = '100%';
    canvas.setAttribute('aria-hidden', 'true');
    containerRef.value.appendChild(canvas);
    containerRef.value.dataset.renderer = 'webgl';

    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    document.addEventListener('visibilitychange', handleVisibilityChange);

    resize();
    restartAnimation();
  } catch {
    cleanup();
    containerRef.value.dataset.renderer = 'fallback';
  }
};

onMounted(initializeScene);
onUnmounted(cleanup);
</script>

<style scoped>
/* Adapted from Vue Bits Dither: MIT license with Commons Clause. */
.dither-surface {
  position: absolute;
  inset: 0;
  contain: strict;
  height: 100%;
  overflow: hidden;
  width: 100%;
}
</style>
