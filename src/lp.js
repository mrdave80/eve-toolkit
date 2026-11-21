'use strict';
/* Smallest-cost covering problem: minimise sum(cost[i] * x[i]) so that for every material j,
   sum(a[i][j] * x[i]) >= need[j], with x >= 0. Solved through its dual (maximise sum(need[j] * y[j]) with
   sum(a[i][j] * y[j]) <= cost[i]), which starts feasible at y = 0, using the simplex method with Bland's rule.
   The primal answer x is read from the final objective row under each slack column. Returns null when a
   material can't be covered by any option. */
function cover(a, cost, need, maxIter = 5000) {
  const n = a.length, m = need.length;
  for (let j = 0; j < m; j++) if (need[j] > 0 && !a.some(r => r[j] > 0)) return null;
  // tableau rows: n constraints + objective; columns: m (y) + n (slack) + rhs
  const W = m + n + 1;
  const T = [];
  for (let i = 0; i < n; i++) { const r = new Float64Array(W); for (let j = 0; j < m; j++) r[j] = a[i][j]; r[m + i] = 1; r[W - 1] = cost[i]; T.push(r); }
  const z = new Float64Array(W); for (let j = 0; j < m; j++) z[j] = -need[j]; T.push(z);
  const eps = 1e-9;
  for (let it = 0; it < maxIter; it++) {
    let col = -1;
    for (let j = 0; j < W - 1; j++) if (T[n][j] < -eps) { col = j; break; }   // Bland: first improving column
    if (col < 0) break;
    let row = -1, best = Infinity;
    for (let i = 0; i < n; i++) if (T[i][col] > eps) { const r = T[i][W - 1] / T[i][col]; if (r < best - eps) { best = r; row = i; } }
    if (row < 0) return null; // unbounded dual = infeasible primal
    const p = T[row][col];
    for (let j = 0; j < W; j++) T[row][j] /= p;
    for (let i = 0; i <= n; i++) if (i !== row && Math.abs(T[i][col]) > eps) { const f = T[i][col]; for (let j = 0; j < W; j++) T[i][j] -= f * T[row][j]; }
  }
  const x = new Array(n); for (let i = 0; i < n; i++) x[i] = Math.max(0, T[n][m + i]);
  return { x, cost: T[n][W - 1] };
}
module.exports = { cover };
