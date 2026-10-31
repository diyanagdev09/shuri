// Transpiled from MIT licensed https://github.com/stegu/psrdnoise/blob/main/src/psrdnoise3-min.glsl
// with slight modification to work around transpiler limitations and bugs.
// Three.js Transpiler r177

import {
  vec4,
  mod,
  Fn,
  float,
  vec3,
  mat3,
  floor,
  fract,
  step,
  sub,
  min,
  max,
  greaterThan,
  any,
  If,
  cos,
  sin,
  sqrt,
  mix,
  dot,
  mul,
} from "three/tsl";

export const permute = /*#__PURE__*/ Fn(([i_immutable]) => {
  const i = vec4(i_immutable).toVar();
  const im = vec4(mod(i, 289.0)).toVar();

  return mod(im.mul(34.0).add(10.0).mul(im), 289.0);
}).setLayout({
  name: "permute",
  type: "vec4",
  inputs: [{ name: "i", type: "vec4" }],
});

export const psrdnoise = /*#__PURE__*/ Fn(([x, period, alpha]) => {
  const M = mat3(0.0, 1.0, 1.0, 1.0, 0.0, 1.0, 1.0, 1.0, 0.0).toVar("M");
  const Mi = mat3(
    float(-0.5),
    0.5,
    0.5,
    0.5,
    float(-0.5),
    0.5,
    0.5,
    0.5,
    float(-0.5),
  ).toVar("Mi");
  const uvw = vec3(M.mul(x)).toVar("uvw");
  const i0 = vec3(floor(uvw)).toVar("i0"),
    f0 = vec3(fract(uvw)).toVar("f0");
  const g_ = vec3(step(f0.xyx, f0.yzz)).toVar("g_"),
    l_ = vec3(sub(1.0, g_)).toVar("l_");
  const g = vec3(l_.z, g_.xy).toVar("g"),
    l = vec3(l_.xy, g_.z).toVar("l");
  const o1 = vec3(min(g, l)).toVar("o1"),
    o2 = vec3(max(g, l)).toVar("o2");
  const i1 = vec3(i0.add(o1)).toVar("i1"),
    i2 = vec3(i0.add(o2)).toVar("i2"),
    i3 = vec3(i0.add(vec3(1.0))).toVar("i3");
  const v0 = vec3(Mi.mul(i0)).toVar("v0"),
    v1 = vec3(Mi.mul(i1)).toVar("v1"),
    v2 = vec3(Mi.mul(i2)).toVar("v2"),
    v3 = vec3(Mi.mul(i3)).toVar("v3");
  const x0 = vec3(x.sub(v0)).toVar("x0"),
    x1 = vec3(x.sub(v1)).toVar("x1"),
    x2 = vec3(x.sub(v2)).toVar("x2"),
    x3 = vec3(x.sub(v3)).toVar("x3");

  If(any(greaterThan(period, vec3(0.0))), () => {
    const vx = vec4(v0.x, v1.x, v2.x, v3.x).toVar("vx");
    const vy = vec4(v0.y, v1.y, v2.y, v3.y).toVar("vy");
    const vz = vec4(v0.z, v1.z, v2.z, v3.z).toVar("vz");

    If(period.x.greaterThan(0.0), () => {
      vx.assign(mod(vx, period.x));
    });

    If(period.y.greaterThan(0.0), () => {
      vy.assign(mod(vy, period.y));
    });

    If(period.z.greaterThan(0.0), () => {
      vz.assign(mod(vz, period.z));
    });

    i0.assign(floor(M.mul(vec3(vx.x, vy.x, vz.x)).add(0.5)));
    i1.assign(floor(M.mul(vec3(vx.y, vy.y, vz.y)).add(0.5)));
    i2.assign(floor(M.mul(vec3(vx.z, vy.z, vz.z)).add(0.5)));
    i3.assign(floor(M.mul(vec3(vx.w, vy.w, vz.w)).add(0.5)));
  });

  const hash = vec4(
    permute(
      permute(
        permute(vec4(i0.z, i1.z, i2.z, i3.z)).add(vec4(i0.y, i1.y, i2.y, i3.y)),
      ).add(vec4(i0.x, i1.x, i2.x, i3.x)),
    ),
  ).toVar("hash");
  const theta = vec4(hash.mul(3.883222077)).toVar("theta");

  // Transpiler error: (hash * -0.006920415) turned into (hash -0.006920415)
  // const sz = vec4( hash.sub( 0.006920415 ).add( 0.996539792 ) ).toVar("sz");
  const sz = vec4(hash.mul(-0.006920415).add(0.996539792)).toVar("sz");

  const psi = vec4(hash.mul(0.108705628)).toVar("psi");
  const Ct = vec4(cos(theta)).toVar("Ct"),
    St = vec4(sin(theta)).toVar("St");
  const sz_prime = vec4(sqrt(sub(1.0, sz.mul(sz)))).toVar("sz_prime");
  const gx = vec4().toVar("gx"),
    gy = vec4().toVar("gy"),
    gz = vec4().toVar("gz");

  If(alpha.notEqual(0.0), () => {
    const px = vec4(Ct.mul(sz_prime)).toVar("px"),
      py = vec4(St.mul(sz_prime)).toVar("py"),
      pz = vec4(sz).toVar("pz");
    const Sp = vec4(sin(psi)).toVar("Sp"),
      Cp = vec4(cos(psi)).toVar("Cp"),
      Ctp = vec4(St.mul(Sp).sub(Ct.mul(Cp))).toVar("Ctp");
    const qx = vec4(mix(Ctp.mul(St), Sp, sz)).toVar("qx"),
      qy = vec4(mix(Ctp.negate().mul(Ct), Cp, sz)).toVar("qy");
    const qz = vec4(py.mul(Cp).add(px.mul(Sp)).negate()).toVar("qz");
    const Sa = vec4(sin(alpha)).toVar("Sa"),
      Ca = vec4(cos(alpha)).toVar("Ca");
    gx.assign(Ca.mul(px).add(Sa.mul(qx)));
    gy.assign(Ca.mul(py).add(Sa.mul(qy)));
    gz.assign(Ca.mul(pz).add(Sa.mul(qz)));
  }).Else(() => {
    gx.assign(Ct.mul(sz_prime));
    gy.assign(St.mul(sz_prime));
    gz.assign(sz);
  });

  const g0 = vec3(gx.x, gy.x, gz.x).toVar("g0"),
    g1 = vec3(gx.y, gy.y, gz.y).toVar("g1");
  const g2 = vec3(gx.z, gy.z, gz.z).toVar("g2"),
    g3 = vec3(gx.w, gy.w, gz.w).toVar("g3");
  const w = vec4(
    sub(0.5, vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3))),
  ).toVar("w");
  w.assign(max(w, 0.0));
  const w2 = vec4(w.mul(w)).toVar("w2"),
    w3 = vec4(w2.mul(w)).toVar("w3");
  const gdotx = vec4(dot(g0, x0), dot(g1, x1), dot(g2, x2), dot(g3, x3)).toVar(
    "gdotx",
  );
  const n = float(dot(w3, gdotx)).toVar("n");
  const dw = vec4(float(-6.0).mul(w2).mul(gdotx)).toVar("dw");
  const dn0 = vec3(w3.x.mul(g0).add(dw.x.mul(x0))).toVar("dn0");
  const dn1 = vec3(w3.y.mul(g1).add(dw.y.mul(x1))).toVar("dn1");
  const dn2 = vec3(w3.z.mul(g2).add(dw.z.mul(x2))).toVar("dn2");
  const dn3 = vec3(w3.w.mul(g3).add(dw.w.mul(x3))).toVar("dn3");

  const noise = mul(39.5, n).toVar("noise");
  const gradient = mul(39.5, dn0.add(dn1).add(dn2).add(dn3)).toVar("gradient");

  return vec4(gradient, noise);
}).setLayout({
  name: "psrdnoise",
  type: "vec4",
  inputs: [
    { name: "x", type: "vec3" },
    { name: "period", type: "vec3" },
    { name: "alpha", type: "float" },
  ],
});
