/*!
 * dsh-ui-deepseek-bg 客户端入口（自动生成）
 * 由 scripts/build.mjs 从 src/ 拼接生成——请勿直接修改本文件；
 * 修改源码（src/ 下的模块与 CSS）后运行：node scripts/build.mjs
 */
window.__ModuleLoader__.load({
  id: "@lynn123411/dsh-ui-deepseek-bg",
  factory: (require) => {
    "use strict";
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    // 设置页面板需要 React（平台 seed 模块）；拿不到就跳过设置 UI，不影响背景效果
    var react = null;
    try { react = require("react"); } catch (e) {}
    if (document.getElementById("dsh-deepseek-bg-css") === null) {
      var styleTag = document.createElement("style");
      styleTag.id = "dsh-deepseek-bg-css";
      styleTag.textContent = `
/*!
 * dsh-deepseek-bg.css
 * DeepSeek 官网首页背景复刻 —— DSH Web GUI 全屏固定背景层 + 外壳透明化。
 *
 * 颜色与蒙版均取自 DeepSeek 官方站点：
 *  - 浅色 hero 渐变:  linear-gradient(180deg, #9cc1e7 0%, rgba(250,250,250,0) 100%)
 *  - 深色 harness 页: 页面底色 #0a0a0a
 *  - canvas 蒙版:      linear-gradient(#000000fc 0%, #000000e8 8.98%, transparent 100%)
 *  - 入场动画:        opacity 0→1 + blur(20px)→0，1.8s ease-out（harness hero 同款）
 *
 * 本插件仅背景引擎：深色主题显示背景层（#0a0a0a + 极光/鲸鱼/星座，
 * body[data-ds-dark-theme] 生效）；浅色主题恢复 DSH 官方原版外观。
 * UI 皮肤（玻璃/Beam/Orbs）由 dsh-ui-beam-orbs 提供。
 */

/* ---------- 背景层：深色主题生效，浅色主题隐藏（官方原版） ---------- */
#dsh-ds-bg {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: linear-gradient(180deg, #9cc1e7 0%, rgba(250, 250, 250, 0) 100%), #f9f8f8;
  animation: dsh-ds-enter 1.8s ease-out backwards;
  /* GPU 优化：不常驻 will-change（入场动画由合成器自动提升层），避免全屏容器
     永久占用一层合成显存与带宽 */
}

/* 浅色主题：整个背景层隐藏，DSH 官方原版浅色背景透出 */
#dsh-ds-bg:not(.dsh-ds-dark) {
  display: none;
}

#dsh-ds-bg.dsh-ds-dark {
  background: #0a0a0a;
}

#dsh-ds-aurora,
#dsh-ds-constellation {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: block;
  /* 官方 hero 蒙版（与 deepseek.com 原站一致） */
  mask: linear-gradient(#000000fc 0%, #000000e8 8.98%, transparent 100%);
  -webkit-mask: linear-gradient(#000000fc 0%, #000000e8 8.98%, transparent 100%);
}

#dsh-ds-constellation {
  background: transparent;
}

/* 鲸鱼层：screen 混合；显隐由 JS 控制（仅深色主题 + 设置开关） */
.dsh-ds-whale {
  position: absolute;
  inset: 0;
  align-items: center;
  justify-content: center;
  pointer-events: none;
  mix-blend-mode: screen;
  z-index: 2;
}

@keyframes dsh-ds-enter {
  0% {
    opacity: 0;
    filter: blur(20px);
  }
  100% {
    opacity: 1;
    filter: blur(0);
  }
}

@media (prefers-reduced-motion: reduce) {
  #dsh-ds-bg {
    animation: none;
  }
}

/* ===================================================================== *
 * 外壳透明化：仅深色主题生效（body[data-ds-dark-theme]）；
 * 浅色主题不匹配任何规则，保持 DSH 官方原版外观。
 * ===================================================================== */

/* 背景透出：body 与外壳层透明化 */
body[data-ds-dark-theme] {
  background: transparent !important;
}

body[data-ds-dark-theme] [data-slot="root"] > div {
  background: transparent !important;
}

/* 当前构建的布局 frame 类名（精确覆盖，防中间包裹层） */
body[data-ds-dark-theme] [data-slot="root"] .pI_x6G_frame {
  background: transparent !important;
}

/* 插件加载前的启动屏 */
body[data-ds-dark-theme] #root ._boot_9gj4p_6 {
  background: transparent !important;
}

/* 视图根容器透明化：会话视图（bg-base）与详情列内容（轨迹视图 bg-layer-1）
   都是全高不透明容器，会盖住 DeepSeek 背景层 */
body[data-ds-dark-theme] [data-slot="conversation"] > div {
  background: transparent !important;
}

body[data-ds-dark-theme] .pI_x6G_detailsCol > div {
  background: transparent !important;
}

`;
      document.head.appendChild(styleTag);
    }

/* ===================== aurora-shaders.js ===================== */
/* ===================================================================== *
 * src/aurora-shaders.js — 工厂级片段（无副作用：字符串常量）
 *   极光引擎 GLSL 着色器（与 DeepSeek 打包产物逐字一致），
 *   被 src/aurora.js（initAurora）直接引用。
 * ===================================================================== */
/* ------------------------------------------------------------------ *
   * 着色器（与 DeepSeek 打包产物逐字一致）
   * ------------------------------------------------------------------ */
  var VERT = "#version 300 es\nin vec4 a_position;\nout vec2 vUv;\nvoid main() {\n  vUv = a_position.xy * 0.5 + 0.5;\n  gl_Position = a_position;\n}\n";

  var FLOWMAP_FS = "#version 300 es\n" +
    "precision mediump float;\n" +
    "in vec2 vUv;\n" +
    "uniform sampler2D u_prev;\n" +
    "uniform vec2 u_mouse;\n" +
    "uniform vec2 u_velocity;\n" +
    "uniform float u_brushRadius;\n" +
    "uniform float u_brushStrength;\n" +
    "uniform float u_decay;\n" +
    "out vec4 fragColor;\n" +
    "\n" +
    "void main() {\n" +
    "  vec4 prev = texture(u_prev, vUv);\n" +
    "\n" +
    "  prev.r *= u_decay;\n" +
    "  prev.gb = mix(vec2(0.5), prev.gb, u_decay);\n" +
    "\n" +
    "  float dist = distance(vUv, u_mouse);\n" +
    "\n" +
    "  float influence = exp(-dist * dist / (u_brushRadius * u_brushRadius * 0.5));\n" +
    "  influence = max(0.0, influence - 0.01);\n" +
    "\n" +
    "  float speed = length(u_velocity);\n" +
    "  float presenceStrength = u_brushStrength * 0.3;\n" +
    "  float velBonus = min(speed * 3.0, 0.7) * u_brushStrength;\n" +
    "  float totalStrength = presenceStrength + velBonus;\n" +
    "\n" +
    "  prev.r = max(prev.r, influence * totalStrength);\n" +
    "  float blendAmt = influence * min(totalStrength, 0.4) * 0.3;\n" +
    "  prev.g = mix(prev.g, clamp(u_velocity.x * 2.0 + 0.5, 0.0, 1.0), blendAmt);\n" +
    "  prev.b = mix(prev.b, clamp(u_velocity.y * 2.0 + 0.5, 0.0, 1.0), blendAmt);\n" +
    "\n" +
    "  fragColor = prev;\n" +
    "}\n";

  var PARTICLE_FS = "#version 300 es\n" +
    "precision mediump float;\n" +
    "in vec2 vUv;\n" +
    "uniform float u_time;\n" +
    "uniform float u_pixelRatio;\n" +
    "uniform vec2 u_resolution;\n" +
    "uniform float u_scale;\n" +
    "uniform float u_rotation;\n" +
    "uniform vec4 u_color1, u_color2, u_color3, u_color4, u_color5;\n" +
    "uniform float u_colorCount;\n" +
    "uniform float u_proportion;\n" +
    "uniform float u_softness;\n" +
    "uniform float u_shape;\n" +
    "uniform float u_shapeScale;\n" +
    "uniform float u_distortion;\n" +
    "uniform float u_swirl;\n" +
    "uniform float u_swirlIterations;\n" +
    "uniform vec2 u_offset;\n" +
    "uniform sampler2D u_flowmap;\n" +
    "uniform float u_distortBoost;\n" +
    "uniform float u_noiseBoost;\n" +
    "uniform float u_swirlBoost;\n" +
    "uniform float u_glowIntensity;\n" +
    "uniform vec3 u_glowColor1;\n" +
    "uniform vec3 u_glowColor2;\n" +
    "uniform vec3 u_glowColor3;\n" +
    "out vec4 fragColor;\n" +
    "\n" +
    "#define TWO_PI 6.28318530718\n" +
    "#define PI 3.14159265358979323846\n" +
    "\n" +
    "vec2 rotate(vec2 uv, float th) { return mat2(cos(th), sin(th), -sin(th), cos(th)) * uv; }\n" +
    "float random(vec2 st) { return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123); }\n" +
    "float noise(vec2 st) {\n" +
    "  vec2 i = floor(st); vec2 f = fract(st);\n" +
    "  float a = random(i), b = random(i + vec2(1,0)), c = random(i + vec2(0,1)), d = random(i + vec2(1,1));\n" +
    "  vec2 u = f*f*(3.0-2.0*f);\n" +
    "  return mix(mix(a,b,u.x), mix(c,d,u.x), u.y);\n" +
    "}\n" +
    "\n" +
    "vec3 blend_multi(float mixer, float softness) {\n" +
    "  float edge = 1.0 - softness;\n" +
    "  float n = u_colorCount;\n" +
    "  vec3 col = u_color1.rgb;\n" +
    "  if (n > 1.5) { col = mix(col, u_color2.rgb, smoothstep(0.0 + 0.2*edge, 1.0/(n-0.5) - 0.2*edge, mixer)); }\n" +
    "  if (n > 2.5) { col = mix(col, u_color3.rgb, smoothstep(1.0/(n-0.5) + 0.1*edge, 2.0/(n-0.5) - 0.1*edge, mixer)); }\n" +
    "  if (n > 3.5) { col = mix(col, u_color4.rgb, smoothstep(2.0/(n-0.5) + 0.1*edge, 3.0/(n-0.5) - 0.1*edge, mixer)); }\n" +
    "  if (n > 4.5) { col = mix(col, u_color5.rgb, smoothstep(3.0/(n-0.5) + 0.1*edge, 4.0/(n-0.5) - 0.1*edge, mixer)); }\n" +
    "  return col;\n" +
    "}\n" +
    "\n" +
    "void main() {\n" +
    "  vec2 uv = gl_FragCoord.xy / u_resolution.xy;\n" +
    "  float t = .5 * u_time;\n" +
    "  float ns = .0005 + .006 * u_scale;\n" +
    "  uv -= .5; uv *= (ns * u_resolution); uv = rotate(uv, u_rotation * .5 * PI);\n" +
    "  uv /= u_pixelRatio; uv += .5; uv += u_offset;\n" +
    "\n" +
    "  vec2 fragUV = gl_FragCoord.xy / u_resolution.xy;\n" +
    "  vec4 flow = texture(u_flowmap, fragUV);\n" +
    "  float influence = flow.r;\n" +
    "  vec2 flowDir = (flow.gb - 0.5) * 2.0;\n" +
    "\n" +
    "  float n1 = noise(uv + t), n2 = noise(uv*2. - t);\n" +
    "  float angle = n1 * TWO_PI;\n" +
    "\n" +
    "  float totalDistortion = u_distortion + influence * u_distortBoost;\n" +
    "  uv.x += 4. * totalDistortion * n2 * cos(angle);\n" +
    "  uv.y += 4. * totalDistortion * n2 * sin(angle);\n" +
    "\n" +
    "  uv += flowDir * influence * 0.15;\n" +
    "\n" +
    "  if (influence > 0.001) {\n" +
    "    float localNoise = noise(uv * 2.0 + t * 1.5);\n" +
    "    uv += influence * u_noiseBoost * vec2(cos(localNoise * TWO_PI), sin(localNoise * TWO_PI));\n" +
    "  }\n" +
    "\n" +
    "  float iters = ceil(clamp(u_swirlIterations, 1., 30.));\n" +
    "  float swirlAmt = clamp(u_swirl, 0., 2.) + influence * u_swirlBoost;\n" +
    "  for (float i = 1.; i <= 30.0; i++) {\n" +
    "    if (i > iters) break;\n" +
    "    uv.x += swirlAmt / i * cos(t + i*1.5*uv.y);\n" +
    "    uv.y += swirlAmt / i * cos(t + i*1.*uv.x);\n" +
    "  }\n" +
    "\n" +
    "  float proportion = clamp(u_proportion, 0., 1.);\n" +
    "  vec2 cuv = uv * (.5 + 3.5 * u_shapeScale);\n" +
    "  float shape = .5 + .5 * sin(cuv.x) * cos(cuv.y);\n" +
    "  float mixer = shape + .48 * sign(proportion - .5) * pow(abs(proportion - .5), .5);\n" +
    "  vec3 col = blend_multi(mixer, clamp(u_softness, 0., 1.));\n" +
    "\n" +
    "  // Mouse proximity color shift: 3-color glow\n" +
    "  float glow = smoothstep(0.0, 0.8, influence);\n" +
    "  float glowNoise = noise(uv * 3.0 + u_time * 0.1) ;\n" +
    "  float glowDist = smoothstep(0.0, 1.0, influence);\n" +
    "  vec3 glowMix = mix(u_glowColor3, u_glowColor2, glowDist);\n" +
    "  glowMix = mix(glowMix, u_glowColor1, glowDist * glowNoise);\n" +
    "  col = mix(col, glowMix, glow * u_glowIntensity);\n" +
    "\n" +
    "  fragColor = vec4(col, 1.0);\n" +
    "}\n";

  var FLUID_FS = "#version 300 es\n" +
    "precision mediump float;\n" +
    "in vec2 vUv;\n" +
    "uniform float u_time;\n" +
    "uniform vec2 u_resolution;\n" +
    "uniform vec3 u_c1, u_c2, u_c3, u_c4, u_c5;\n" +
    "uniform float u_scale;\n" +
    "uniform vec2 u_offset;\n" +
    "uniform float u_grain;\n" +
    "uniform float u_speed;\n" +
    "uniform sampler2D u_flowmap;\n" +
    "uniform float u_distortBoost;\n" +
    "uniform float u_swirlBoost;\n" +
    "uniform float u_glowIntensity;\n" +
    "uniform vec3 u_glowColor1;\n" +
    "uniform vec3 u_glowColor2;\n" +
    "uniform vec3 u_glowColor3;\n" +
    "uniform vec2 u_lightPos;\n" +
    "uniform float u_lightCore;\n" +
    "uniform float u_lightHalo;\n" +
    "uniform float u_vignette;\n" +
    "uniform float u_bloomThreshold;\n" +
    "uniform float u_bloomRange;\n" +
    "uniform float u_bloomStrength;\n" +
    "out vec4 fragColor;\n" +
    "\n" +
    "vec3 mod289v3(vec3 x){return x-floor(x*(1./289.))*289.;}\n" +
    "vec4 mod289v4(vec4 x){return x-floor(x*(1./289.))*289.;}\n" +
    "vec4 permute(vec4 x){return mod289v4(((x*34.)+1.)*x);}\n" +
    "vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}\n" +
    "\n" +
    "float snoise(vec3 v){\n" +
    "  const vec2 C=vec2(1./6.,1./3.);\n" +
    "  const vec4 D=vec4(0.,.5,1.,2.);\n" +
    "  vec3 i=floor(v+dot(v,C.yyy));\n" +
    "  vec3 x0=v-i+dot(i,C.xxx);\n" +
    "  vec3 g=step(x0.yzx,x0.xyz);\n" +
    "  vec3 l=1.-g;\n" +
    "  vec3 i1=min(g.xyz,l.zxy);\n" +
    "  vec3 i2=max(g.xyz,l.zxy);\n" +
    "  vec3 x1=x0-i1+C.xxx;\n" +
    "  vec3 x2=x0-i2+C.yyy;\n" +
    "  vec3 x3=x0-D.yyy;\n" +
    "  i=mod289v3(i);\n" +
    "  vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));\n" +
    "  float n_=.142857142857;\n" +
    "  vec3 ns=n_*D.wyz-D.xzx;\n" +
    "  vec4 j=p-49.*floor(p*ns.z*ns.z);\n" +
    "  vec4 x_=floor(j*ns.z);\n" +
    "  vec4 y_=floor(j-7.*x_);\n" +
    "  vec4 x=x_*ns.x+ns.yyyy;\n" +
    "  vec4 y=y_*ns.x+ns.yyyy;\n" +
    "  vec4 h=1.-abs(x)-abs(y);\n" +
    "  vec4 b0=vec4(x.xy,y.xy);\n" +
    "  vec4 b1=vec4(x.zw,y.zw);\n" +
    "  vec4 s0=floor(b0)*2.+1.;\n" +
    "  vec4 s1=floor(b1)*2.+1.;\n" +
    "  vec4 sh=-step(h,vec4(0.));\n" +
    "  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;\n" +
    "  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;\n" +
    "  vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);\n" +
    "  vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);\n" +
    "  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));\n" +
    "  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;\n" +
    "  vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);\n" +
    "  m=m*m;\n" +
    "  return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));\n" +
    "}\n" +
    "\n" +
    "float hash(vec2 p){\n" +
    "  vec3 p3=fract(vec3(p.xyx)*.1031);\n" +
    "  p3+=dot(p3,p3.yzx+33.33);\n" +
    "  return fract((p3.x+p3.y)*p3.z);\n" +
    "}\n" +
    "\n" +
    "float fbm(vec3 p){\n" +
    "  float v=0.,amp=.6;vec3 shift=vec3(100.);\n" +
    "  for(int i=0;i<1;i++){v+=amp*snoise(p);p=p*2.+shift;amp*=.4;}\n" +
    "  return v;\n" +
    "}\n" +
    "\n" +
    "float fluidNoise(vec2 uv,float t){\n" +
    "  float n1=fbm(vec3(uv*.6,t*.06));\n" +
    "  float n2=fbm(vec3(uv*.6+5.2,t*.06+1.3));\n" +
    "  vec2 w1=vec2(n1,n2)*.6;\n" +
    "  float n3=fbm(vec3((uv+w1)*.7+1.7,t*.05+3.1));\n" +
    "  float n4=fbm(vec3((uv+w1)*.7+9.2,t*.05+5.7));\n" +
    "  vec2 w2=vec2(n3,n4)*.5;\n" +
    "  return fbm(vec3((uv+w1+w2)*.5,t*.04));\n" +
    "}\n" +
    "\n" +
    "vec2 curlish(vec2 uv,float t){\n" +
    "  float eps=.02;\n" +
    "  float n=snoise(vec3(uv*.8,t));\n" +
    "  float nx=snoise(vec3((uv+vec2(eps,0.))*.8,t));\n" +
    "  float ny=snoise(vec3((uv+vec2(0.,eps))*.8,t));\n" +
    "  return vec2(-(ny-n)/eps,(nx-n)/eps)*.003;\n" +
    "}\n" +
    "\n" +
    "void main(){\n" +
    "  float aspect=u_resolution.x/u_resolution.y;\n" +
    "  vec2 uv=gl_FragCoord.xy/u_resolution;\n" +
    "  vec2 suv=vec2(uv.x*aspect, uv.y) * u_scale + u_offset;\n" +
    "  float t=u_time;\n" +
    "\n" +
    "  // Mouse interaction via flowmap\n" +
    "  vec4 flow = texture(u_flowmap, uv);\n" +
    "  float influence = flow.r;\n" +
    "  vec2 flowDir = (flow.gb - 0.5) * 2.0;\n" +
    "\n" +
    "  // Apply mouse distortion to UV\n" +
    "  suv += flowDir * influence * u_distortBoost * 0.8;\n" +
    "  // Apply mouse swirl\n" +
    "  float swirlAngle = influence * u_swirlBoost * 2.5;\n" +
    "  float cs = cos(swirlAngle), sn = sin(swirlAngle);\n" +
    "  vec2 delta = suv - vec2(uv.x * aspect, uv.y) * u_scale;\n" +
    "  suv += (mat2(cs, sn, -sn, cs) * delta - delta) * influence;\n" +
    "\n" +
    "  vec2 curl=curlish(suv,t*.04);\n" +
    "  vec2 uvD=suv+curl*12.;\n" +
    "  float f=fluidNoise(uvD,t);\n" +
    "  float swirl=snoise(vec3(uvD*.8+f*1.5,t*.035))*.5+.5;\n" +
    "  float n=f*.5+.5;\n" +
    "  vec3 col=mix(u_c1,u_c2,smoothstep(.2,.5,n));\n" +
    "  col=mix(col,u_c3,smoothstep(.35,.65,n+swirl*.25));\n" +
    "  col=mix(col,u_c4,smoothstep(.6,.85,swirl)*.55);\n" +
    "  col=mix(col,u_c5,smoothstep(.5,.8,n*swirl)*.35);\n" +
    "\n" +
    "  // Mouse proximity color shift: 3-color glow blended by distance + noise\n" +
    "  float glow = smoothstep(0.0, 0.8, influence);\n" +
    "  float glowNoise = snoise(vec3(uvD * 1.5, t * 0.08)) * 0.5 + 0.5;\n" +
    "  float glowDist = smoothstep(0.0, 1.0, influence);\n" +
    "  vec3 glowMix = mix(u_glowColor3, u_glowColor2, glowDist);\n" +
    "  glowMix = mix(glowMix, u_glowColor1, glowDist * glowNoise);\n" +
    "  col = mix(col, glowMix, glow * u_glowIntensity);\n" +
    "\n" +
    "  if(u_grain>0.0){\n" +
    "    vec2 flowOffset = (uvD - suv) * u_resolution.y;\n" +
    "    vec2 gp = floor((gl_FragCoord.xy + flowOffset) / 5.0);\n" +
    "    float gr=hash(gp)*2.-1.;\n" +
    "    col+=gr*u_grain;\n" +
    "  }\n" +
    "\n" +
    "  // Self-luminance bloom: bright fluid regions become their own light spots,\n" +
    "  // so glow follows the flow and mouse disturbance instead of a fixed point\n" +
    "  float luma=dot(col,vec3(.299,.587,.114));\n" +
    "  float bloom=smoothstep(u_bloomThreshold-u_bloomRange,u_bloomThreshold+u_bloomRange,luma);\n" +
    "  col+=(col*.85+vec3(.15,.145,.13))*bloom*u_bloomStrength;\n" +
    "\n" +
    "  // Virtual light source: soft warm core (same side as helm lighting)\n" +
    "  float ld=length((uv-u_lightPos)*vec2(aspect,1.));\n" +
    "  float core=exp(-ld*ld*4.5);\n" +
    "  float halo=exp(-ld*1.8);\n" +
    "  col+=vec3(1.,.97,.9)*core*u_lightCore+vec3(.72,.8,1.)*halo*u_lightHalo;\n" +
    "\n" +
    "  float vig=1.-smoothstep(.35,.75,length(uv-.5));\n" +
    "  col=mix(col*(1.-u_vignette),col,vig);\n" +
    "  fragColor=vec4(col,1.);\n" +
    "}\n";


/* ===================== whale-shaders.js ===================== */
/* ===================================================================== *
 * src/whale-shaders.js — 工厂级片段（无副作用：常量/工具函数）
 *   鲸鱼 SVG 纹理 / 默认参数 / GLSL 着色器 / 4x4 矩阵工具 / 像素采样，
 *   被 src/whale.js（initWhale）直接调用。
 * ===================================================================== */
  /* ------------------------------------------------------------------ *
   * 粒子化鲸鱼引擎（官方移植：HeroDigitileR3F → 原生 WebGL2）
   * 源码取自官网 harness 页懒加载 chunk 776（未进缓存，已从官网抓取）：
   *   - 粒子位置：官方算法从 hero-whale.svg 像素亮度采样（60x60，边缘保留）
   *   - 顶点/片元 shader：官方 GLSL 逐字移植（three.js 矩阵替换为原生 uniform）
   *   - 交互：鼠标扭曲粒子（radius/strength/decay/distort）、光线跟随鼠标
   *     （lightParams.followX）、入场组装动画、松散漂移、游泳波动
   *   - 参数：DIGITILE_LIGHT_DEFAULTS / DIGITILE_MOUSE_DEFAULTS 与官方一致
   * ------------------------------------------------------------------ */
  // 官方鲸鱼纹理（hero-whale.svg，抓自 https://www.deepseek.com/harness/images/hero-whale.svg）
  var WHALE_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="18" viewBox="0 0 24 18" fill="none"><path d="M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746V14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z" fill="#FFFFFF"/></svg>';
  var WHALE_SRC = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(WHALE_SVG);
  // 官方参数（chunk 776 源码常量，fish 变体，提升基础亮度与光照对比度）
  var LIGHT_DEFAULTS = { x: 4.5, y: 5.5, z: 3, range: 14, shadeMin: 0.42, shadeMax: 1.35, followX: 1.05 };
  var MOUSE_DEFAULTS = { radius: 4.9, strength: 0.8, decay: 0.2, distort: 5 };
  var WAVE_DEFAULTS = { speed: 1.5, amount: 0.06 };

  function sampleWhalePixels(img) {
    var T = 60;
    var c = document.createElement("canvas");
    c.width = T; c.height = T;
    var a = c.getContext("2d");
    a.fillStyle = "#000"; a.fillRect(0, 0, T, T);
    var r = Math.min(T / img.width, T / img.height);
    var o = img.width * r, s = img.height * r;
    a.drawImage(img, (T - o) / 2, (T - s) / 2, o, s);
    var d = a.getImageData(0, 0, T, T);
    var lum = new Float32Array(T * T);
    for (var i = 0; i < T * T; i++) lum[i] = (0.299 * d.data[4*i] + 0.587 * d.data[4*i+1] + 0.114 * d.data[4*i+2]) / 255;
    var positions = [], scattered = [], opacities = [], edges = [];
    var half = T / 2;
    function isEdge(x, y) {
      for (var yy = -2; yy <= 2; yy++) for (var xx = -2; xx <= 2; xx++) {
        if (xx === 0 && yy === 0) continue;
        var nx = x + xx, ny = y + yy;
        if (nx < 0 || ny < 0 || nx >= T || ny >= T) continue;
        if (lum[ny * T + nx] > 0.2) return false;
      }
      return true;
    }
    for (var y = 0; y < T; y++) for (var x = 0; x < T; x++) {
      var l = lum[y * T + x];
      if (l > 0.2 && !isEdge(x, y)) {
        positions.push((x - half) * 0.18, (half - y) * 0.18, 0);
        opacities.push(l);
        var ec = 0;
        for (var yy = -1; yy <= 1; yy++) for (var xx = -1; xx <= 1; xx++) {
          if (xx === 0 && yy === 0) continue;
          var nx = x + xx, ny = y + yy;
          if (nx < 0 || ny < 0 || nx >= T || ny >= T || lum[ny * T + nx] <= 0.2) ec++;
        }
        edges.push(ec / 8);
        var phi = Math.random() * Math.PI * 2;
        var th = Math.acos(2 * Math.random() - 1);
        var rad = 3 * (0.4 + 0.6 * Math.random());
        scattered.push(Math.sin(th) * Math.cos(phi) * rad, Math.sin(th) * Math.sin(phi) * rad, Math.cos(th) * rad * 0.5);
      }
    }
    return {
      positions: new Float32Array(positions),
      scatteredPositions: new Float32Array(scattered),
      opacities: new Float32Array(opacities),
      edges: new Float32Array(edges),
      count: positions.length / 3
    };
  }

  // ---- 官方 shader（GLSL 逐字移植，three.js 内建矩阵换为原生 uniform） ----
  var WHALE_VS = "#version 300 es\n" +
    "precision highp float;\n" +
    "in vec3 position;\n" +
    "in float aOpacity;\n" +
    "in float aIndex;\n" +
    "in float aEdge;\n" +
    "in vec3 aScattered;\n" +
    "in vec3 aCenter;\n" +
    "in float aScale;\n" +
    "uniform float uTime;\n" +
    "uniform float uWaveSpeed;\n" +
    "uniform float uWaveAmount;\n" +
    "uniform vec2 uMouse;\n" +
    "uniform float uMouseRadius;\n" +
    "uniform float uMouseStrength;\n" +
    "uniform float uMouseDistort;\n" +
    "uniform float uAssembly;\n" +
    "uniform float uLoose;\n" +
    "uniform float uScatter;\n" +
    "uniform vec3 uLightPos;\n" +
    "uniform float uLightRange;\n" +
    "uniform float uShadeMin;\n" +
    "uniform float uShadeMax;\n" +
    "uniform mat4 uModel;\n" +
    "uniform mat4 uView;\n" +
    "uniform mat4 uProj;\n" +
    "uniform float uPointScale;\n" +
    "out float vOpacity;\n" +
    "out vec3 vWorldPos;\n" +
    "out float vAssembly;\n" +
    "out float vLight;\n" +
    "void main() {\n" +
    "  vOpacity = aOpacity;\n" +
    "  vAssembly = uAssembly;\n" +
    "  vec3 targetCenter = aCenter;\n" +
    "  vec3 localOffset = position * aScale;\n" +
    "  vec3 scatteredCenter = aScattered;\n" +
    "  float assembly = smoothstep(0.0, 1.0, uAssembly);\n" +
    "  vec3 center = mix(scatteredCenter, targetCenter, assembly);\n" +
    "  vec3 pos = center + localOffset;\n" +
    "  vWorldPos = center;\n" +
    "  float loose = uLoose * mix(0.25, 1.0, aEdge) * assembly;\n" +
    "  if (loose > 0.001) {\n" +
    "    vec3 jitter = vec3(\n" +
    "      fract(sin(aIndex * 12.9898) * 43758.5453) - 0.5,\n" +
    "      fract(sin(aIndex * 78.2330) * 12543.1230) - 0.5,\n" +
    "      fract(sin(aIndex * 39.4250) * 26711.7700) - 0.5\n" +
    "    );\n" +
    "    pos += jitter * 0.05 * loose;\n" +
    "    pos.x += sin(uTime * 0.50 + aIndex * 0.53) * 0.06 * loose;\n" +
    "    pos.y += cos(uTime * 0.42 + aIndex * 0.71) * 0.06 * loose;\n" +
    "    pos.z += sin(uTime * 0.36 + aIndex * 0.91) * 0.08 * loose;\n" +
    "    float tail = smoothstep(0.5, 4.5, targetCenter.x) * uLoose * assembly;\n" +
    "    pos.y += sin(uTime * 1.1 - targetCenter.x * 0.7) * 0.1 * tail;\n" +
    "    pos.z += cos(uTime * 0.9 - targetCenter.x * 0.55) * 0.06 * tail;\n" +
    "  }\n" +
    "  if (uScatter > 0.001) {\n" +
    "    float disperse = uScatter * mix(0.5, 1.0, aEdge);\n" +
    "    pos += (scatteredCenter - center) * disperse;\n" +
    "    pos.z += sin(uTime * 0.6 + aIndex * 0.3) * disperse * 0.6;\n" +
    "  }\n" +
    "  if (assembly > 0.95) {\n" +
    "    float effectStrength = (assembly - 0.95) * 20.0;\n" +
    "    float dist = length(center.xy);\n" +
    "    float waveFade = smoothstep(0.0, 3.0, dist);\n" +
    "    float wave = sin(dist * 3.0 - uTime * uWaveSpeed) * uWaveAmount * effectStrength * waveFade;\n" +
    "    pos.z += wave;\n" +
    "  }\n" +
    "  if (assembly > 0.8) {\n" +
    "    float mouseEffect = (assembly - 0.8) * 5.0;\n" +
    "    vec2 toMouse = center.xy - uMouse;\n" +
    "    float mouseDist = length(toMouse);\n" +
    "    if (mouseDist < uMouseRadius && mouseDist > 0.001) {\n" +
    "      float t = 1.0 - mouseDist / uMouseRadius;\n" +
    "      float force = t * t * t * mouseEffect * uMouseStrength;\n" +
    "      vec2 radialDir = toMouse / mouseDist;\n" +
    "      float noiseAngle = sin(aIndex * 0.37 + uTime * 0.5) * uMouseDistort;\n" +
    "      float ca = cos(noiseAngle);\n" +
    "      float sa = sin(noiseAngle);\n" +
    "      vec2 pushDir = vec2(radialDir.x * ca - radialDir.y * sa, radialDir.x * sa + radialDir.y * ca);\n" +
    "      pos.xy += pushDir * force * 2.0;\n" +
    "      pos.z += sin(aIndex * 1.7 + uTime) * force * 0.8;\n" +
    "    }\n" +
    "  }\n" +
    "  if (assembly < 0.9) {\n" +
    "    float scatter = smoothstep(0.9, 0.0, assembly);\n" +
    "    pos.x += sin(uTime * 0.5 + aIndex * 0.1) * 0.2 * scatter;\n" +
    "    pos.y += cos(uTime * 0.4 + aIndex * 0.07) * 0.2 * scatter;\n" +
    "    pos.z += sin(uTime * 0.3 + aIndex * 0.13) * 0.15 * scatter;\n" +
    "  }\n" +
    "  vec4 worldPos = uModel * vec4(pos, 1.0);\n" +
    "  float lightDist = distance(worldPos.xyz, uLightPos);\n" +
    "  float lit = clamp(1.0 - lightDist / uLightRange, 0.0, 1.0);\n" +
    "  vLight = mix(uShadeMin, uShadeMax, lit * lit);\n" +
    "  vec4 mvPosition = uView * uModel * vec4(pos, 1.0);\n" +
    "  gl_PointSize = max(1.0, uPointScale * aScale);\n" +
    "  gl_Position = uProj * mvPosition;\n" +
    "}\n";

  var WHALE_FS = "#version 300 es\n" +
    "precision highp float;\n" +
    "in float vOpacity;\n" +
    "in vec3 vWorldPos;\n" +
    "in float vAssembly;\n" +
    "in float vLight;\n" +
    "uniform float uTime;\n" +
    "uniform vec3 uColor;\n" +
    "out vec4 fragColor;\n" +
    "void main() {\n" +
    "  float dist = length(vWorldPos.xy);\n" +
    "  float glow = smoothstep(8.0, 0.0, dist) * 0.35 * vAssembly;\n" +
    "  float baseAlpha = mix(0.65, 0.95, vAssembly);\n" +
    "  float alpha = vOpacity * (baseAlpha + glow);\n" +
    "  float shimmer = sin(uTime * 1.5 + vWorldPos.x * 5.0 + vWorldPos.y * 3.0) * 0.08 + 0.92;\n" +
    "  alpha *= shimmer * clamp(vLight * 0.85 + 0.25, 0.3, 1.0);\n" +
    "  vec3 color = (uColor + glow * vec3(0.15, 0.25, 0.45)) * vLight;\n" +
    "  color = mix(color, vec3(1.0), clamp(vLight - 0.85, 0.0, 1.0) * 0.45);\n" +
    "  fragColor = vec4(color, alpha);\n" +
    "}\n";

  // ---- 4x4 矩阵工具（列主序，与 WebGL uniform 一致） ----
  function m4Identity() { return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]); }
  function m4Mul(a, b) {
    var o = new Float32Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c*4+r] = a[0*4+r]*b[c*4+0] + a[1*4+r]*b[c*4+1] + a[2*4+r]*b[c*4+2] + a[3*4+r]*b[c*4+3];
    }
    return o;
  }
  function m4Translation(tx, ty, tz) {
    var m = m4Identity(); m[12] = tx; m[13] = ty; m[14] = tz; return m;
  }
  function m4RotationX(a) { var c = Math.cos(a), s = Math.sin(a); var m = m4Identity(); m[5] = c; m[6] = s; m[9] = -s; m[10] = c; return m; }
  function m4RotationY(a) { var c = Math.cos(a), s = Math.sin(a); var m = m4Identity(); m[0] = c; m[2] = -s; m[8] = s; m[10] = c; return m; }
  function m4RotationZ(a) { var c = Math.cos(a), s = Math.sin(a); var m = m4Identity(); m[0] = c; m[1] = s; m[4] = -s; m[5] = c; return m; }
  function m4Scale(s) { var m = m4Identity(); m[0] = s; m[5] = s; m[10] = s; return m; }
  function m4Perspective(fovY, aspect, near, far) {
    var f = 1 / Math.tan(fovY / 2), nf = 1 / (near - far);
    return new Float32Array([f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  }
  function m4Inverse(m, out) {
    // GPU 优化：支持传入复用缓冲（out），帧循环调用零分配
    var m00 = m[0], m01 = m[1], m02 = m[2], m03 = m[3];
    var m10 = m[4], m11 = m[5], m12 = m[6], m13 = m[7];
    var m20 = m[8], m21 = m[9], m22 = m[10], m23 = m[11];
    var m30 = m[12], m31 = m[13], m32 = m[14], m33 = m[15];

    var b00 = m00 * m11 - m01 * m10;
    var b01 = m00 * m12 - m02 * m10;
    var b02 = m00 * m13 - m03 * m10;
    var b03 = m01 * m12 - m02 * m11;
    var b04 = m01 * m13 - m03 * m11;
    var b05 = m02 * m13 - m03 * m12;
    var b06 = m20 * m31 - m21 * m30;
    var b07 = m20 * m32 - m22 * m30;
    var b08 = m20 * m33 - m23 * m30;
    var b09 = m21 * m32 - m22 * m31;
    var b10 = m21 * m33 - m23 * m31;
    var b11 = m22 * m33 - m23 * m32;

    var det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return m4Identity();
    var invDet = 1.0 / det;

    // 复用调用方传入的缓冲（帧循环零分配）；未传时保持原有行为分配新数组
    out = out || new Float32Array(16);
    out[0] = (m11 * b11 - m12 * b10 + m13 * b09) * invDet;
    out[1] = (-m01 * b11 + m02 * b10 - m03 * b09) * invDet;
    out[2] = (m31 * b05 - m32 * b04 + m33 * b03) * invDet;
    out[3] = (-m21 * b05 + m22 * b04 - m23 * b03) * invDet;
    out[4] = (-m10 * b11 + m12 * b08 - m13 * b07) * invDet;
    out[5] = (m00 * b11 - m02 * b08 + m03 * b07) * invDet;
    out[6] = (-m30 * b05 + m32 * b02 - m33 * b01) * invDet;
    out[7] = (m20 * b05 - m22 * b02 + m23 * b01) * invDet;
    out[8] = (m10 * b10 - m11 * b08 + m13 * b06) * invDet;
    out[9] = (-m00 * b10 + m01 * b08 - m03 * b06) * invDet;
    out[10] = (m30 * b04 - m31 * b02 + m33 * b00) * invDet;
    out[11] = (-m20 * b04 + m21 * b02 - m23 * b00) * invDet;
    out[12] = (-m10 * b09 + m11 * b07 - m12 * b06) * invDet;
    out[13] = (m00 * b09 - m01 * b07 + m02 * b06) * invDet;
    out[14] = (-m30 * b03 + m31 * b01 - m32 * b00) * invDet;
    out[15] = (m20 * b03 - m21 * b01 + m22 * b00) * invDet;

    return out;
  }


/* ===================== theme.js ===================== */
/* ------------------------------------------------------------------ *
 * src/theme.js — 主题检测与官方参数配置（initTheme）
 *   深色主题：官方 harness 深色配置（fluid 渲染 + 深色星座）；
 *   浅色主题：恢复 DSH 官方原版外观——背景层隐藏、界面零覆盖，
 *   极光/星座（若引擎运行）使用官方浅色 hero 参数（particle 渲染）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initTheme(shared) {
  var state = shared.state;

  function detectDark() {
    var b = document.body;
    var d = document.documentElement;
    if (b && b.hasAttribute("data-ds-dark-theme")) return true;
    if (d && d.hasAttribute("data-ds-dark-theme")) return true;
    if (b && b.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.hasAttribute("data-ds-light-theme")) return false;
    if (d && d.dataset) {
      if (d.dataset.theme === "dark") return true;
      if (d.dataset.theme === "light") return false;
    }
    // 官方 ThemePresenter 会把解析后的主题写入 <html> 的 color-scheme，
    // 比 prefers-color-scheme 更权威（用户显式选浅色而系统深色时依然正确）
    if (d && d.style && d.style.colorScheme) {
      if (d.style.colorScheme === "dark") return true;
      if (d.style.colorScheme === "light") return false;
    }
    return !!(shared.media.darkQuery && shared.media.darkQuery.matches);
  }

  /* ------------------------------------------------------------------ *
   * 官方参数配置
   *   浅色：www.deepseek.com 首页 hero（particle 渲染）
   *   深色：www.deepseek.com/harness hero（fluid 渲染）
   * ------------------------------------------------------------------ */
  var LIGHT_AURORA = {
    type: "particle",
    mouseRadius: 0.22, mouseStrength: 1.1, mouseSmoothing: 0.12, mouseVelocity: 0.15,
    decay: 0.96, distortBoost: 1.35, noiseBoost: 0, swirlBoost: 0.45,
    glowIntensity: 0, glowColors: ["#ffffff", "#ffffff", "#ffffff"],
    speed: 14, distortion: 20, swirl: 12, swirlIterations: 8,
    scale: 0.5, rotation: -5, proportion: 50, softness: 100, shapeScale: 10,
    offsetX: 0, offsetY: 65,
    colors: ["#8AA3D6", "#FFFFFF", "#FFFFFF"],
    lightX: 0.89, lightY: 0.46, lightCore: 0, lightHalo: 0, vignette: 0, lightFollow: 0,
    bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0, grain: 0
  };

  /* 官方深色 hero（www.deepseek.com/harness）参数，逐项取自缓存
     page-07f506a1408ad0e8.js 中的 k 配置（fluid 渲染） */
  var DARK_AURORA = {
    type: "fluid",
    mouseRadius: 0.09, mouseStrength: 1.8, mouseSmoothing: 0.1, mouseVelocity: 0.2,
    decay: 0.925, distortBoost: 2.2, noiseBoost: 0.3, swirlBoost: 0.8,
    glowIntensity: 0.13, glowColors: ["#fff7d1", "#538dca", "#2d448b"],
    speed: 28, distortion: 18, swirl: 20, swirlIterations: 12,
    scale: 1.77, rotation: 15, proportion: 60, softness: 80, shapeScale: 0,
    offsetX: -124, offsetY: -48,
    colors: ["#000000", "#1A3870", "#204a7e", "#eed8aa", "#000000"],
    lightX: 0.89, lightY: 0.46, lightCore: 0.14, lightHalo: 0.2, vignette: 0.38, lightFollow: 0.63,
    bloomThreshold: 0.61, bloomRange: 0.18, bloomStrength: 0.4, grain: 0.005
  };

  var LIGHT_CONSTELLATION = { lineColor: "rgba(60, 100, 160,", dotColor: "rgba(60, 100, 160,", lineOpacity: 0.1, dotOpacity: 0.2, round: true };
  var DARK_CONSTELLATION = { lineColor: "rgba(255, 255, 255,", dotColor: "rgba(255, 255, 255,", lineOpacity: 0.08, dotOpacity: 0.16, round: false };

  function currentAuroraConfig() { return state.dark ? DARK_AURORA : LIGHT_AURORA; }
  function currentConstellation() { return state.dark ? DARK_CONSTELLATION : LIGHT_CONSTELLATION; }

  state.dark = detectDark();

  shared.refs.detectDark = detectDark;
  shared.refs.currentAuroraConfig = currentAuroraConfig;
  shared.refs.currentConstellation = currentConstellation;
}


/* ===================== settings.js ===================== */
/* ===================================================================== *
 * src/settings.js — 背景特效设置（initSettings）
 *   档位/开关/高级参数 + 设置页「背景特效」面板（React）。
 *   本插件只管理背景引擎四项：极光背景 / 粒子鲸鱼 / 星座网格 /
 *   鼠标跟随交互 + 极光分辨率/帧率/跟手/光线高级参数
 *   （玻璃拟态 / Beam / Orbs 设置在 dsh-ui-beam-orbs 插件）。
 *   创建 shared.settings（loadSettings 结果，各模块经 shared.settings 只读）；
 *   跨模块回调一律走 shared.refs.*（星座唤醒、鲸鱼显隐）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ===================================================================== */
function initSettings(shared) {
  var ctx = shared.ctx;

  /* ===================================================================== *
   * 背景特效设置（设置页「背景特效」面板 + 运行时联动）
   *   档位预设 → 独立开关（自动转自定义）→ 高级参数
   *   全部即时生效、localStorage 持久化（dsh-bg-settings）
   *   默认档位：全特效（下载后即开即用，无需手动切换）
   * ===================================================================== */
  var SETTINGS_KEY = "dsh-bg-settings";
  var PRESETS = {
    // 全特效：极光分辨率拉满（滑杆上限 1.0x）——下载后默认即为此档
    full: { label: "全特效", aurora: true, whale: true, constellation: true, mouse: true, auroraScale: 1, fps: 60, followMs: 120, lightFollow: 1 },
    half: { label: "均衡", aurora: false, whale: true, constellation: true, mouse: true, auroraScale: 0.55, fps: 60, followMs: 20, lightFollow: 1 },
    eco:  { label: "节能", aurora: false, whale: false, constellation: false, mouse: false, auroraScale: 0.4, fps: 20, followMs: 20, lightFollow: 1 }
  };

  function loadSettings() {
    var d = { mode: "full" };
    var parsed = null;
    try {
      var raw = localStorage.getItem(SETTINGS_KEY);
      if (raw) parsed = JSON.parse(raw);
    } catch (e) {}
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.mode === "string") d.mode = parsed.mode;
    }
    if (PRESETS[d.mode]) {
      // 档位模式：数值全部跟随预设（预设调整后自动生效，无需清理旧缓存）
      var p = PRESETS[d.mode];
      for (var k in p) if (k !== "label") d[k] = p[k];
    } else {
      // 自定义模式：全特效为底，白名单叠加已存数值（防原型污染）
      d.mode = "custom";
      var base = PRESETS.full;
      for (var k2 in base) if (k2 !== "label") d[k2] = base[k2];
      if (parsed && typeof parsed === "object") {
        var allowed = { aurora:1, whale:1, constellation:1, mouse:1, auroraScale:1, fps:1, followMs:1, lightFollow:1 };
        for (var k3 in parsed) if (Object.prototype.hasOwnProperty.call(parsed, k3) && allowed[k3]) d[k3] = parsed[k3];
      }
      d.mode = "custom"; // 非法/过期 mode 值不得覆盖自定义档位
    }
    return d;
  }
  shared.settings = loadSettings();
  var bgSettings = shared.settings;

  function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(bgSettings)); } catch (e) { try { if (e && e.name === "QuotaExceededError") console.warn("[dsh-bg] localStorage quota exceeded", e); } catch(_){} } }
  function estimateGpu() {
    var s = bgSettings, score = 0;
    if (s.aurora) score += 52 * Math.min(1.2, (s.auroraScale || 0.75) / 0.75);
    if (s.whale) score += 20;
    if (s.constellation) score += 9;
    if (s.mouse) score += 1; // 光标交互物理（极光漫游笔刷始终在跑，成本几乎无差）
    score *= ((s.fps || 30) / 30);
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  function snapshotSettings() {
    return {
      mode: bgSettings.mode,
      aurora: !!bgSettings.aurora, whale: !!bgSettings.whale, constellation: !!bgSettings.constellation,
      mouse: !!bgSettings.mouse,
      auroraScale: Number(bgSettings.auroraScale) || 1, fps: Number(bgSettings.fps) || 30,
      followMs: bgSettings.followMs != null ? Number(bgSettings.followMs) : 20,
      lightFollow: bgSettings.lightFollow != null ? Number(bgSettings.lightFollow) : 1,
      gpu: estimateGpu(),
      canvasW: (shared.dom && shared.dom.auroraCanvas) ? shared.dom.auroraCanvas.width : 0,
      canvasH: (shared.dom && shared.dom.auroraCanvas) ? shared.dom.auroraCanvas.height : 0
    };
  }
  var settingsListeners = [];
  function notifySettings() { for (var i = 0; i < settingsListeners.length; i++) { try { settingsListeners[i](); } catch (e) {} } }
  function subscribeSettings(fn) {
    settingsListeners.push(fn);
    return function () { var i = settingsListeners.indexOf(fn); if (i >= 0) settingsListeners.splice(i, 1); };
  }
  function applyPreset(mode) {
    var p = PRESETS[mode]; if (!p) return;
    for (var k in p) if (k !== "label") bgSettings[k] = p[k];
    bgSettings.mode = mode;
    commitSettings();
  }
  function updateSetting(key, value) {
    bgSettings[key] = value;
    bgSettings.mode = "custom";
    commitSettings();
  }
  function resetSettings() { applyPreset("full"); commitSettings(); }
  function commitSettings() { saveSettings(); applyBgSettings(); notifySettings(); }


  /** 把每个子系统立即切换到当前设置 */
  function applyBgSettings() {
    try { if (shared.refs.updateWhaleDisplay) shared.refs.updateWhaleDisplay(); } catch (e) {}
    try { if (bgSettings.constellation && shared.refs.wakeConstellation) shared.refs.wakeConstellation(); } catch (e) {}
  }

  /* ---- 设置页「背景特效」面板 ---- */
  var SETTINGS_UI_CSS = [
    ".dsh-bg-settings{display:flex;flex-direction:column;gap:14px;max-width:560px;padding-bottom:28px;}",
    ".dsh-bg-card{border:1px solid rgba(128,128,128,.2);border-radius:12px;padding:14px 16px;background:rgba(128,128,128,.05);}",
    ".dsh-bg-sec-title{font-size:13px;font-weight:600;opacity:.9;margin-bottom:10px;letter-spacing:0.2px;}",
    ".dsh-bg-div{border-top:1px solid rgba(128,128,128,.12);margin:14px 0;}",
    /* 档位：一行三键分段控件 */
    ".dsh-bg-presets{display:flex;gap:6px;}",
    ".dsh-bg-preset{flex:1;cursor:pointer;border:1px solid rgba(128,128,128,.2);background:rgba(128,128,128,.04);color:inherit;border-radius:8px;padding:7px 6px;font-size:13px;font-weight:500;font-family:inherit;text-align:center;transition:all .15s ease;}",
    ".dsh-bg-preset:hover{background:rgba(128,128,128,.1);border-color:rgba(128,128,128,.35);}",
    ".dsh-bg-preset[data-active='true']{border-color:#4d8bf5;color:#6ea8ff;background:rgba(77,139,245,.14);font-weight:600;}",
    ".dsh-bg-preset-caption{font-size:11px;opacity:.65;margin-top:8px;line-height:1.5;}",
    /* GPU 仪表 */
    ".dsh-bg-meter-label{display:flex;justify-content:space-between;align-items:center;font-size:12px;opacity:.85;margin-bottom:6px;}",
    ".dsh-bg-meter{height:8px;border-radius:999px;background:rgba(128,128,128,.16);overflow:hidden;}",
    ".dsh-bg-meter>div{height:100%;border-radius:999px;transition:width .25s ease,background .25s ease;}",
    ".dsh-bg-meta{font-size:11px;opacity:.55;line-height:1.6;margin-top:8px;}",
    /* 开关行：细分隔线 + 紧凑内边距 */
    ".dsh-bg-row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 2px;}",
    ".dsh-bg-row+.dsh-bg-row{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-row-info{flex:1;min-width:0;}",
    ".dsh-bg-row-title{font-size:13px;font-weight:500;display:flex;align-items:center;gap:8px;}",
    ".dsh-bg-row-desc{font-size:11px;opacity:.6;margin-top:2px;line-height:1.4;}",
    ".dsh-bg-chip{font-size:10px;line-height:16px;padding:0 6px;border-radius:999px;border:1px solid rgba(128,128,128,.3);opacity:.85;white-space:nowrap;flex:none;}",
    ".dsh-bg-chip[data-level='high']{color:#ff9d6b;border-color:rgba(255,140,80,.4);}",
    ".dsh-bg-chip[data-level='mid']{color:#ffd166;border-color:rgba(255,200,90,.4);}",
    ".dsh-bg-chip[data-level='low']{color:#7ee2a8;border-color:rgba(110,220,160,.4);}",
    ".dsh-bg-switch{position:relative;width:36px;height:20px;flex:none;cursor:pointer;border-radius:999px;border:none;background:rgba(128,128,128,.3);transition:background .15s;padding:0;}",
    ".dsh-bg-switch[aria-checked='true']{background:#4d8bf5;}",
    ".dsh-bg-switch::after{content:'';position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:transform .15s ease;box-shadow:0 1px 2px rgba(0,0,0,.2);}",
    ".dsh-bg-switch[aria-checked='true']::after{transform:translateX(16px);}",
    /* 高级折叠面板 */
    ".dsh-bg-adv summary{cursor:pointer;font-size:13px;font-weight:600;opacity:.9;user-select:none;padding:2px 0;outline:none;display:flex;align-items:center;gap:6px;}",
    ".dsh-bg-adv summary::-webkit-details-marker{display:none;}",
    ".dsh-bg-adv summary::before{content:'▶';font-size:9px;display:inline-block;transition:transform .2s ease;opacity:.7;}",
    ".dsh-bg-adv[open] summary::before{transform:rotate(90deg);}",
    ".dsh-bg-adv[open] summary{margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid rgba(128,128,128,.12);}",
    ".dsh-bg-adv summary:hover{opacity:1;}",
    /* 高级区条目 */
    ".dsh-bg-slider-item,.dsh-bg-adv-row{padding:10px 2px;}",
    ".dsh-bg-slider-item+.dsh-bg-slider-item,.dsh-bg-slider-item+.dsh-bg-adv-row,.dsh-bg-adv-row+.dsh-bg-slider-item,.dsh-bg-adv-row+.dsh-bg-adv-row{border-top:1px solid rgba(128,128,128,.08);}",
    ".dsh-bg-item-title{font-size:13px;font-weight:500;}",
    ".dsh-bg-item-desc{font-size:11px;opacity:.6;line-height:1.45;margin-top:2px;}",
    ".dsh-bg-slider-head{display:flex;align-items:center;justify-content:space-between;gap:8px;}",
    ".dsh-bg-val-badge{font-size:11px;font-weight:600;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-variant-numeric:tabular-nums;color:#6ea8ff;background:rgba(77,139,245,.12);border:1px solid rgba(77,139,245,.25);border-radius:6px;padding:1px 7px;line-height:16px;flex:none;}",
    ".dsh-bg-range{display:block;width:100%;height:6px;border-radius:3px;background:rgba(128,128,128,.2);outline:none;margin:10px 0 4px;cursor:pointer;-webkit-appearance:none;appearance:none;transition:background .15s;}",
    ".dsh-bg-range:hover{background:rgba(128,128,128,.28);}",
    ".dsh-bg-range::-webkit-slider-thumb{-webkit-appearance:none;appearance:none;width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);transition:transform .12s ease;}",
    ".dsh-bg-range::-webkit-slider-thumb:hover{transform:scale(1.15);}",
    ".dsh-bg-range::-moz-range-thumb{width:16px;height:16px;border-radius:50%;background:#4d8bf5;cursor:pointer;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);}",
    ".dsh-bg-range-labels{display:flex;justify-content:space-between;font-size:10px;opacity:.45;user-select:none;margin-top:2px;}",
    ".dsh-bg-adv-row{display:flex;align-items:center;justify-content:space-between;gap:16px;}",
    ".dsh-bg-adv-info{flex:1;min-width:0;}",
    ".dsh-bg-select{background:rgba(128,128,128,.1);color:inherit;border:1px solid rgba(128,128,128,.28);border-radius:8px;padding:5px 10px;font-size:12px;font-family:inherit;flex:none;cursor:pointer;outline:none;transition:border-color .15s,background .15s;}",
    ".dsh-bg-select:hover{background:rgba(128,128,128,.16);border-color:rgba(128,128,128,.4);}",
    ".dsh-bg-select:focus{border-color:#4d8bf5;}",
    ".dsh-bg-select option{background:#1c1d22;color:#e5e5e5;}",
    /* 底部 */
    ".dsh-bg-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding-top:4px;}",
    ".dsh-bg-reset{cursor:pointer;border:1px solid rgba(128,128,128,.25);background:transparent;color:inherit;border-radius:8px;padding:6px 14px;font-size:12px;font-family:inherit;transition:background .15s,border-color .15s;}",
    ".dsh-bg-reset:hover{background:rgba(128,128,128,.1);border-color:rgba(128,128,128,.4);}",
    ".dsh-bg-note{font-size:11px;opacity:.55;line-height:1.5;}",
    "@media (prefers-reduced-motion: reduce){.dsh-bg-meter>div{transition:none;}}"
  ].join("\n");

  function injectSettingsCss() {
    try {
      var tag = document.getElementById("dsh-bg-settings-css");
      if (!tag) {
        tag = document.createElement("style");
        tag.id = "dsh-bg-settings-css";
        document.head.appendChild(tag);
      }
      tag.textContent = SETTINGS_UI_CSS;
    } catch (e) {}
  }

  function BgSettingsSection() {
    var h = react.createElement;
    var snapState = react.useState(function () { return snapshotSettings(); });
    var snap = snapState[0];
    var setSnap = snapState[1];
    react.useEffect(function () {
      return subscribeSettings(function () { setSnap(snapshotSettings()); });
    }, []);
    var gpu = snap.gpu;
    var meterColor = gpu < 35 ? "#4ade80" : (gpu < 60 ? "#facc15" : "#fb7185");
    var presetIds = ["full", "half", "eco"];
    var presetNames = { full: "全特效", half: "均衡", eco: "节能" };
    var presetDescs = {
      full: "所有背景特效拉满：极光 1.0x、60fps、跟手 120ms",
      half: "保留粒子鲸鱼/星座/鼠标跟随，关闭高开销极光流体（60fps）",
      eco: "仅保留静态深色背景与最低开销（20fps）"
    };
    var modeName = presetNames[snap.mode] || "自定义";
    var modeCaption = presetDescs[snap.mode] || "手动调整的特效组合，可随时切回预设档位";
    var rows = [
      { key: "aurora", title: "极光背景", desc: "WebGL2 流体渐变，本插件最大 GPU 开销", level: "high" },
      { key: "whale", title: "粒子鲸鱼", desc: "全屏 WebGL2 点阵粒子，光线跟随鼠标", level: "mid" },
      { key: "constellation", title: "星座网格", desc: "2D 网格，鼠标斥力弹簧物理", level: "low" },
      { key: "mouse", title: "鼠标跟随交互", desc: "极光/鲸鱼/星座跟随光标互动；关闭后极光改为自主缓慢漂移，画面保持流动", level: "low" }
    ];
    var levelText = { high: "高", mid: "中", low: "低" };
    function presetButtons() {
      return presetIds.map(function (id) {
        return h("button", {
          key: id,
          type: "button",
          className: "dsh-bg-preset",
          "data-active": snap.mode === id,
          onClick: function () { applyPreset(id); }
        }, presetNames[id]);
      });
    }
    function switchBtn(key) {
      return h("button", {
        type: "button",
        className: "dsh-bg-switch",
        role: "switch",
        "aria-checked": snap[key] ? "true" : "false",
        "aria-label": "开关",
        onClick: function () { updateSetting(key, !snap[key]); }
      });
    }
    function rowEl(row) {
      return h("div", { key: row.key, className: "dsh-bg-row" },
        h("div", { className: "dsh-bg-row-info" },
          h("div", { className: "dsh-bg-row-title" }, row.title,
            h("span", { className: "dsh-bg-chip", "data-level": row.level }, levelText[row.level] + "负载")),
          h("div", { className: "dsh-bg-row-desc" }, row.desc)),
        switchBtn(row.key));
    }
    function sliderItem(title, desc, valText, min, max, step, val, minLabel, maxLabel, onValChange) {
      return h("div", { className: "dsh-bg-slider-item" },
        h("div", { className: "dsh-bg-slider-head" },
          h("span", { className: "dsh-bg-item-title" }, title),
          h("span", { className: "dsh-bg-val-badge" }, valText)),
        desc ? h("div", { className: "dsh-bg-item-desc" }, desc) : null,
        h("input", {
          type: "range",
          className: "dsh-bg-range",
          min: min,
          max: max,
          step: step,
          value: val,
          onChange: function (e) { onValChange(e.target.value); }
        }),
        (minLabel || maxLabel) ? h("div", { className: "dsh-bg-range-labels" },
          h("span", null, minLabel || ""),
          h("span", null, maxLabel || "")) : null
      );
    }
    function selectItem(title, desc, value, options, onValChange) {
      return h("div", { className: "dsh-bg-adv-row" },
        h("div", { className: "dsh-bg-adv-info" },
          h("div", { className: "dsh-bg-item-title" }, title),
          desc ? h("div", { className: "dsh-bg-item-desc" }, desc) : null),
        h("select", {
          className: "dsh-bg-select",
          value: value,
          onChange: function (e) { onValChange(e.target.value); }
        }, options.map(function (opt) {
          return h("option", { key: opt.value, value: opt.value }, opt.label);
        }))
      );
    }
    return h("div", { className: "dsh-bg-settings" },
      h("div", { className: "dsh-bg-card" },
        h("div", { className: "dsh-bg-sec-title" }, "性能档位"),
        h("div", { className: "dsh-bg-presets" }, presetButtons()),
        h("div", { className: "dsh-bg-preset-caption" }, modeName + " · " + modeCaption),
        h("div", { className: "dsh-bg-div" }),
        h("div", { className: "dsh-bg-meter-label" },
          h("span", null, "估算 GPU 负载"),
          h("span", { style: { color: meterColor, fontWeight: 600 } }, gpu + "%")),
        h("div", { className: "dsh-bg-meter" }, h("div", { style: { width: gpu + "%", background: meterColor } })),
        h("div", { className: "dsh-bg-meta" },
          "按 分辨率 × 帧率 估算（背景引擎四项），仅供参考；切换即时生效并自动保存。" +
          (snap.canvasW ? " 当前极光画布 " + snap.canvasW + "×" + snap.canvasH + "（×" + snap.auroraScale.toFixed(2) + "）" : "")),
        h("div", { className: "dsh-bg-div" }),
        h("div", { className: "dsh-bg-sec-title" }, "特效开关"),
        rows.map(rowEl)),
      h("details", { className: "dsh-bg-adv dsh-bg-card" },
        h("summary", null, "渲染质量（高级）"),
        sliderItem("极光分辨率", "降低画布内部分辨率可显著减轻 GPU 渲染与显存开销", "×" + snap.auroraScale.toFixed(2), 0.4, 1, 0.05, snap.auroraScale, "0.40× (节能)", "1.00× (高清)", function (v) { updateSetting("auroraScale", parseFloat(v)); }),
        selectItem("动画帧率上限", "鼠标交互期间自动提升至 60fps 保证操作跟手，停止 200ms 后回落", snap.fps, [
          { value: 20, label: "20 fps（最省）" },
          { value: 24, label: "24 fps（均衡）" },
          { value: 30, label: "30 fps（流畅）" },
          { value: 60, label: "60 fps（极致流畅）" }
        ], function (v) { updateSetting("fps", parseInt(v, 10)); }),
        sliderItem("跟手灵敏度", "鼠标跟随平滑时间常数（越小越贴手响应越快，越大越绵柔滞后）", snap.followMs + " ms", 5, 120, 5, snap.followMs, "5 ms (极速贴手)", "120 ms (绵柔)", function (v) { updateSetting("followMs", parseInt(v, 10)); }),
        sliderItem("光线跟随强度", "粒子鲸鱼与高光聚焦点随光标移动的响应幅度", Math.round(snap.lightFollow * 100) + "%", 0, 100, 5, Math.round(snap.lightFollow * 100), "0% (固定不动)", "100% (完全跟随)", function (v) { updateSetting("lightFollow", parseInt(v, 10) / 100); })),
      h("div", { className: "dsh-bg-foot" },
        h("button", { type: "button", className: "dsh-bg-reset", onClick: function () { resetSettings(); } }, "恢复默认"),
        h("span", { className: "dsh-bg-note" }, "v1.13.1 · 即时生效并自动保存")));
  }

  /** 注册设置页条目（需要 slots 服务；缺 ctx/slots 时静默跳过） */
  function setupSettingsUi(ctx) {
    if (!react) return;
    try {
      var slots = ctx && ctx.get ? ctx.get("slots") : null;
      if (!slots) return;
      injectSettingsCss();
      slots.inject("settings.section", function () {
        return slots.register({
          name: "settings.section",
          id: "dsh-bg-effects",
          order: 5,
          label: function () { return "背景特效"; }
        }, BgSettingsSection);
      });
    } catch (e) {}
  }

  shared.refs.setupSettingsUi = setupSettingsUi;
}


