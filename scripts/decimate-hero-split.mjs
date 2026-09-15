/**
 * Decimate the hero mark PART BY PART, keeping the source's 12 primitives.
 *
 * decimate-hero.mjs merges all 12 parts into one primitive. That turns out to
 * change how the glass renders even with zero simplification: a merged control
 * with vertex-identical geometry (positions within 7e-6 of the mark's size,
 * normals within 0.001 degrees) still differed from the source by ~8% in the
 * bowl of the D -- the same as the 50% and 6% builds. The difference was never
 * density. It was packaging.
 *
 * So this keeps the structure the source has and the live site renders: 12
 * nodes, 12 meshes, 12 primitives, each welded, simplified and quantized over
 * its own bounds. Twelve draw calls instead of one, which is nothing next to the
 * triangle count.
 *
 *   node scripts/decimate-hero-split.mjs            # default ladder
 *   node scripts/decimate-hero-split.mjs 1.0 0.2    # explicit ratios
 *
 * Output: public/models/metal-letter-<pct>s.glb
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { MeshoptDecoder, MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(ROOT, 'public/models/metal-letter-opt.glb')
const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a
const CHUNK_BIN = 0x004e4942

// ---------------------------------------------------------------- read

function readGlb (path) {
  const buf = readFileSync(path)
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (dv.getUint32(0, true) !== GLB_MAGIC) throw new Error('not a GLB')
  let off = 12
  let json = null
  let bin = null
  while (off < buf.byteLength) {
    const len = dv.getUint32(off, true)
    const type = dv.getUint32(off + 4, true)
    off += 8
    const slice = new Uint8Array(buf.buffer, buf.byteOffset + off, len)
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(slice))
    else if (type === CHUNK_BIN) bin = slice
    off += len
  }
  return { json, bin }
}

function decodeViews (g, bin) {
  return g.bufferViews.map((bv) => {
    const ext = bv.extensions?.EXT_meshopt_compression
    if (!ext) return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
    const out = new Uint8Array(ext.count * ext.byteStride)
    const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength)
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter)
    return out
  })
}

const COMPONENT = {
  5120: { size: 1, max: 127, get: 'getInt8' },
  5121: { size: 1, max: 255, get: 'getUint8' },
  5122: { size: 2, max: 32767, get: 'getInt16' },
  5123: { size: 2, max: 65535, get: 'getUint16' },
  5125: { size: 4, max: 4294967295, get: 'getUint32' },
  5126: { size: 4, max: 1, get: 'getFloat32' },
}
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function readAccessor (g, views, index) {
  const acc = g.accessors[index]
  const comp = COMPONENT[acc.componentType]
  const n = COMPONENTS[acc.type]
  const view = views[acc.bufferView]
  const stride = g.bufferViews[acc.bufferView].byteStride || comp.size * n
  const base = acc.byteOffset ?? 0
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const out = new Float32Array(acc.count * n)
  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const v = dv[comp.get](base + i * stride + c * comp.size, true)
      out[i * n + c] = acc.normalized ? Math.max(v / comp.max, -1) : v
    }
  }
  return out
}

/** Each node's primitive as its own mesh, node transform baked in. */
function readParts (g, views) {
  const parts = []
  for (const node of g.nodes) {
    if (node.mesh === undefined) continue
    if (node.rotation || node.matrix) throw new Error('node rotation/matrix not supported')
    const [tx, ty, tz] = node.translation ?? [0, 0, 0]
    const [sx, sy, sz] = node.scale ?? [1, 1, 1]
    for (const prim of g.meshes[node.mesh].primitives) {
      const p = readAccessor(g, views, prim.attributes.POSITION)
      const n = readAccessor(g, views, prim.attributes.NORMAL)
      const t = readAccessor(g, views, prim.attributes.TEXCOORD_0)
      const f = readAccessor(g, views, prim.indices)
      const count = p.length / 3
      const positions = new Float32Array(count * 3)
      for (let v = 0; v < count; v++) {
        positions[v * 3] = p[v * 3] * sx + tx
        positions[v * 3 + 1] = p[v * 3 + 1] * sy + ty
        positions[v * 3 + 2] = p[v * 3 + 2] * sz + tz
      }
      const indices = new Uint32Array(f.length)
      for (let i = 0; i < f.length; i++) indices[i] = f[i]
      parts.push({ name: node.name ?? g.meshes[node.mesh].name, positions, normals: n, uvs: t, indices })
    }
  }
  return parts
}

// ---------------------------------------------------------------- process

