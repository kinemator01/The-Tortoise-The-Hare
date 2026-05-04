/**
 * Mat4 — column-major 4x4 matrix math (no external dependencies).
 * Storage layout matches GLSL/OpenGL: element [col * 4 + row].
 * Every function returns a new Float32Array(16).
 */
const Mat4 = (() => {

  // ── Foundations ──────────────────────────────────────────────────────────

  function identity() {
    const m = new Float32Array(16);
    m[0] = 1; m[5] = 1; m[10] = 1; m[15] = 1;
    return m;
  }

  // Returns a * b (column-major, so b is applied first in vertex transforms).
  function multiply(a, b) {
    const out = new Float32Array(16);
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        let sum = 0;
        for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k];
        out[col * 4 + row] = sum;
      }
    }
    return out;
  }

  // ── Affine transforms ────────────────────────────────────────────────────

  function translate(tx, ty, tz) {
    const m = identity();
    m[12] = tx; m[13] = ty; m[14] = tz;
    return m;
  }

  function scale(sx, sy, sz) {
    const m = identity();
    m[0] = sx; m[5] = sy; m[10] = sz;
    return m;
  }

  // ── Axis-aligned rotations (angle in radians) ─────────────────────────────
  //
  //  Column-major layout reminder:  index = col * 4 + row
  //
  //  rotateX — affects the Y/Z plane:
  //    | 1    0     0    0 |
  //    | 0   cos  -sin   0 |
  //    | 0   sin   cos   0 |
  //    | 0    0     0    1 |

  function rotateX(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = identity();
    m[5]  =  c;   // col 1, row 1
    m[6]  =  s;   // col 1, row 2
    m[9]  = -s;   // col 2, row 1
    m[10] =  c;   // col 2, row 2
    return m;
  }

  //  rotateY — affects the X/Z plane:
  //    |  cos   0   sin   0 |
  //    |   0    1    0    0 |
  //    | -sin   0   cos   0 |
  //    |   0    0    0    1 |

  function rotateY(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = identity();
    m[0]  =  c;   // col 0, row 0
    m[2]  = -s;   // col 0, row 2
    m[8]  =  s;   // col 2, row 0
    m[10] =  c;   // col 2, row 2
    return m;
  }

  //  rotateZ — affects the X/Y plane:
  //    |  cos  -sin   0   0 |
  //    |  sin   cos   0   0 |
  //    |   0     0    1   0 |
  //    |   0     0    0   1 |

  function rotateZ(angle) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const m = identity();
    m[0]  =  c;   // col 0, row 0
    m[1]  =  s;   // col 0, row 1
    m[4]  = -s;   // col 1, row 0
    m[5]  =  c;   // col 1, row 1
    return m;
  }

  // Arbitrary-axis rotation — kept for multi-axis compound rotations later.
  function rotate(angle, ax, ay, az) {
    const len = Math.sqrt(ax*ax + ay*ay + az*az);
    if (len < 1e-8) return identity();
    ax /= len; ay /= len; az /= len;
    const s = Math.sin(angle), c = Math.cos(angle), t = 1 - c;
    const m = new Float32Array(16);
    m[0]  = t*ax*ax + c;      m[1]  = t*ax*ay + s*az; m[2]  = t*ax*az - s*ay; m[3]  = 0;
    m[4]  = t*ax*ay - s*az;   m[5]  = t*ay*ay + c;    m[6]  = t*ay*az + s*ax; m[7]  = 0;
    m[8]  = t*ax*az + s*ay;   m[9]  = t*ay*az - s*ax; m[10] = t*az*az + c;    m[11] = 0;
    m[12] = 0; m[13] = 0; m[14] = 0; m[15] = 1;
    return m;
  }

  // ── Projection & View ────────────────────────────────────────────────────

  // Symmetric perspective frustum.  fovY in radians, aspect = width/height.
  function perspective(fovY, aspect, near, far) {
    const f  = 1.0 / Math.tan(fovY * 0.5);
    const nf = 1.0 / (near - far);
    const m  = new Float32Array(16);
    m[0]  = f / aspect;
    m[5]  = f;
    m[10] = (far + near) * nf;
    m[11] = -1;
    m[14] = 2 * far * near * nf;
    return m;
  }

  // View matrix: camera at (ex,ey,ez) looking at (cx,cy,cz), world-up (ux,uy,uz).
  function lookAt(ex, ey, ez, cx, cy, cz, ux, uy, uz) {
    // Forward vector points from target → eye (OpenGL convention).
    let fx = ex-cx, fy = ey-cy, fz = ez-cz;
    const fLen = Math.sqrt(fx*fx + fy*fy + fz*fz);
    fx /= fLen; fy /= fLen; fz /= fLen;

    // Right = up × forward, then normalise.
    let rx = uy*fz - uz*fy, ry = uz*fx - ux*fz, rz = ux*fy - uy*fx;
    const rLen = Math.sqrt(rx*rx + ry*ry + rz*rz);
    rx /= rLen; ry /= rLen; rz /= rLen;

    // True up = forward × right (already unit length if f and r are).
    const tux = fy*rz - fz*ry, tuy = fz*rx - fx*rz, tuz = fx*ry - fy*rx;

    const m = new Float32Array(16);
    m[0]=rx;  m[1]=tux; m[2]=fx;  m[3]=0;
    m[4]=ry;  m[5]=tuy; m[6]=fy;  m[7]=0;
    m[8]=rz;  m[9]=tuz; m[10]=fz; m[11]=0;
    m[12] = -(rx*ex  + ry*ey  + rz*ez);
    m[13] = -(tux*ex + tuy*ey + tuz*ez);
    m[14] = -(fx*ex  + fy*ey  + fz*ez);
    m[15] = 1;
    return m;
  }

  // Orthographic projection.  Maps [left,right]×[bottom,top]×[near,far] → NDC.
  function ortho(left, right, bottom, top, near, far) {
    const m = identity();
    m[0]  =  2 / (right - left);
    m[5]  =  2 / (top   - bottom);
    m[10] = -2 / (far   - near);
    m[12] = -(right + left)   / (right - left);
    m[13] = -(top   + bottom) / (top   - bottom);
    m[14] = -(far   + near)   / (far   - near);
    return m;
  }

  return { identity, multiply, translate, scale, rotateX, rotateY, rotateZ, rotate, perspective, lookAt, ortho };
})();