/* ===================== dom.js ===================== */
/* ------------------------------------------------------------------ *
 * src/dom.js — DOM 骨架（initDom）
 *   创建背景容器 / 极光画布 / 星座画布 / 鲸鱼层 / 诊断对象，填入 shared.dom；
 *   定义 applyThemeClass（按主题切换：深色全特效；浅色恢复官方原版）。
 *   主题标记（body[data-ds-dark-theme]）由 DSH 官方 ThemePresenter 管理，
 *   本插件不再回写，避免与官方主题系统互相覆盖。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initDom(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;

/* ------------------------------------------------------------------ *
   * DOM 骨架
   * ------------------------------------------------------------------ */
  shared.dom.container = document.createElement("div");
  shared.dom.container.id = "dsh-ds-bg";
  shared.dom.container.dataset.version = "1.13.1"; // 部署版本标记：由 build.mjs 从 package.json 注入，页面可查 document.getElementById('dsh-ds-bg')?.dataset.version
  // 关键样式内联兜底：背景层 fixed + 底层；浅色为官方浅色渐变（由 CSS 隐藏），
  // 深色为主题底色（.dsh-ds-dark / applyThemeClass 切换）
  // GPU 优化：不再常驻 will-change:opacity,filter——它会在入场动画结束后仍强制
  // 全屏容器保持独立合成层；合成器对运行中的动画本就会自动提升，观感不变
  shared.dom.container.style.cssText = "position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;" +
    "background:linear-gradient(180deg,#9cc1e7 0%,rgba(250,250,250,0) 100%),#f9f8f8;" +
    "animation:dsh-ds-enter 1.8s ease-out backwards;";
  var MASK = "linear-gradient(#000000fc 0%,#000000e8 8.98%,transparent 100%)";
  shared.dom.auroraCanvas = document.createElement("canvas");
  shared.dom.auroraCanvas.id = "dsh-ds-aurora";
  shared.dom.auroraCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;" +
    "mask:" + MASK + ";-webkit-mask:" + MASK + ";";
  shared.dom.constellationCanvas = document.createElement("canvas");
  shared.dom.constellationCanvas.id = "dsh-ds-constellation";
  shared.dom.constellationCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;background:transparent;" +
    "mask:" + MASK + ";-webkit-mask:" + MASK + ";";
  shared.dom.container.appendChild(shared.dom.auroraCanvas);
  // 鲸鱼层：仅深色主题显示（官方深色 hero 元素），浅色保持官方原版
  shared.dom.whaleLayer = document.createElement("div");
  shared.dom.whaleLayer.className = "dsh-ds-whale";
  shared.dom.whaleLayer.setAttribute("aria-hidden", "true");
  shared.dom.whaleLayer.style.cssText = "position:absolute;inset:0;display:none;align-items:center;justify-content:center;" +
    "pointer-events:none;mix-blend-mode:screen;z-index:2;";
  shared.dom.whaleCanvas = document.createElement("canvas");
  shared.dom.whaleCanvas.className = "dsh-ds-whale-canvas";
  shared.dom.whaleCanvas.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;display:block;";
  shared.dom.whaleLayer.appendChild(shared.dom.whaleCanvas);
  shared.dom.container.appendChild(shared.dom.whaleLayer);
  shared.dom.container.appendChild(shared.dom.constellationCanvas);

  /* 诊断信息（?dshtest=1 时输出到页面面板） */
  shared.dom.diag = { theme: "?", bodyBg: "?", htmlBg: "?", containerPos: "?", containerZ: "?", containerBg: "?", frameFound: false, frameBg: "?", auroraGL: false, auroraProgs: "", whaleGL: false, whaleProgs: "", constellation: false, canvasW: 0, canvasH: 0 };

  function applyThemeClass() {
    var dark = state.dark;
    shared.dom.container.classList.toggle("dsh-ds-dark", dark);
    shared.dom.container.style.setProperty("background", dark ? "#0a0a0a" :
      "linear-gradient(180deg,#9cc1e7 0%,rgba(250,250,250,0) 100%),#f9f8f8", "important");
    if (shared.refs.updateWhaleDisplay) shared.refs.updateWhaleDisplay();
    try { document.body.classList.toggle("dsh-bg-no-glass", !bgSettings.glass); } catch (e) {}
    if (document.body) {
      // 深色主题：body 透明让背景透出；浅色主题：移除覆盖，恢复官方原版
      if (dark) document.body.style.setProperty("background", "transparent", "important");
      else document.body.style.removeProperty("background");
    }
  }

  shared.refs.applyThemeClass = applyThemeClass;
}