function weld (mesh) {
  const { positions, normals, uvs, indices } = mesh
  const count = positions.length / 3
  const map = new Map()
  const remap = new Uint32Array(count)
  const p = []
  const n = []
  const t = []
  const q = (v) => Math.round(v * 1e6)
  for (let i = 0; i < count; i++) {
    const key =
      `${q(positions[i * 3])},${q(positions[i * 3 + 1])},${q(positions[i * 3 + 2])},` +
      `${q(normals[i * 3])},${q(normals[i * 3 + 1])},${q(normals[i * 3 + 2])},` +
      `${q(uvs[i * 2])},${q(uvs[i * 2 + 1])}`
    const hit = map.get(key)
    if (hit !== undefined) { remap[i] = hit; continue }
    const at = p.length / 3
    map.set(key, at)
    remap[i] = at
    p.push(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2])
    n.push(normals[i * 3], normals[i * 3 + 1], normals[i * 3 + 2])
    t.push(uvs[i * 2], uvs[i * 2 + 1])
  }
  const out = new Uint32Array(indices.length)
  for (let i = 0; i < indices.length; i++) out[i] = remap[indices[i]]
  return { ...mesh, positions: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(t), indices: out }
}

/** compactMesh rewrites indices IN PLACE and returns the vertex remap. */
function compact (mesh) {
  const { positions, normals, uvs, indices } = mesh
  const [remap, unique] = MeshoptSimplifier.compactMesh(indices)
  const p = new Float32Array(unique * 3)
  const n = new Float32Array(unique * 3)
  const t = new Float32Array(unique * 2)
  for (let i = 0; i < remap.length; i++) {
    const d = remap[i]
    if (d === 0xffffffff) continue
    p[d * 3] = positions[i * 3]; p[d * 3 + 1] = positions[i * 3 + 1]; p[d * 3 + 2] = positions[i * 3 + 2]
    n[d * 3] = normals[i * 3]; n[d * 3 + 1] = normals[i * 3 + 1]; n[d * 3 + 2] = normals[i * 3 + 2]
    t[d * 2] = uvs[i * 2]; t[d * 2 + 1] = uvs[i * 2 + 1]
  }
  return { ...mesh, positions: p, normals: n, uvs: t, indices }
}

function simplifyPart (part, ratio) {
  const welded = weld(part)
  if (ratio >= 1) return compact({ ...welded, indices: new Uint32Array(welded.indices) })
  const target = Math.max(3, Math.floor((welded.indices.length * ratio) / 3) * 3)
  const [indices] = MeshoptSimplifier.simplifyWithAttributes(
    welded.indices, welded.positions, 3, welded.normals, 3,
    [0.5, 0.5, 0.5], null, target, 1e-2, ['Prune'],
  )
  return compact({ ...welded, indices })
}

// ---------------------------------------------------------------- write

/**
 * One part's buffers, quantized over ITS OWN bounds exactly as the source
 * does, appended to the shared GLB state.
 */
function encodePart (mesh, state) {
  const { positions, normals, uvs, indices } = mesh
  const count = positions.length / 3
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i * 3 + c]
      if (v < min[c]) min[c] = v
      if (v > max[c]) max[c] = v
    }
  }
  const centre = [0, 1, 2].map((c) => (min[c] + max[c]) / 2)
  const half = Math.max(...[0, 1, 2].map((c) => (max[c] - min[c]) / 2)) || 1
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  const POS = 8
  const NRM = 4
  const UV = 4
  const posBytes = new Uint8Array(count * POS)
  const nrmBytes = new Uint8Array(count * NRM)
  const uvBytes = new Uint8Array(count * UV)
  const pv = new DataView(posBytes.buffer)
  const nv = new DataView(nrmBytes.buffer)
  const uvv = new DataView(uvBytes.buffer)
  // accessor min/max are the STORED integers, not what they decode to
  const rawMin = [Infinity, Infinity, Infinity]
  const rawMax = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      const q = clamp(Math.round(((positions[i * 3 + c] - centre[c]) / half) * 32767), -32767, 32767)
      rawMin[c] = Math.min(rawMin[c], q)
      rawMax[c] = Math.max(rawMax[c], q)
      pv.setInt16(i * POS + c * 2, q, true)
      nv.setInt8(i * NRM + c, clamp(Math.round(normals[i * 3 + c] * 127), -127, 127))
    }
    for (let c = 0; c < 2; c++) {
      uvv.setUint16(i * UV + c * 2, clamp(Math.round(uvs[i * 2 + c] * 65535), 0, 65535), true)
    }
  }

  let maxIndex = 0
  for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i]
  if (maxIndex >= count) throw new Error(`index ${maxIndex} out of range for ${count} vertices`)
  const idx16 = count <= 65536
  const idxBytes = new Uint8Array(indices.length * (idx16 ? 2 : 4))
  const iv = new DataView(idxBytes.buffer)
  for (let i = 0; i < indices.length; i++) {
    if (idx16) iv.setUint16(i * 2, indices[i], true)
    else iv.setUint32(i * 4, indices[i], true)
  }

  const blocks = [
    { bytes: posBytes, count, stride: POS, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: nrmBytes, count, stride: NRM, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: uvBytes, count, stride: UV, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: idxBytes, count: indices.length, stride: idx16 ? 2 : 4, mode: 'TRIANGLES', target: 34963 },
  ]
  const viewIndex = []
  for (const b of blocks) {
    const enc = MeshoptEncoder.encodeGltfBuffer(b.bytes, b.count, b.stride, b.mode)
    viewIndex.push(state.bufferViews.length)
    state.bufferViews.push({
      buffer: 1,
      byteOffset: state.fallbackOffset,
      byteLength: b.bytes.byteLength,
      byteStride: b.mode === 'ATTRIBUTES' ? b.stride : undefined,
      target: b.target,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: state.compressedOffset,
          byteLength: enc.byteLength,
          mode: b.mode,
          count: b.count,
          byteStride: b.stride,
        },
      },
    })
    state.compressed.push(enc)
    state.fallbackOffset += b.bytes.byteLength
    state.compressedOffset += enc.byteLength
    const pad = (4 - (state.compressedOffset % 4)) % 4
    if (pad) { state.compressed.push(new Uint8Array(pad)); state.compressedOffset += pad }
    // the fallback buffer is laid out 4-aligned too
    const fpad = (4 - (state.fallbackOffset % 4)) % 4
    state.fallbackOffset += fpad
  }

  const a = state.accessors.length
  state.accessors.push(
    { bufferView: viewIndex[0], componentType: 5122, normalized: true, count, type: 'VEC3', min: rawMin, max: rawMax },
    { bufferView: viewIndex[1], componentType: 5120, normalized: true, count, type: 'VEC3' },
    { bufferView: viewIndex[2], componentType: 5123, normalized: true, count, type: 'VEC2' },
    { bufferView: viewIndex[3], componentType: idx16 ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
  )
  return {
    primitive: { attributes: { POSITION: a, NORMAL: a + 1, TEXCOORD_0: a + 2 }, indices: a + 3, mode: 4 },
    translation: centre,
    half,
  }
}

