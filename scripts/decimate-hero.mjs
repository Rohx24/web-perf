/**
 * Decimate the hero mark.
 *
 * The mark is 465,812 triangles across 12 meshes — 99.3% of every triangle the
 * site draws. The other 3,336 are the entire room, wall, panels, grid,
 * typography, glass and frames put together. Measured on a running instance,
 * cutting the mark's density is the only change that removes the frame-time
 * tail: dropping transmission resolution does nothing, and even disabling
 * transmission outright helps less than thinning the geometry.
 *
 * Three things happen here, and the second two are free:
 *
 *   1. Simplify, with normals as a weighted attribute so the silhouette and the
 *      shading breaks survive — this material is refractive, so normals are the
 *      whole look.
 *   2. Merge 12 primitives into 1. Every imported material is replaced by a
 *      single shared glass material at load (HeroSystem), so the 12 draw calls
 *      buy nothing.
 *   3. Drop the 36 textures. Same reason: they are discarded at load, so today
 *      they are download and decode cost for pixels nobody sees.
 *
 * Node transforms are baked, so the merged bounds are identical to the
 * original's and HeroSystem's fit-to-height logic lands in exactly the
 * same place.
 *
 *   node scripts/decimate-hero.mjs                  # default ladder
 *   node scripts/decimate-hero.mjs 0.25 0.1         # explicit ratios
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

/** Every bufferView as raw bytes, meshopt-decoded where the extension says so. */
function decodeViews (g, bin) {
  return g.bufferViews.map((bv) => {
    const ext = bv.extensions?.EXT_meshopt_compression
    if (!ext) {
      // uncompressed views live in the BIN chunk
      return bin.subarray(bv.byteOffset ?? 0, (bv.byteOffset ?? 0) + bv.byteLength)
    }
    const out = new Uint8Array(ext.count * ext.byteStride)
    const src = bin.subarray(ext.byteOffset ?? 0, (ext.byteOffset ?? 0) + ext.byteLength)
    MeshoptDecoder.decodeGltfBuffer(out, ext.count, ext.byteStride, src, ext.mode, ext.filter)
    return out
  })
}

const COMPONENT = {
  5120: { array: Int8Array, size: 1, max: 127 },
  5121: { array: Uint8Array, size: 1, max: 255 },
  5122: { array: Int16Array, size: 2, max: 32767 },
  5123: { array: Uint16Array, size: 2, max: 65535 },
  5125: { array: Uint32Array, size: 4, max: 4294967295 },
  5126: { array: Float32Array, size: 4, max: 1 },
}
const COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

/** An accessor as Float32Array, dequantized (KHR_mesh_quantization). */
function readAccessor (g, views, index) {
  const acc = g.accessors[index]
  const comp = COMPONENT[acc.componentType]
  const n = COMPONENTS[acc.type]
  const view = views[acc.bufferView]
  const stride = g.bufferViews[acc.bufferView].byteStride || comp.size * n
  const base = acc.byteOffset ?? 0
  const out = new Float32Array(acc.count * n)
  const dv = new DataView(view.buffer, view.byteOffset, view.byteLength)
  const get = {
    5120: (o) => dv.getInt8(o),
    5121: (o) => dv.getUint8(o),
    5122: (o) => dv.getInt16(o, true),
    5123: (o) => dv.getUint16(o, true),
    5125: (o) => dv.getUint32(o, true),
    5126: (o) => dv.getFloat32(o, true),
  }[acc.componentType]

  for (let i = 0; i < acc.count; i++) {
    for (let c = 0; c < n; c++) {
      const v = get(base + i * stride + c * comp.size)
      out[i * n + c] = acc.normalized ? Math.max(v / comp.max, -1) : v
    }
  }
  return out
}

/** Indices as Uint32Array. */
function readIndices (g, views, index) {
  const f = readAccessor(g, views, index)
  const out = new Uint32Array(f.length)
  for (let i = 0; i < f.length; i++) out[i] = f[i]
  return out
}

// ---------------------------------------------------------------- merge