/* ===================== aurora.js ===================== */
/* ------------------------------------------------------------------ *
 * src/aurora.js — 极光引擎（initAurora，WebGL2 流体/粒子）
 *   shader 源码常量（VERT/FLOWMAP_FS/PARTICLE_FS/FLUID_FS）在 src/aurora-shaders.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initAurora(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /* ------------------------------------------------------------------ *
   * 极光引擎（WebGL2）
   * ------------------------------------------------------------------ */
  function startAurora() {
    var canvas = shared.dom.auroraCanvas;
    // GPU 优化：单张全屏三角形/条带没有任何几何边缘，MSAA 对片元着色结果零影响，
    // antialias:false 直接省掉 MSAA tile 显存与每帧 resolve 带宽（鲸鱼层同款处理）。
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: false, powerPreference: "low-power", antialias: false });
    if (!gl) { canvas.dataset.state = "no-webgl2"; return; }
    diag.auroraGL = true;
    // 上下文丢失防护：GPU 内存回收后可重建
    try {
      canvas.addEventListener("webglcontextlost", function(e){ try{ e.preventDefault(); }catch(_){} running=false; if(raf){ try{ cancelAnimationFrame(raf);}catch(_){} raf=0; } canvas.dataset.state="context-lost"; });
      canvas.addEventListener("webglcontextrestored", function(){ try{ canvas.dataset.state="restoring"; startAurora(); }catch(_){} });
    } catch(_){}

    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log = ""; try{ log = gl.getShaderInfoLog(s) || "compile failed"; }catch(_){}
        try{ console.error("[dsh-bg] aurora shader compile failed:", log.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state = "shader-compile-fail:" + log.slice(0,200); diag.auroraProgs = "compile-fail"; }catch(_){}
        try{ gl.deleteShader(s); }catch(_){}
        return null;
      }
      return s;
    }
    function link(vs, fs) {
      var p = gl.createProgram();
      gl.attachShader(p, vs);
      gl.attachShader(p, fs);
      gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        var log2=""; try{ log2 = gl.getProgramInfoLog(p) || "link failed"; }catch(_){}
        try{ console.error("[dsh-bg] aurora program link failed:", log2.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state = "shader-link-fail:" + log2.slice(0,200); diag.auroraProgs = "link-fail"; }catch(_){}
        try{ gl.deleteProgram(p); }catch(_){}
        return null;
      }
      return p;
    }
    var vs = compile(gl.VERTEX_SHADER, VERT);
    var progFlow = link(vs, compile(gl.FRAGMENT_SHADER, FLOWMAP_FS));
    var progPart = link(vs, compile(gl.FRAGMENT_SHADER, PARTICLE_FS));
    var progFluid = link(vs, compile(gl.FRAGMENT_SHADER, FLUID_FS));
    diag.auroraProgs = [progFlow ? "flow" : "", progPart ? "particle" : "", progFluid ? "fluid" : ""].filter(Boolean).join(",");
    if (!progFlow || !progPart || !progFluid) return;

    var uFlow = {
      prev: gl.getUniformLocation(progFlow, "u_prev"),
      mouse: gl.getUniformLocation(progFlow, "u_mouse"),
      velocity: gl.getUniformLocation(progFlow, "u_velocity"),
      brushRadius: gl.getUniformLocation(progFlow, "u_brushRadius"),
      brushStrength: gl.getUniformLocation(progFlow, "u_brushStrength"),
      decay: gl.getUniformLocation(progFlow, "u_decay")
    };
    var uPart = {
      time: gl.getUniformLocation(progPart, "u_time"),
      pixelRatio: gl.getUniformLocation(progPart, "u_pixelRatio"),
      resolution: gl.getUniformLocation(progPart, "u_resolution"),
      scale: gl.getUniformLocation(progPart, "u_scale"),
      rotation: gl.getUniformLocation(progPart, "u_rotation"),
      offset: gl.getUniformLocation(progPart, "u_offset"),
      color1: gl.getUniformLocation(progPart, "u_color1"),
      color2: gl.getUniformLocation(progPart, "u_color2"),
      color3: gl.getUniformLocation(progPart, "u_color3"),
      color4: gl.getUniformLocation(progPart, "u_color4"),
      color5: gl.getUniformLocation(progPart, "u_color5"),
      colorCount: gl.getUniformLocation(progPart, "u_colorCount"),
      proportion: gl.getUniformLocation(progPart, "u_proportion"),
      softness: gl.getUniformLocation(progPart, "u_softness"),
      shape: gl.getUniformLocation(progPart, "u_shape"),
      shapeScale: gl.getUniformLocation(progPart, "u_shapeScale"),
      distortion: gl.getUniformLocation(progPart, "u_distortion"),
      swirl: gl.getUniformLocation(progPart, "u_swirl"),
      swirlIterations: gl.getUniformLocation(progPart, "u_swirlIterations"),
      flowmap: gl.getUniformLocation(progPart, "u_flowmap"),
      distortBoost: gl.getUniformLocation(progPart, "u_distortBoost"),
      noiseBoost: gl.getUniformLocation(progPart, "u_noiseBoost"),
      swirlBoost: gl.getUniformLocation(progPart, "u_swirlBoost"),
      glowIntensity: gl.getUniformLocation(progPart, "u_glowIntensity"),
      glowColor1: gl.getUniformLocation(progPart, "u_glowColor1"),
      glowColor2: gl.getUniformLocation(progPart, "u_glowColor2"),
      glowColor3: gl.getUniformLocation(progPart, "u_glowColor3")
    };
    var uFluid = {
      time: gl.getUniformLocation(progFluid, "u_time"),
      resolution: gl.getUniformLocation(progFluid, "u_resolution"),
      scale: gl.getUniformLocation(progFluid, "u_scale"),
      offset: gl.getUniformLocation(progFluid, "u_offset"),
      grain: gl.getUniformLocation(progFluid, "u_grain"),
      speed: gl.getUniformLocation(progFluid, "u_speed"),
      flowmap: gl.getUniformLocation(progFluid, "u_flowmap"),
      distortBoost: gl.getUniformLocation(progFluid, "u_distortBoost"),
      swirlBoost: gl.getUniformLocation(progFluid, "u_swirlBoost"),
      glowIntensity: gl.getUniformLocation(progFluid, "u_glowIntensity"),
      glowColor1: gl.getUniformLocation(progFluid, "u_glowColor1"),
      glowColor2: gl.getUniformLocation(progFluid, "u_glowColor2"),
      glowColor3: gl.getUniformLocation(progFluid, "u_glowColor3"),
      c1: gl.getUniformLocation(progFluid, "u_c1"),
      c2: gl.getUniformLocation(progFluid, "u_c2"),
      c3: gl.getUniformLocation(progFluid, "u_c3"),
      c4: gl.getUniformLocation(progFluid, "u_c4"),
      c5: gl.getUniformLocation(progFluid, "u_c5"),
      lightPos: gl.getUniformLocation(progFluid, "u_lightPos"),
      lightCore: gl.getUniformLocation(progFluid, "u_lightCore"),
      lightHalo: gl.getUniformLocation(progFluid, "u_lightHalo"),
      vignette: gl.getUniformLocation(progFluid, "u_vignette"),
      bloomThreshold: gl.getUniformLocation(progFluid, "u_bloomThreshold"),
      bloomRange: gl.getUniformLocation(progFluid, "u_bloomRange"),
      bloomStrength: gl.getUniformLocation(progFluid, "u_bloomStrength")
    };

    var buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    var _locFlow = gl.getAttribLocation(progFlow, "a_position");
    var _locPart = gl.getAttribLocation(progPart, "a_position");
    var _locFluid = gl.getAttribLocation(progFluid, "a_position");
    function bindAttrib(prog) {
      var loc = prog === progFlow ? _locFlow : (prog === progPart ? _locPart : (prog === progFluid ? _locFluid : gl.getAttribLocation(prog, "a_position")));
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    }
    function makeTarget(w, h, data) {
      var tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      if (data) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      var fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { fbo: fbo, tex: tex };
    }

    var W = 0, H = 0, wQ = 0, hQ = 0;
    var flip = false;
    // GPU 优化：极光是柔和渐变背景，内部分辨率按 DPR 上限 1.5 再乘 0.75 渲染，
    // 由 CSS 放大到全屏。像素量约为原 1.5x 的 1/4（1x 屏幕）~ 56%（retina），
    // 对流动渐变背景肉眼几乎无差，fragment 负载（本插件最大 GPU 开销）大幅下降。
    var AURORA_SCALE = 0.75;
    // 分辨率由设置面板的「极光分辨率」滑杆实时控制（0.4–1.0）
    function auroraScale() { return Math.min(window.devicePixelRatio || 1, 1.5) * (bgSettings.auroraScale || AURORA_SCALE); }
    var k = auroraScale();
    function resizeAll() {
      // 释放旧渲染目标（纹理+FBO），避免窗口/DPR 变化时 GPU 内存堆积
      if (targetA) { try { gl.deleteTexture(targetA.tex); gl.deleteFramebuffer(targetA.fbo); } catch (e) {} }
      if (targetB) { try { gl.deleteTexture(targetB.tex); gl.deleteFramebuffer(targetB.fbo); } catch (e) {} }
      k = auroraScale(); // DPR 变化时保持 resize 判定与渲染一致，避免每帧重建纹理
      W = Math.round(canvas.clientWidth * k);
      H = Math.round(canvas.clientHeight * k);
      canvas.width = W; canvas.height = H;
      wQ = Math.round(W / 4); hQ = Math.round(H / 4);
      var init = new Uint8Array(wQ * hQ * 4);
      for (var i = 0; i < wQ * hQ; i++) { init[4 * i] = 0; init[4 * i + 1] = 128; init[4 * i + 2] = 128; init[4 * i + 3] = 255; }
      targetA = makeTarget(wQ, hQ, init);
      targetB = makeTarget(wQ, hQ, init);
    }
    var targetA = null, targetB = null;
    resizeAll();

    var mouse = { x: 0.5, y: 0.5, smoothX: 0.5, smoothY: 0.5, vx: 0, vy: 0, svx: 0, svy: 0, rawVX: 0, rawVY: 0, lastT: 0, lastMove: 0 };
    // 鼠标笔刷/光线跟随：由设置面板「鼠标跟随交互」开关实时控制（每帧判定）
    function auroraMouseEnabled() { return !media.reducedMotion && !media.coarse && !media.isWindows && bgSettings.mouse; }
    function onMove(e) {
      // 画布为 position:fixed inset:0 铺满视口，直接用视口尺寸换算，
      // 避免 mousemove 高频事件里 getBoundingClientRect() 的强制布局
      var w = window.innerWidth || canvas.clientWidth || 1;
      var h = window.innerHeight || canvas.clientHeight || 1;
      var nx = e.clientX / w;
      var ny = 1 - e.clientY / h;
      var t = performance.now();
      var dt = Math.max(1, t - (mouse.lastT || t));
      // 用事件时间戳求真实速度（归一化坐标/秒），驱动流场拖尾方向；限幅防异常事件
      var vx = (nx - mouse.x) / (dt / 1000);
      var vy = (ny - mouse.y) / (dt / 1000);
      var sp = Math.sqrt(vx * vx + vy * vy);
      if (sp > 6) { vx = vx / sp * 6; vy = vy / sp * 6; }
      mouse.rawVX = vx; mouse.rawVY = vy;
      mouse.x = nx; mouse.y = ny;
      mouse.lastT = t; mouse.lastMove = t;
    }
    // 监听常驻（一个 passive listener 成本可忽略），是否生效由 auroraMouseEnabled 逐帧决定
    window.addEventListener("mousemove", onMove, { passive: true });

    var start = performance.now();
    var raf = 0;
    var running = true;
    // flowmap 与渲染解耦为两个独立节奏：交互活跃期均 60Hz，静止回落低频
    var lastFlow = 0, lastRender = 0;
    var latestTex = null;
    var auroraBlanked = false;

    var _hexCache = {};
    function hex2rgb(hex) {
      if (_hexCache[hex]) return _hexCache[hex];
      var h = hex.replace("#", "");
      var rgb = [parseInt(h.slice(0, 2), 16) / 255, parseInt(h.slice(2, 4), 16) / 255, parseInt(h.slice(4, 6), 16) / 255];
      _hexCache[hex] = rgb;
      return rgb;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (!running) return;
      if (!bgSettings.aurora) {
        // 关闭：清空画布一次（透明）后跳过渲染，rAF 空转成本可忽略
        if (!auroraBlanked) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); auroraBlanked = true; }
        return;
      }
      var cfg = shared.refs.currentAuroraConfig();

      var kk = auroraScale();
      var w = Math.round(canvas.clientWidth * kk);
      var h = Math.round(canvas.clientHeight * kk);
      if (w !== W || h !== H) resizeAll();

      var useM = auroraMouseEnabled();
      // 交互活跃期（最近 200ms 内有鼠标移动）：flowmap 与渲染同步提到 60fps，
      // 笔刷轨迹/光线跟手无感；静止后自动回落设置帧率，不白烧 GPU
      var active = useM && (now - (mouse.lastMove || 0) < 200);
      var flowHz = active ? 60 : 30;
      var renderHz = active ? Math.max(60, bgSettings.fps || 30) : (bgSettings.fps || 30);

      // 漫游笔刷目标（鼠标跟随关闭时）：Lissajous 轨迹 + 解析速度
      var driftX = 0.5, driftY = 0.5, driftVX = 0, driftVY = 0;
      if (!useM) {
        var driftT = (now - start) * 0.001;
        var a1 = driftT * 0.09, b1 = driftT * 0.13;
        driftX = 0.5 + 0.38 * Math.sin(a1);
        driftY = 0.5 + 0.3 * Math.cos(b1);
        var e1 = 0.1;
        driftVX = (0.38 * (Math.sin(a1 + e1) - Math.sin(a1))) / e1;
        driftVY = (0.3 * (Math.cos(b1 + e1) - Math.cos(b1))) / e1;
      }

      // ---- flowmap 更新（独立节奏：交互期 60Hz，静止 30Hz；与渲染解耦保证笔刷实时性） ----
      if (now - lastFlow >= 1000 / flowHz) {
        var fdt = Math.min(0.25, (now - lastFlow) / 1000);
        lastFlow = now - (now - lastFlow) % (1000 / flowHz);
        // 帧率无关临界阻尼平滑：时间常数由「跟手灵敏度」控制（默认 20ms）
        // —— 越小越贴手、滤掉事件抖动，越大越绵柔
        var followTau = (bgSettings.followMs != null ? bgSettings.followMs : 20) / 1000;
        var kp = 1 - Math.exp(-fdt / followTau);
        mouse.smoothX += ((useM ? mouse.x : driftX) - mouse.smoothX) * kp;
        mouse.smoothY += ((useM ? mouse.y : driftY) - mouse.smoothY) * kp;
        // 速度平滑：时间常数为跟手灵敏度的 4 倍（默认 80ms），拖尾方向稳定不抖
        var kv = 1 - Math.exp(-fdt / (followTau * 4));
        mouse.svx += (mouse.rawVX - mouse.svx) * kv;
        mouse.svy += (mouse.rawVY - mouse.svy) * kv;

        var brushX = mouse.smoothX, brushY = mouse.smoothY;
        var brushVX = useM ? mouse.svx : driftVX;
        var brushVY = useM ? mouse.svy : driftVY;
        var brushStrength = useM ? cfg.mouseStrength : cfg.mouseStrength * 0.28;

        // --- flowmap pass（低分辨率流场，双缓冲乒乓；鼠标或漫游笔刷持续喂入） ---
        var src = flip ? targetA : targetB;
        var dst = flip ? targetB : targetA;
        flip = !flip;
        latestTex = dst.tex;
        gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
        gl.viewport(0, 0, wQ, hQ);
        gl.useProgram(progFlow);
        bindAttrib(progFlow);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, src.tex);
        gl.uniform1i(uFlow.prev, 0);
        gl.uniform2f(uFlow.mouse, brushX, brushY);
        gl.uniform2f(uFlow.velocity, brushVX, brushVY);
        gl.uniform1f(uFlow.brushRadius, cfg.mouseRadius);
        gl.uniform1f(uFlow.brushStrength, brushStrength);
        // 衰减按实际帧间隔归一化（基准 30fps）：任何更新频率下拖尾淡出速度一致
        gl.uniform1f(uFlow.decay, Math.pow(cfg.decay, fdt * 30));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, W, H);
      }

      // ---- 渲染（帧率跟随设置；交互活跃期提到 60fps） ----
      if (now - lastRender < 1000 / renderHz) return;
      lastRender = now - (now - lastRender) % (1000 / renderHz);
      auroraBlanked = false;

      // --- 渲染 ---
      var t = (performance.now() - start) * 0.001 * (cfg.speed / 100);
      if (cfg.type === "fluid") {
        gl.useProgram(progFluid);
        bindAttrib(progFluid);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, latestTex);
        gl.uniform1i(uFluid.flowmap, 0);
        gl.uniform1f(uFluid.time, t);
        gl.uniform2f(uFluid.resolution, W, H);
        gl.uniform1f(uFluid.scale, cfg.scale);
        gl.uniform2f(uFluid.offset, cfg.offsetX / 100, cfg.offsetY / 100);
        gl.uniform1f(uFluid.grain, cfg.grain);
        gl.uniform1f(uFluid.distortBoost, cfg.distortBoost);
        gl.uniform1f(uFluid.swirlBoost, cfg.swirlBoost);
        var lx = cfg.lightX != null ? cfg.lightX : 0.89;
        // 光线跟随：官方 lightFollow × 设置面板强度，关闭鼠标跟随时完全静止（用 useM 守卫而非 0.85 衰减）
        var lf = cfg.lightFollow != null ? cfg.lightFollow * (bgSettings.lightFollow != null ? bgSettings.lightFollow : 1) * (useM ? 1 : 0) : 0;
        gl.uniform2f(uFluid.lightPos, lx + (mouse.smoothX - lx) * lf, cfg.lightY != null ? cfg.lightY : 0.46);
        gl.uniform1f(uFluid.lightCore, media.coarse ? 0 : (cfg.lightCore != null ? cfg.lightCore : 0.14));
        gl.uniform1f(uFluid.lightHalo, media.coarse ? 0 : (cfg.lightHalo != null ? cfg.lightHalo : 0.2));
        gl.uniform1f(uFluid.vignette, cfg.vignette != null ? cfg.vignette : 0.38);
        gl.uniform1f(uFluid.bloomThreshold, cfg.bloomThreshold != null ? cfg.bloomThreshold : 0.61);
        gl.uniform1f(uFluid.bloomRange, cfg.bloomRange != null ? cfg.bloomRange : 0.18);
        gl.uniform1f(uFluid.bloomStrength, cfg.bloomStrength != null ? cfg.bloomStrength : 0.4);
        gl.uniform1f(uFluid.glowIntensity, cfg.glowIntensity);
        var gc1 = hex2rgb(cfg.glowColors[0] || "#ffffff");
        var gc2 = hex2rgb(cfg.glowColors[1] || cfg.glowColors[0] || "#ffffff");
        var gc3 = hex2rgb(cfg.glowColors[2] || cfg.glowColors[0] || "#ffffff");
        gl.uniform3f(uFluid.glowColor1, gc1[0], gc1[1], gc1[2]);
        gl.uniform3f(uFluid.glowColor2, gc2[0], gc2[1], gc2[2]);
        gl.uniform3f(uFluid.glowColor3, gc3[0], gc3[1], gc3[2]);
        var cs = cfg.colors || [];
        for (var ci = 0; ci < 5; ci++) {
          var c = hex2rgb(cs[ci] || cs[cs.length - 1] || "#000000");
          gl.uniform3f([uFluid.c1, uFluid.c2, uFluid.c3, uFluid.c4, uFluid.c5][ci], c[0], c[1], c[2]);
        }
      } else {
        gl.useProgram(progPart);
        bindAttrib(progPart);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, latestTex);
        gl.uniform1i(uPart.flowmap, 0);
        gl.uniform1f(uPart.time, t);
        gl.uniform1f(uPart.pixelRatio, window.devicePixelRatio || 1);
        gl.uniform2f(uPart.resolution, W, H);
        gl.uniform1f(uPart.scale, cfg.scale);
        gl.uniform1f(uPart.rotation, cfg.rotation / 90);
        gl.uniform2f(uPart.offset, cfg.offsetX / 100, cfg.offsetY / 100);
        var cols = cfg.colors || ["#2E58A4", "#D2E2EE", "#FFFFFF"];
        for (var pi = 0; pi < 5; pi++) {
          var pc = hex2rgb(cols[pi] || cols[cols.length - 1] || "#000000");
          gl.uniform4f([uPart.color1, uPart.color2, uPart.color3, uPart.color4, uPart.color5][pi], pc[0], pc[1], pc[2], 1);
        }
        gl.uniform1f(uPart.colorCount, cols.length);
        gl.uniform1f(uPart.proportion, cfg.proportion / 100);
        gl.uniform1f(uPart.softness, cfg.softness / 100);
        gl.uniform1f(uPart.shape, 0);
        gl.uniform1f(uPart.shapeScale, cfg.shapeScale / 100);
        gl.uniform1f(uPart.distortion, cfg.distortion / 100);
        gl.uniform1f(uPart.swirl, cfg.swirl / 50);
        gl.uniform1f(uPart.swirlIterations, cfg.swirlIterations);
        gl.uniform1f(uPart.distortBoost, cfg.distortBoost);
        gl.uniform1f(uPart.noiseBoost, cfg.noiseBoost);
        gl.uniform1f(uPart.swirlBoost, cfg.swirlBoost);
        gl.uniform1f(uPart.glowIntensity, cfg.glowIntensity);
        var pc1 = hex2rgb(cfg.glowColors[0] || "#ffffff");
        var pc2 = hex2rgb(cfg.glowColors[1] || cfg.glowColors[0] || "#ffffff");
        var pc3 = hex2rgb(cfg.glowColors[2] || cfg.glowColors[0] || "#ffffff");
        gl.uniform3f(uPart.glowColor1, pc1[0], pc1[1], pc1[2]);
        gl.uniform3f(uPart.glowColor2, pc2[0], pc2[1], pc2[2]);
        gl.uniform3f(uPart.glowColor3, pc3[0], pc3[1], pc3[2]);
      }
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (media.reducedMotion) {
      // 单帧静态（原代码误用未声明的 last，严格模式下抛 ReferenceError）
      lastFlow = 0;
      lastRender = 0;
      running = true;
      frame(performance.now());
      cancelAnimationFrame(raf);
      raf = 0;
      running = false;
    } else {
      raf = requestAnimationFrame(frame);
    }

    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        if (!raf && running) raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
    window.addEventListener("resize", function () { resizeAll(); }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 粒子化鲸鱼引擎（官方移植：HeroDigitileR3F → 原生 WebGL2）
   * 源码取自官网 harness 页懒加载 chunk 776（未进缓存，已从官网抓取）：
   *   - 粒子位置：官方算法从 hero-whale.svg 像素亮度采样（60x60，边缘保留）
   *   - 顶点/片元 shader：官方 GLSL 逐字移植（three.js 矩阵替换为原生 uniform）
   *   - 交互：鼠标扭曲粒子（radius/strength/decay/distort）、光线跟随鼠标
   *     （lightParams.followX）、入场组装动画、松散漂移、游泳波动
   *   - 参数：DIGITILE_LIGHT_DEFAULTS / DIGITILE_MOUSE_DEFAULTS 与官方一致
   * ------------------------------------------------------------------ */
  // 官方鲸鱼纹理（hero-whale.svg，抓自 https://www.deepseek.com/harness/images/hero-whale.svg）

  shared.refs.startAurora = startAurora;
}


