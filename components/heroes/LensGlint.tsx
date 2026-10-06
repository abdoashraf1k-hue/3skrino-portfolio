"use client";

import { useEffect, useRef, type RefObject } from "react";

/**
 * A glossy highlight that lives inside the sunglasses lenses and slides
 * toward the cursor — a fragment shader on one quad, drawn over the pose
 * image (same box, so lens coordinates are image fractions). Raw WebGL: one
 * program, two triangles, no three.js. No WebGL → renders nothing.
 */

const VERT = `attribute vec2 p;varying vec2 uv;void main(){uv=p*.5+.5;uv.y=1.-uv.y;gl_Position=vec4(p,0.,1.);}`;

// Each lens is an ellipse (wider than tall). Inside it: a soft streak + a hot
// core, both offset toward the pointer, fading at the lens rim.
const FRAG = `precision mediump float;
varying vec2 uv;
uniform vec2 L;uniform vec2 R;uniform float rad;uniform vec2 dir;uniform float k;uniform float t;uniform float aspect;
float lens(vec2 c){
  vec2 d=(uv-c)/vec2(rad*1.25,rad*.82);d.x*=aspect;
  float inside=1.-smoothstep(.78,1.,length(d));
  vec2 h=d-dir*.42;
  float core=exp(-dot(h,h)*26.);
  vec2 s=vec2(h.x*.55+h.y*.85,h.y*.55-h.x*.85);
  float streak=exp(-s.x*s.x*90.-s.y*s.y*5.);
  return inside*(core*.9+streak*.35)*(.92+.08*sin(t*1.7));
}
void main(){
  float g=(lens(L)+lens(R))*k;
  gl_FragColor=vec4(vec3(1.,.98,.94)*g,g);
}`;

type Props = {
  /** Lens centres as image fractions (x right, y down) and radius (fraction of width). */
  left: [number, number];
  right: [number, number];
  radius: number;
  /** 0–1. */
  intensity: number;
  /** Pointer as -1…1 in each axis, written by the parent every frame. */
  pointer: RefObject<{ x: number; y: number }>;
  visible: boolean;
  className?: string;
};

export default function LensGlint({ left, right, radius, intensity, pointer, visible, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const props = useRef({ left, right, radius, intensity, visible });
  useEffect(() => {
    props.current = { left, right, radius, intensity, visible };
  }, [left, right, radius, intensity, visible]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const gl = canvas?.getContext("webgl", { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!canvas || !gl) return;

    const shader = (type: number, src: string) => {
      const s = gl.createShader(type);
      if (!s) return null;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram();
    if (!vs || !fs || !prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

    const u = (n: string) => gl.getUniformLocation(prog, n);
    const uL = u("L");
    const uR = u("R");
    const uRad = u("rad");
    const uDir = u("dir");
    const uK = u("k");
    const uT = u("t");
    const uAspect = u("aspect");

    const resize = () => {
      const dpr = Math.min(1.5, window.devicePixelRatio || 1);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.round(width * dpr));
      canvas.height = Math.max(1, Math.round(height * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const dir = { x: 0, y: 0 };
    let fade = 0;
    let raf = 0;
    const t0 = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const p = props.current;
      const target = pointer.current ?? { x: 0, y: 0 };
      dir.x += (target.x - dir.x) * 0.12;
      dir.y += (target.y - dir.y) * 0.12;
      fade += ((p.visible ? 1 : 0) - fade) * 0.15;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      if (fade < 0.01) return;
      gl.uniform2f(uL, p.left[0], p.left[1]);
      gl.uniform2f(uR, p.right[0], p.right[1]);
      gl.uniform1f(uRad, p.radius);
      // Screen y grows downward; so does the image fraction space.
      gl.uniform2f(uDir, Math.max(-1, Math.min(1, dir.x)), Math.max(-1, Math.min(1, -dir.y)));
      gl.uniform1f(uK, p.intensity * fade);
      gl.uniform1f(uT, (now - t0) / 1000);
      gl.uniform1f(uAspect, canvas.width / canvas.height);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
    };
  }, [pointer]);

  return <canvas ref={canvasRef} aria-hidden className={className} />;
}