/**
 * All 12 primitives into one vertex stream, with each node's translation and
 * uniform scale baked in. No rotations in this file, so normals pass through
 * untouched.
 */
function mergeScene (g, views) {
  const pos = []
  const nrm = []
  const uv = []
  const idx = []
  let vertexBase = 0

  for (const node of g.nodes) {
    if (node.mesh === undefined) continue
    if (node.rotation || node.matrix) throw new Error('node has rotation/matrix; baking not implemented')
    const [tx, ty, tz] = node.translation ?? [0, 0, 0]
    const [sx, sy, sz] = node.scale ?? [1, 1, 1]

    for (const prim of g.meshes[node.mesh].primitives) {
      const p = readAccessor(g, views, prim.attributes.POSITION)
      const n = prim.attributes.NORMAL !== undefined
        ? readAccessor(g, views, prim.attributes.NORMAL)
        : new Float32Array(p.length)
      const t = prim.attributes.TEXCOORD_0 !== undefined
        ? readAccessor(g, views, prim.attributes.TEXCOORD_0)
        : new Float32Array((p.length / 3) * 2)
      const i = readIndices(g, views, prim.indices)

      const count = p.length / 3
      for (let v = 0; v < count; v++) {
        pos.push(p[v * 3] * sx + tx, p[v * 3 + 1] * sy + ty, p[v * 3 + 2] * sz + tz)
        nrm.push(n[v * 3], n[v * 3 + 1], n[v * 3 + 2])
        uv.push(t[v * 2], t[v * 2 + 1])
      }
      for (let k = 0; k < i.length; k++) idx.push(i[k] + vertexBase)
      vertexBase += count
    }
  }

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nrm),
    uvs: new Float32Array(uv),
    indices: new Uint32Array(idx),
  }
}

/** Collapse vertices identical in every attribute — the 12 parts share seams. */
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
  return {
    positions: new Float32Array(p),
    normals: new Float32Array(n),
    uvs: new Float32Array(t),
    indices: out,
  }
}

/** Drop vertices no triangle references any more, after simplification. */
function compact (mesh) {
  const { positions, normals, uvs, indices } = mesh
  /* compactMesh rewrites `indices` IN PLACE and returns the vertex remap for
     the attribute arrays. Applying that remap to the indices as well — which
     reads as the obvious thing to do — remaps them twice and lands most of
     them on 0xffffffff. */
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
  return { positions: p, normals: n, uvs: t, indices }
}

/**
 * How often a triangle's geometric facing matches its own vertex normals.
 *
 * Back-face culling makes a wound-backwards mesh invisible rather than wrong-
 * looking, so this is worth asserting rather than eyeballing.
 */
function windingAgreement (mesh) {
  const { positions: p, normals: n, indices } = mesh
  let agree = 0
  const total = Math.min(20000, indices.length / 3)
  for (let t = 0; t < total; t++) {
    const a = indices[t * 3], b = indices[t * 3 + 1], c = indices[t * 3 + 2]
    const ux = p[b * 3] - p[a * 3]
    const uy = p[b * 3 + 1] - p[a * 3 + 1]
    const uz = p[b * 3 + 2] - p[a * 3 + 2]
    const vx = p[c * 3] - p[a * 3]
    const vy = p[c * 3 + 1] - p[a * 3 + 1]
    const vz = p[c * 3 + 2] - p[a * 3 + 2]
    const fx = uy * vz - uz * vy
    const fy = uz * vx - ux * vz
    const fz = ux * vy - uy * vx
    if (fx * n[a * 3] + fy * n[a * 3 + 1] + fz * n[a * 3 + 2] > 0) agree++
  }
  return agree / total
}

// ---------------------------------------------------------------- write

/**
 * One node, one mesh, one primitive, no materials, no textures — quantized the
 * same way the source was (KHR_mesh_quantization) and meshopt-compressed.
 */