/* ===================== whale.js ===================== */
/* ------------------------------------------------------------------ *
 * src/whale.js — 粒子化鲸鱼引擎（initWhale）+ 鲸鱼层显隐
 *   shader/纹理常量与矩阵工具在 src/whale-shaders.js（工厂级片段）。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initWhale(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /** 鲸鱼层显隐：仅深色主题显示（官方深色 hero 元素），浅色保持官方原版 */
  function updateWhaleDisplay() {
    if (!shared.dom.whaleLayer) return;
    shared.dom.whaleLayer.style.display = (state.dark && bgSettings.whale) ? "flex" : "none";
  }
  function startWhale() {
    var canvas = shared.dom.whaleCanvas;
    // GPU 优化：点精灵粒子不需要 MSAA，antialias:false 省掉全屏 MSAA resolve；
    // low-power 提示驱动选择低功耗 GPU。渲染效果与原来一致（GL_POINTS 本来就不走多边形 AA）。
    var gl = canvas.getContext("webgl2", { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: "low-power" });
    if (!gl) { canvas.dataset.state = "no-webgl2"; return; }
    diag.whaleGL = true;
    try {
      canvas.addEventListener("webglcontextlost", function(e){ try{ e.preventDefault(); }catch(_){} canvas.dataset.state="context-lost"; });
      canvas.addEventListener("webglcontextrestored", function(){ try{ canvas.dataset.state="restoring"; startWhale(); }catch(_){} });
    } catch(_){}
    var img = new Image();
    img.onload = function () {
      var data;
      try { data = sampleWhalePixels(img); } catch (e) { canvas.dataset.state = "sample-fail"; return; }
      if (!data || data.count === 0) { canvas.dataset.state = "sample-empty"; return; }
      canvas.dataset.count = data.count;
      initWhaleGL(gl, canvas, data);
    };
    img.onerror = function () { canvas.dataset.state = "img-fail"; };
    img.src = WHALE_SRC;
  }

  function initWhaleGL(gl, canvas, data) {
    function compile(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        var log=""; try{ log=gl.getShaderInfoLog(s)||"compile failed"; }catch(_){}
        try{ console.error("[dsh-bg] whale shader compile failed:", log.slice(0,400)); }catch(_){}
        try{ canvas.dataset.state="whale-compile-fail:"+log.slice(0,200); diag.whaleProgs="compile-fail"; }catch(_){}
        try{ gl.deleteShader(s); }catch(_){}
        return null;
      }
      return s;
    }
    var prog = gl.createProgram();
    var vsS = compile(gl.VERTEX_SHADER, WHALE_VS);
    var fsS = compile(gl.FRAGMENT_SHADER, WHALE_FS);
    if (!vsS || !fsS) { try{ canvas.dataset.state="whale-shader-null"; diag.whaleProgs="compile-fail"; }catch(_){} return; }
    gl.attachShader(prog, vsS);
    gl.attachShader(prog, fsS);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      var log2=""; try{ log2=gl.getProgramInfoLog(prog)||"link failed"; }catch(_){}
      try{ console.error("[dsh-bg] whale program link failed:", log2.slice(0,400)); }catch(_){}
      try{ canvas.dataset.state = "link-fail:"+log2.slice(0,200); diag.whaleProgs = "link-fail"; }catch(_){}
      try{ gl.deleteProgram(prog); }catch(_){}
      return;
    }
    canvas.dataset.state = "shader-ok";
    diag.whaleProgs = "ok";
    gl.useProgram(prog);

    function buf(attr, arr, size) {
      var loc = gl.getAttribLocation(prog, attr);
      var b = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, b);
      gl.bufferData(gl.ARRAY_BUFFER, arr, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    buf("aCenter", data.positions, 3);
    buf("aScattered", data.scatteredPositions, 3);
    buf("aOpacity", data.opacities, 1);
    buf("aEdge", data.edges, 1);
    var idx = new Float32Array(data.count);
    for (var i = 0; i < data.count; i++) idx[i] = i;
    buf("aIndex", idx, 1);
    // 官方实例缩放：s = .5 + 1*Math.random()（0.5–1.5）——粒子大小有变化，
    // 大粒子呈现小方块，是官方鲸鱼层次感的关键（chunk 776 源码原逻辑）
    var scaleArr = new Float32Array(data.count);
    for (var i2 = 0; i2 < data.count; i2++) scaleArr[i2] = 0.5 + 1 * Math.random();
    buf("aScale", scaleArr, 1);
    // position 属性默认 (0,0,0,1) —— 官方 BoxGeometry 的局部偏移对点精灵为 0

    var u = {};
    ["uTime","uWaveSpeed","uWaveAmount","uMouse","uMouseRadius","uMouseStrength","uMouseDistort",
     "uAssembly","uLoose","uScatter","uLightPos","uLightRange","uShadeMin","uShadeMax",
     "uModel","uView","uProj","uPointScale","uColor"].forEach(function (n) { u[n] = gl.getUniformLocation(prog, n); });

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); // three.js AdditiveBlending
    gl.disable(gl.DEPTH_TEST);

    // 鼠标状态机（官方：mouseActive / mouseHasMoved）
    var mouse = { x: 0, y: 0, active: false, hasMoved: false };
    function onMove(e) {
      if (!bgSettings.mouse) return; // 设置面板「鼠标跟随交互」关闭时忽略
      mouse.active = true;
      mouse.hasMoved = true;
      var w = window.innerWidth || 1, h = window.innerHeight || 1;
      mouse.x = (e.clientX / w) * 2 - 1;
      mouse.y = -((e.clientY / h) * 2 - 1);
    }
    function onLeave() { mouse.active = false; }
    function onVis() { if (document.hidden) mouse.active = false; }
    if (!media.reducedMotion) {
      window.addEventListener("mousemove", onMove, { passive: true });
      window.addEventListener("mouseleave", onLeave);
      document.addEventListener("visibilitychange", onVis);
    }

    var start = performance.now();
    var raf = 0;
    var last = 0;
    var strength = 0;
    var b = { x: 0, y: 0 };
    // 光线跟随的平滑状态（屏幕归一化坐标，帧率无关指数平滑，时间常数 ~40ms）
    var wSX = 0, wSY = 0;
    var FOV = 50 * Math.PI / 180;
    // 相机距离：官方 18 → 15（18/15 = 1.2），鲸鱼整体等比放大 1.2 倍
    var CAM_DIST = 15;
    var HALF_H = Math.tan(FOV / 2) * CAM_DIST; // viewport（z=0 平面）半高
    var view = m4Translation(0, 0, -15);
    // GPU 优化：恒定不变的 uniform 只在初始化时上传一次（该 program 在此上下文常驻绑定），
    // 每帧省去约 10 次冗余 uniform 调用；动态值仍逐帧上传
    gl.uniformMatrix4fv(u.uView, false, view);
    gl.uniform1f(u.uWaveSpeed, WAVE_DEFAULTS.speed);
    gl.uniform1f(u.uWaveAmount, WAVE_DEFAULTS.amount);
    gl.uniform1f(u.uMouseRadius, MOUSE_DEFAULTS.radius);
    gl.uniform1f(u.uMouseDistort, MOUSE_DEFAULTS.distort);
    gl.uniform1f(u.uLoose, 1);
    gl.uniform1f(u.uScatter, 0);
    gl.uniform1f(u.uLightRange, LIGHT_DEFAULTS.range);
    gl.uniform1f(u.uShadeMin, LIGHT_DEFAULTS.shadeMin);
    gl.uniform1f(u.uShadeMax, LIGHT_DEFAULTS.shadeMax);
    // 复用矩阵缓冲，避免每帧分配 6 个 Float32Array(16)
    var _mTmpA = new Float32Array(16), _mTmpB = new Float32Array(16), _mTmpC = new Float32Array(16), _mTmpD = new Float32Array(16), _mTmpE = new Float32Array(16), _mTmpF = new Float32Array(16);
    var _modelBuf = new Float32Array(16), _projBuf = new Float32Array(16);
    var _invBuf = new Float32Array(16);

    // GPU 优化：鲸鱼是柔光粒子层，1.25x 物理分辨率渲染（原 1.5x 上限），
    // 像素量减少约 30%，屏幕混合的柔光粒子放大后无感知差异
    var WHALE_DPR = 1.25;

    // out 参数版矩阵工具（复用缓冲，零分配）
    function m4TranslationOut(tx, ty, tz, out) { out[0]=1;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=1;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=1;out[11]=0; out[12]=tx;out[13]=ty;out[14]=tz;out[15]=1; return out; }
    function m4ScaleOut(s, out) { out[0]=s;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=s;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=s;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationXOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=1;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=c;out[6]=s;out[7]=0; out[8]=0;out[9]=-s;out[10]=c;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationYOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=c;out[1]=0;out[2]=-s;out[3]=0; out[4]=0;out[5]=1;out[6]=0;out[7]=0; out[8]=s;out[9]=0;out[10]=c;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4RotationZOut(a, out){ var c=Math.cos(a),s=Math.sin(a); out[0]=c;out[1]=s;out[2]=0;out[3]=0; out[4]=-s;out[5]=c;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=1;out[11]=0; out[12]=0;out[13]=0;out[14]=0;out[15]=1; return out; }
    function m4MulOut(a,b,out){ for(var c=0;c<4;c++) for(var r=0;r<4;r++) out[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3]; return out; }
    function m4PerspectiveOut(fovY, aspect, near, far, out){ var f=1/Math.tan(fovY/2), nf=1/(near-far); out[0]=f/aspect;out[1]=0;out[2]=0;out[3]=0; out[4]=0;out[5]=f;out[6]=0;out[7]=0; out[8]=0;out[9]=0;out[10]=(far+near)*nf;out[11]=-1; out[12]=0;out[13]=0;out[14]=2*far*near*nf;out[15]=0; return out; }

    function resize() {
      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      var dpr = WHALE_DPR;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    resize();

    function frame(now) {
      raf = requestAnimationFrame(frame);
      if (shared.dom.whaleLayer.style.display === "none") return;
      // 鼠标跟随开启时鲸鱼提到 60fps（点精灵渲染开销小），光线/扭曲跟手更顺滑
      var frameMs = 1000 / (bgSettings.mouse ? 60 : (bgSettings.fps || 30));
      if (now - last < frameMs) return;
      var dt = Math.min(0.5, (now - last) / 1000);
      last = now - (now - last) % frameMs;

      var w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      if (Math.round(w * WHALE_DPR) !== canvas.width || Math.round(h * WHALE_DPR) !== canvas.height) resize();

      var elapsed = (now - start) / 1000;
      var L = Math.max(0, Math.min(1, (elapsed - 0.3) / 2.5));
      var D = 1 - Math.pow(1 - L, 3); // 官方 easeOutCubic 组装
      var E = 0; // 固定背景无滚动分散

      // 官方 group 变换（fish：spin=false）
      var rotZ = elapsed * ((1 - D) * 0.3) + 0.04 * Math.sin(0.25 * elapsed);
      var rotX = 0.05 * Math.sin(0.08 * elapsed * 0.7);
      var rotY = 0.1 * Math.sin(0.08 * elapsed);
      var posY = 0.15 * Math.sin(0.4 * elapsed);
      var scale = 0.75 + 0.25 * D;
      var aspect = canvas.width / canvas.height;
      var halfW = HALF_H * aspect;
      // 靠右布局：将鲸鱼中心进一步向右侧偏移（占据右侧开阔区域，文字区彻底清爽）
      var posX = halfW * 0.52;
      // 使用复用缓冲的 out 版矩阵，避免每帧新建 6 个 Float32Array
      m4RotationXOut(rotX, _mTmpA);
      m4RotationYOut(rotY, _mTmpB);
      m4MulOut(_mTmpB, _mTmpA, _mTmpC);
      m4RotationZOut(rotZ, _mTmpD);
      m4MulOut(_mTmpD, _mTmpC, _mTmpE);
      m4TranslationOut(posX, posY, 0, _mTmpA);
      m4MulOut(_mTmpA, _mTmpE, _mTmpB);
      m4ScaleOut(scale, _mTmpC);
      m4MulOut(_mTmpB, _mTmpC, _modelBuf);
      var model = _modelBuf;
      m4PerspectiveOut(FOV, aspect, 0.1, 100, _projBuf);
      var proj = _projBuf;
      gl.uniformMatrix4fv(u.uModel, false, model);
      gl.uniformMatrix4fv(u.uProj, false, proj);
      gl.uniform1f(u.uTime, elapsed);
      gl.uniform1f(u.uAssembly, D);
      // 鼠标强度：官方以 (1-0.05^dt) 插值；设置面板关闭时恒为 0
      var target = (mouse.active && bgSettings.mouse) ? MOUSE_DEFAULTS.strength : 0;
      strength += (target - strength) * (1 - Math.pow(0.05, dt));
      gl.uniform1f(u.uMouseStrength, strength);
      // 光线：跟随鲸鱼右移基准 + 光标移动响应
      var wk = 1 - Math.exp(-dt / ((bgSettings.followMs != null ? bgSettings.followMs : 20) * 2 / 1000));
      wSX += ((bgSettings.mouse ? mouse.x : 0) - wSX) * wk;
      wSY += ((bgSettings.mouse ? mouse.y : 0) - wSY) * wk;
      gl.uniform3f(u.uLightPos, posX + 2.5 + wSX * halfW * LIGHT_DEFAULTS.followX * (bgSettings.mouse ? (bgSettings.lightFollow != null ? bgSettings.lightFollow : 1) : 0), LIGHT_DEFAULTS.y, LIGHT_DEFAULTS.z);
      // uMouse：屏幕鼠标 → 世界(z=0) → 组局部空间（官方 matrixWorld 逆变换）
      if (mouse.hasMoved) {
        var wx = mouse.x * halfW, wy = mouse.y * HALF_H;
        if (strength < 0.01) { b.x = wx; b.y = wy; }
        // 帧率无关：官方 decay 是每 30fps 帧的插值系数，按实际 dt 归一化，60fps 下手感一致
        else { b.x += (wx - b.x) * (1 - Math.pow(1 - MOUSE_DEFAULTS.decay, dt * 30)); b.y += (wy - b.y) * (1 - Math.pow(1 - MOUSE_DEFAULTS.decay, dt * 30)); }
      }
      var inv = m4Inverse(model, _invBuf); // 复用缓冲，帧循环零分配
      var ux = inv[0]*b.x + inv[4]*b.y + inv[12];
      var uy = inv[1]*b.x + inv[5]*b.y + inv[13];
      gl.uniform2f(u.uMouse, ux, uy);
      // 颜色：晶透亮白粒子（带极微量冰蓝高光）
      gl.uniform3f(u.uColor, 0.95 * D, 0.97 * D, 1.0 * D);
      // 点尺寸：官方 BoxGeometry 0.065 单位 × 实例缩放 × 组缩放（提升粒子点阵清晰度）
      gl.uniform1f(u.uPointScale, 0.065 * scale * (canvas.height / (2 * HALF_H)));

      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.POINTS, 0, data.count);
    }

    if (media.reducedMotion) {
      start = performance.now() - 30000; // 组装动画已完成的状态下绘制单帧
      last = 0;
      frame(performance.now());
      cancelAnimationFrame(raf);
      raf = 0;
    } else {
      raf = requestAnimationFrame(frame);
    }
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "visible") {
        if (!raf && !media.reducedMotion) raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    });
  }

  shared.refs.startWhale = startWhale;
  shared.refs.updateWhaleDisplay = updateWhaleDisplay;
}