function writeGlbParts (parts, path) {
  const state = { bufferViews: [], accessors: [], compressed: [], fallbackOffset: 0, compressedOffset: 0 }
  const nodes = []
  const meshes = []
  parts.forEach((part, i) => {
    const enc = encodePart(part, state)
    meshes.push({ name: part.name, primitives: [enc.primitive] })
    nodes.push({ name: part.name, mesh: i, translation: enc.translation, scale: [enc.half, enc.half, enc.half] })
  })
  const json = {
    asset: { generator: 'decimate-hero-split.mjs', version: '2.0' },
    extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    accessors: state.accessors,
    bufferViews: state.bufferViews,
    buffers: [
      { byteLength: state.compressedOffset },
      { byteLength: state.fallbackOffset, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
  }
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4
  const binLen = state.compressedOffset
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + binLen
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  let o = 0
  dv.setUint32(o, GLB_MAGIC, true); dv.setUint32(o + 4, 2, true); dv.setUint32(o + 8, total, true); o += 12
  dv.setUint32(o, jsonBytes.byteLength + jsonPad, true); dv.setUint32(o + 4, CHUNK_JSON, true); o += 8
  out.set(jsonBytes, o); o += jsonBytes.byteLength
  for (let i = 0; i < jsonPad; i++) out[o++] = 0x20
  dv.setUint32(o, binLen, true); dv.setUint32(o + 4, CHUNK_BIN, true); o += 8
  for (const block of state.compressed) { out.set(block, o); o += block.byteLength }
  writeFileSync(path, out)
  return out.byteLength
}

// ---------------------------------------------------------------- run

await MeshoptDecoder.ready
await MeshoptEncoder.ready
await MeshoptSimplifier.ready

const { json: g, bin } = readGlb(SRC)
const parts = readParts(g, decodeViews(g, bin))
const srcTris = parts.reduce((s, p) => s + p.indices.length / 3, 0)
console.log(`source  ${parts.length} parts  ${srcTris.toLocaleString()} tris`)

const ratios = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [1.0, 0.5, 0.3, 0.2, 0.12, 0.06]

for (const ratio of ratios) {
  const out = parts.map((p) => simplifyPart(p, ratio))
  const tris = out.reduce((s, p) => s + p.indices.length / 3, 0)
  const pct = Math.round(ratio * 100)
  const name = `metal-letter-${String(pct).padStart(2, '0')}s.glb`
  const bytes = writeGlbParts(out, join(ROOT, 'public/models', name))
  console.log(
    `${name.padEnd(24)} ${(bytes / 1e6).toFixed(2)} MB  ${tris.toLocaleString()} tris ` +
    `(${((tris / srcTris) * 100).toFixed(1)}%)  ${out.length} primitives`,
  )
}