function writeGlb (mesh, path) {
  const { positions, normals, uvs, indices } = mesh
  const count = positions.length / 3

  // symmetric int16 normalized, with the node carrying centre + half-extent
  let min = [Infinity, Infinity, Infinity]
  let max = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      const v = positions[i * 3 + c]
      if (v < min[c]) min[c] = v
      if (v > max[c]) max[c] = v
    }
  }
  const centre = [0, 1, 2].map((c) => (min[c] + max[c]) / 2)
  const half = Math.max(...[0, 1, 2].map((c) => (max[c] - min[c]) / 2)) || 1

  const POS_STRIDE = 8 // 3 x int16 + 2 pad
  const NRM_STRIDE = 4 // 3 x int8  + 1 pad
  const UV_STRIDE = 4 // 2 x uint16
  const posBytes = new Uint8Array(count * POS_STRIDE)
  const nrmBytes = new Uint8Array(count * NRM_STRIDE)
  const uvBytes = new Uint8Array(count * UV_STRIDE)
  const posView = new DataView(posBytes.buffer)
  const nrmView = new DataView(nrmBytes.buffer)
  const uvView = new DataView(uvBytes.buffer)
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

  /* accessor min/max are the values AS STORED — the raw quantized integers —
     not what they decode to. Writing the decoded floats here makes every
     consumer's bounds 32767x too small, and the only visible symptom is that
     anything fitting the model to a target size scales it into orbit. */
  const rawMin = [Infinity, Infinity, Infinity]
  const rawMax = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < count; i++) {
    for (let c = 0; c < 3; c++) {
      const v = (positions[i * 3 + c] - centre[c]) / half
      const q = clamp(Math.round(v * 32767), -32767, 32767)
      rawMin[c] = Math.min(rawMin[c], q)
      rawMax[c] = Math.max(rawMax[c], q)
      posView.setInt16(i * POS_STRIDE + c * 2, q, true)
      nrmView.setInt8(i * NRM_STRIDE + c, clamp(Math.round(normals[i * 3 + c] * 127), -127, 127))
    }
    for (let c = 0; c < 2; c++) {
      uvView.setUint16(i * UV_STRIDE + c * 2, clamp(Math.round(uvs[i * 2 + c] * 65535), 0, 65535), true)
    }
  }

  let maxIndex = 0
  for (let i = 0; i < indices.length; i++) if (indices[i] > maxIndex) maxIndex = indices[i]
  if (maxIndex >= count) throw new Error(`index ${maxIndex} out of range for ${count} vertices`)

  const idx16 = count <= 65536
  const idxBytes = new Uint8Array(indices.length * (idx16 ? 2 : 4))
  const idxView = new DataView(idxBytes.buffer)
  for (let i = 0; i < indices.length; i++) {
    if (idx16) idxView.setUint16(i * 2, indices[i], true)
    else idxView.setUint32(i * 4, indices[i], true)
  }

  const parts = [
    { bytes: posBytes, count, stride: POS_STRIDE, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: nrmBytes, count, stride: NRM_STRIDE, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: uvBytes, count, stride: UV_STRIDE, mode: 'ATTRIBUTES', target: 34962 },
    { bytes: idxBytes, count: indices.length, stride: idx16 ? 2 : 4, mode: 'TRIANGLES', target: 34963 },
  ]

  const compressed = []
  const bufferViews = []
  let fallbackOffset = 0
  let compressedOffset = 0
  for (const part of parts) {
    const enc = MeshoptEncoder.encodeGltfBuffer(part.bytes, part.count, part.stride, part.mode)
    bufferViews.push({
      buffer: 1,
      byteOffset: fallbackOffset,
      byteLength: part.bytes.byteLength,
      byteStride: part.mode === 'ATTRIBUTES' ? part.stride : undefined,
      target: part.target,
      extensions: {
        EXT_meshopt_compression: {
          buffer: 0,
          byteOffset: compressedOffset,
          byteLength: enc.byteLength,
          mode: part.mode,
          count: part.count,
          byteStride: part.stride,
        },
      },
    })
    compressed.push(enc)
    fallbackOffset += part.bytes.byteLength
    compressedOffset += enc.byteLength
    // meshopt requires each compressed block to start 4-byte aligned
    const pad = (4 - (compressedOffset % 4)) % 4
    if (pad) { compressed.push(new Uint8Array(pad)); compressedOffset += pad }
  }

  const json = {
    asset: { generator: 'decimate-hero.mjs', version: '2.0' },
    extensionsUsed: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    extensionsRequired: ['EXT_meshopt_compression', 'KHR_mesh_quantization'],
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: centre, scale: [half, half, half] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, mode: 4 }] }],
    accessors: [
      {
        bufferView: 0, componentType: 5122, normalized: true, count, type: 'VEC3',
        min: rawMin, max: rawMax,
      },
      { bufferView: 1, componentType: 5120, normalized: true, count, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, normalized: true, count, type: 'VEC2' },
      { bufferView: 3, componentType: idx16 ? 5123 : 5125, count: indices.length, type: 'SCALAR' },
    ],
    bufferViews,
    buffers: [
      { byteLength: compressedOffset },
      { byteLength: fallbackOffset, extensions: { EXT_meshopt_compression: { fallback: true } } },
    ],
  }

  const jsonBytes = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = (4 - (jsonBytes.byteLength % 4)) % 4
  const binPad = (4 - (compressedOffset % 4)) % 4
  const total = 12 + 8 + jsonBytes.byteLength + jsonPad + 8 + compressedOffset + binPad
  const out = new Uint8Array(total)
  const dv = new DataView(out.buffer)
  let o = 0
  dv.setUint32(o, GLB_MAGIC, true); dv.setUint32(o + 4, 2, true); dv.setUint32(o + 8, total, true); o += 12
  dv.setUint32(o, jsonBytes.byteLength + jsonPad, true); dv.setUint32(o + 4, CHUNK_JSON, true); o += 8
  out.set(jsonBytes, o); o += jsonBytes.byteLength
  for (let i = 0; i < jsonPad; i++) out[o++] = 0x20
  dv.setUint32(o, compressedOffset + binPad, true); dv.setUint32(o + 4, CHUNK_BIN, true); o += 8
  for (const block of compressed) { out.set(block, o); o += block.byteLength }
  o += binPad

  writeFileSync(path, out)
  return out.byteLength
}