/* ===================== constellation.js ===================== */
/* ------------------------------------------------------------------ *
 * src/constellation.js — 星座网格引擎（initConstellation，2D canvas）
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initConstellation(shared) {
  var state = shared.state;
  var bgSettings = shared.settings;
  var media = shared.media;
  var diag = shared.dom.diag;

  /* ------------------------------------------------------------------ *
   * 星座网格引擎（2D canvas）
   * ------------------------------------------------------------------ */
  function startConstellation() {
    var canvas = shared.dom.constellationCanvas;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    diag.constellation = true;

    // GPU 优化：细线星座网格的 2D canvas 上限 1.5x（原 2x），
    // 填充像素量约减 44%；0.5px 线条在 1.5x 下仍为 0.75 物理像素，观感不变
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var dots = [], cols = 0, rows = 0;
    var mouse = { x: NaN, y: NaN };
    var raf = 0;
    var idle = false;
    var last = 0;
    var resizeTimer = null;

    function buildGrid() {
      var w = canvas.clientWidth, h = canvas.clientHeight;
      cols = Math.ceil(w / 90) + 1;
      rows = Math.ceil(h / 90) + 1;
      var ox = (w - (cols - 1) * 90) / 2;
      var oy = (h - (rows - 1) * 90) / 2;
      dots = [];
      for (var y = 0; y < rows; y++) {
        for (var x = 0; x < cols; x++) {
          var rx = ox + 90 * x, ry = oy + 90 * y;
          dots.push({ restX: rx, restY: ry, x: rx, y: ry, vx: 0, vy: 0 });
        }
      }
    }
    function resize() {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrid();
    }
    resize();

    function onMove(e) {
      if (!bgSettings.mouse) return; // 设置面板「鼠标跟随交互」关闭时忽略（网格保持静止）
      // 画布为 position:fixed inset:0 铺满视口，直接用视口尺寸换算，
      // 避免 mousemove 高频事件里 getBoundingClientRect() 的强制布局
      mouse.x = e.clientX;
      mouse.y = e.clientY;
      wake();
    }
    if (!media.reducedMotion) window.addEventListener("mousemove", onMove, { passive: true });

    function draw(mx, my, active) {
      var opts = shared.refs.currentConstellation();
      var w = canvas.clientWidth, h = canvas.clientHeight;
      ctx.clearRect(0, 0, w, h);

      // GPU/CPU 优化：线段互不重叠，逐段 beginPath/stroke 与「单路径收集 + 一次 stroke」
      // 的栅格化结果完全一致，但绘制调用从 O(n) 次降为 1 次（全屏网格每帧省下数百次 stroke）
      ctx.strokeStyle = opts.lineColor + " " + opts.lineOpacity + ")";
      ctx.lineWidth = 0.5;
      var i, j, a, b, dx, dy, dist, ux, uy;
      ctx.beginPath();
      for (j = 0; j < rows; j++) {
        for (i = 0; i < cols - 1; i++) {
          a = dots[j * cols + i]; b = dots[j * cols + i + 1];
          dx = b.x - a.x; dy = b.y - a.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) continue;
          ux = dx / dist; uy = dy / dist;
          ctx.moveTo(a.x + 10 * ux, a.y + 10 * uy);
          ctx.lineTo(b.x - 10 * ux, b.y - 10 * uy);
        }
      }
      for (i = 0; i < cols; i++) {
        for (j = 0; j < rows - 1; j++) {
          a = dots[j * cols + i]; b = dots[(j + 1) * cols + i];
          dx = b.x - a.x; dy = b.y - a.y;
          dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 20) continue;
          ux = dx / dist; uy = dy / dist;
          ctx.moveTo(a.x + 10 * ux, a.y + 10 * uy);
          ctx.lineTo(b.x - 10 * ux, b.y - 10 * uy);
        }
      }
      ctx.stroke();

      // 点批量合并：远离光标的点尺寸与透明度完全相同（n=1.8 / dotOpacity），
      // 合并进单一 path 一次填充；仅光标邻近点保留逐个绘制（亮度/尺寸渐变不变）
      ctx.fillStyle = opts.dotColor + " " + opts.dotOpacity + ")";
      var hasMouse = !isNaN(mx) && !isNaN(my);
      var nearIdx = [];
      ctx.globalAlpha = opts.dotOpacity;
      ctx.beginPath();
      for (i = 0; i < dots.length; i++) {
        var p = dots[i];
        if (hasMouse) {
          dx = p.x - mx; dy = p.y - my;
          dist = Math.sqrt(dx * dx + dy * dy);
          var l = Math.max(0, 1 - dist / 140);
          if (l > 0) { nearIdx.push(i); continue; }
        }
        if (opts.round) {
          ctx.moveTo(p.x + 1.8, p.y);
          ctx.arc(p.x, p.y, 1.8, 0, 2 * Math.PI);
        } else {
          ctx.rect(p.x - 1.8, p.y - 1.8, 3.6, 3.6);
        }
      }
      ctx.fill();
      for (j = 0; j < nearIdx.length; j++) {
        p = dots[nearIdx[j]];
        dx = p.x - mx; dy = p.y - my;
        dist = Math.sqrt(dx * dx + dy * dy);
        var ln = Math.max(0, 1 - dist / 140);
        var n = 1.8 + 2 * ln;
        ctx.globalAlpha = opts.dotOpacity + 0.4 * ln;
        if (opts.round) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, n, 0, 2 * Math.PI);
          ctx.fill();
        } else {
          ctx.fillRect(p.x - n, p.y - n, 2 * n, 2 * n);
        }
      }
      ctx.globalAlpha = 1;
    }

    function wake() {
      if (idle) {
        idle = false;
        last = 0;
        raf = requestAnimationFrame(loop);
      }
    }
    shared.refs.wakeConstellation = wake; // 设置面板重新开启星座时唤醒（idle 停止后 rAF 已停）

    var constBlanked = false;
    function loop(now) {
      if (!bgSettings.constellation) {
        // 关闭：清空画布一次后空转（与浅色主题同一模式，代价可忽略）
        if (!bgSettings.constellation && !constBlanked) {
          ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
          constBlanked = true;
        }
        raf = requestAnimationFrame(loop);
        return;
      }
      constBlanked = false;
      // 鼠标跟随开启时活跃期 60fps（2D 画布开销小），斥力响应更顺滑；静止仍按设置帧率
      var frameMs = 1000 / (bgSettings.mouse ? 60 : (bgSettings.fps || 30));
      if (now - last < frameMs) { raf = requestAnimationFrame(loop); return; }
      last = now - (now - last) % frameMs;

      // 布局未就绪时补一次尺寸同步
      if (Math.round(canvas.clientWidth * dpr) !== canvas.width ||
          Math.round(canvas.clientHeight * dpr) !== canvas.height) {
        resize();
      }

      var mx = bgSettings.mouse ? mouse.x : NaN, my = bgSettings.mouse ? mouse.y : NaN;
      var maxSpeed = 0;
      for (var i = 0; i < dots.length; i++) {
        var p = dots[i];
        if (!isNaN(mx) && !isNaN(my)) {
          var dx = p.x - mx, dy = p.y - my;
          var d = Math.sqrt(dx * dx + dy * dy);
          if (d < 140 && d > 0.1) {
            var e = (1 - d / 140) * 30;
            var ux = dx / d, uy = dy / d;
            p.vx += ux * e * 0.1;
            p.vy += uy * e * 0.1;
          }
        }
        p.vx += 0.05 * (p.restX - p.x);
        p.vy += 0.05 * (p.restY - p.y);
        p.vx *= 0.85;
        p.vy *= 0.85;
        p.x += p.vx;
        p.y += p.vy;
        var sp = Math.abs(p.vx) + Math.abs(p.vy);
        if (sp > maxSpeed) maxSpeed = sp;
      }
      draw(mx, my, true);
      if (maxSpeed < 0.01) {
        idle = true;
        return;
      }
      raf = requestAnimationFrame(loop);
    }

    if (media.reducedMotion) {
      draw(NaN, NaN, false); // 静态单帧
    } else {
      idle = false;
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", function () {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        resize();
        wake();
      }, 150);
    }, { passive: true });
  }

  /* ------------------------------------------------------------------ *
   * 主题联动
   * ------------------------------------------------------------------ */

  shared.refs.startConstellation = startConstellation;
}


/* ===================== observer.js ===================== */
/* ------------------------------------------------------------------ *
 * src/observer.js — 主题联动（initObserver，MutationObserver + matchMedia）
 *   监听到主题属性 / prefers-color-scheme 变化时重新检测 state.dark，
 *   并联动 applyThemeClass（深色显示背景层；浅色恢复官方原版）。
 *   UI 皮肤联动（玻璃/Beam）由 dsh-ui-beam-orbs 插件自行处理。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initObserver(shared) {
  var state = shared.state;

  function observeTheme() {
    var apply = function () {
      var d = (shared.refs.detectDark) ? shared.refs.detectDark() :
        !!(shared.media.darkQuery && shared.media.darkQuery.matches);
      if (d !== state.dark) {
        state.dark = d;
        try { shared.refs.applyThemeClass(); } catch(e){}
      }
    };
    if (window.MutationObserver) {
      if (!shared.refs.themeObserver) {
        var mo = new MutationObserver(apply);
        shared.refs.themeObserver = mo;
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ["data-ds-dark-theme", "data-ds-light-theme", "data-theme"] });
      }
    }
    if (shared.media.darkQuery && shared.media.darkQuery.addEventListener) {
      shared.media.darkQuery.addEventListener("change", apply);
    } else if (shared.media.darkQuery && shared.media.darkQuery.addListener) {
      shared.media.darkQuery.addListener(apply); // 旧版 Safari/WebView 回退
    }
  }

  shared.refs.observeTheme = observeTheme;
}


/* ===================== diag.js ===================== */
/* ------------------------------------------------------------------ *
 * src/diag.js — 背景引擎诊断面板（initDiag，?dshtest=1 时显示）
 *   UI 皮肤诊断（玻璃/Beam/Orbs）在 dsh-ui-beam-orbs 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initDiag(shared) {
  var state = shared.state;
  var diag = shared.dom.diag;

  function startDiagPanel() {
    function collect() {
      var cs = function (el) { try { return window.getComputedStyle(el); } catch (e) { return null; } };
      var bcs = cs(document.body);
      var hcs = cs(document.documentElement);
      var ccs = cs(shared.dom.container);
      var frame = document.querySelector('[data-slot="root"] .pI_x6G_frame') ||
        document.querySelector('[data-slot="root"] > div');
      var fcs = frame ? cs(frame) : null;
      diag.theme = state.dark ? "dark" : "light";
      diag.bodyBg = bcs ? bcs.backgroundColor : "?";
      diag.htmlBg = hcs ? hcs.backgroundColor : "?";
      diag.containerPos = ccs ? ccs.position : "?";
      diag.containerZ = ccs ? ccs.zIndex : "?";
      diag.containerBg = ccs ? (ccs.backgroundImage + " / " + ccs.backgroundColor) : "?";
      diag.frameFound = !!frame;
      diag.frameBg = fcs ? fcs.backgroundColor : "?";
      diag.canvasW = shared.dom.auroraCanvas.width;
      diag.canvasH = shared.dom.auroraCanvas.height;
    }
    collect();
    var panel = document.createElement("pre");
    panel.id = "dsh-ds-diag-bg";
    panel.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:2147483000;background:#fff;color:#000;" +
      "font:11px/1.5 monospace;padding:10px 12px;border:2px solid #f00;max-width:520px;white-space:pre-wrap;";
    document.body.appendChild(panel);
    function render() {
      collect();
      panel.textContent = [
        "dsh-deepseek-bg v1.13.1 (背景引擎) diagnostics",
        "theme: " + diag.theme,
        "body bg: " + diag.bodyBg,
        "html bg: " + diag.htmlBg,
        "container: pos=" + diag.containerPos + " z=" + diag.containerZ + " bg=" + diag.containerBg,
        "frame found: " + diag.frameFound + " bg=" + diag.frameBg,
        "aurora: gl=" + diag.auroraGL + " progs=[" + diag.auroraProgs + "]",
        "constellation: " + diag.constellation,
        "canvas: " + diag.canvasW + "x" + diag.canvasH
      ].join("\n");
    }
    render();
    setInterval(render, 1000);
  }

  shared.refs.startDiagPanel = startDiagPanel;
}


/* ===================== boot.js ===================== */
/* ------------------------------------------------------------------ *
 * src/boot.js — 启动编排（initBoot）
 *   在全部 initX 之后由 apply 调用；跨模块启动函数一律经 shared.refs.*。
 *   仅启动背景引擎（极光/鲸鱼/星座/主题观察/诊断）；
 *   UI 皮肤启动（玻璃/Beam/Orbs）在 dsh-ui-beam-orbs 插件。
 *   由 scripts/build.mjs 拼接进 lib/client.js 的工厂闭包。
 * ------------------------------------------------------------------ */