// ---------------------------------------------------------------- run

await MeshoptDecoder.ready
await MeshoptEncoder.ready
await MeshoptSimplifier.ready

const { json: g, bin } = readGlb(SRC)
const views = decodeViews(g, bin)
const merged = weld(mergeScene(g, views))
const srcTris = merged.indices.length / 3
const srcBytes = readFileSync(SRC).byteLength

console.log(`source   ${(srcBytes / 1e6).toFixed(2)} MB  ${srcTris.toLocaleString()} tris  ` +
  `${(merged.positions.length / 3).toLocaleString()} verts  12 primitives, 36 textures  ` +
  `winding ${(windingAgreement(merged) * 100).toFixed(0)}%`)
console.log('')

const ratios = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [0.5, 0.3, 0.2, 0.12, 0.06]

for (const ratio of ratios) {
  const target = Math.floor((merged.indices.length * ratio) / 3) * 3
  // normals weighted so shading breaks and the silhouette survive; this is a
  // refractive material, so the normals ARE the look
  const [indices, error] = MeshoptSimplifier.simplifyWithAttributes(
    merged.indices,
    merged.positions, 3,
    merged.normals, 3,
    [0.5, 0.5, 0.5],
    null,
    target,
    1e-2,
    ['Prune'],
  )
  const out = compact({ ...merged, indices })
  const pct = Math.round(ratio * 100)
  const name = `metal-letter-${String(pct).padStart(2, '0')}.glb`
  const bytes = writeGlb(out, join(ROOT, 'public/models', name))
  const tris = out.indices.length / 3
  console.log(
    `${name}  ${(bytes / 1e6).toFixed(2)} MB  ${tris.toLocaleString()} tris ` +
    `(${((tris / srcTris) * 100).toFixed(1)}% of source)  ` +
    `${(out.positions.length / 3).toLocaleString()} verts  error ${(error * 100).toFixed(2)}%  ` +
    `winding ${(windingAgreement(out) * 100).toFixed(0)}%`,
  )
}