function initBoot(shared) {
  var media = shared.media;

  function boot() {
    if (!document.body) { document.addEventListener("DOMContentLoaded", boot, { once: true }); return; }
    // body 背景透明化由 applyThemeClass 按主题管理（浅色主题保持官方原版）
    shared.refs.applyThemeClass();
    document.body.appendChild(shared.dom.container);
    shared.refs.startAurora();
    if (typeof location === "undefined" || location.search.indexOf("nowhale") === -1) shared.refs.startWhale();
    if (!media.coarse || media.reducedMotion) shared.refs.startConstellation();
    shared.refs.observeTheme();
    if (typeof location !== "undefined" && (location.search.indexOf("dshtest") !== -1)) shared.refs.startDiagPanel();
  }

  shared.refs.boot = boot;
}


/* ===================== index.js ===================== */
/* ===================================================================== *
 * src/index.js — 客户端入口 apply(ctx)（由 scripts/build.mjs 拼接进工厂闭包）
 *   本插件只负责背景引擎：极光 / 粒子鲸鱼 / 星座网格 + 鼠标跟随交互
 *   （玻璃拟态 / Border Beam / Thinking Orbs / 任务清单 Pulse 已拆分至
 *    dsh-ui-beam-orbs 插件）。
 *   创建 shared（media / state / settings / dom / refs），按依赖顺序调用
 *   各子系统的 initX，装配 window.__dshDeepSeekBg 调试句柄，最后按原执行
 *   顺序执行 applyThemeClass → boot。
 * ===================================================================== */
function apply(ctx) {
  "use strict";
  if (window.__dshDeepSeekBg && window.__dshDeepSeekBg._inited) return;
  if (typeof document === "undefined") return;

  if (typeof window.__dshDeepSeekBg !== 'object' || window.__dshDeepSeekBg === null) window.__dshDeepSeekBg = {};
  window.__dshDeepSeekBg._inited = true;

  /* 跨模块共享状态：预建全部容器对象，各 initX 捕获引用后后续填充依然有效 */
  var shared = {
    media: {
      darkQuery: window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null,
      reducedMotion: !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches),
      coarse: !!(window.matchMedia && window.matchMedia("(hover: none), (pointer: coarse)").matches),
      isWindows: (navigator.userAgentData && navigator.userAgentData.platform === "Windows") ||
        navigator.userAgent.indexOf("Windows") !== -1
    },
    state: { dark: false },
    settings: {},
    dom: {},
    refs: {},
    ctx: ctx
  };

  // 依赖顺序：theme → settings → dom → 渲染引擎 → observer → diag → boot
  initTheme(shared);         // 主题检测 / 官方参数配置 / state.dark 初值
  initSettings(shared);      // bgSettings（shared.settings）+ 设置页 UI（背景引擎四项）
  initDom(shared);           // 背景容器 / 极光 / 星座 canvas / 鲸鱼层 / diag
  initAurora(shared);        // 极光引擎（shader 在 aurora-shaders.js）
  initWhale(shared);         // 粒子鲸鱼（shader/矩阵在 whale-shaders.js）
  initConstellation(shared); // 星座网格
  initObserver(shared);      // 主题联动（MutationObserver + matchMedia）
  initDiag(shared);          // 诊断面板（?dshtest=1）
  initBoot(shared);          // 启动编排（原 boot()）

  // 与原执行顺序一致：applyThemeClass（原 1833）→ setupSettingsUi（原 5014）→ boot()（原 5015）
  if (shared.refs.applyThemeClass) shared.refs.applyThemeClass();
  if (shared.refs.setupSettingsUi) shared.refs.setupSettingsUi(ctx);
  if (shared.refs.boot) shared.refs.boot();
}


    exports.apply = apply;
    // 设置面板依赖 slots 服务（由 dsh-client-ui-slots 提供）；未就绪时等待其出现
    exports.inject = ["slots"];
    return module.exports;
  }
});
