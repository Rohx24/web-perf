/**
 * Static check on the GLSL carried in template literals.
 *
 * Both faults this catches fail the same way from the outside: the shader does
 * not compile, the mesh draws nothing, and the room goes black. That reads as a
 * *brightness* problem, so the instinct is to go tuning levels and palettes —
 * which is exactly the wrong place, and has cost this project real time more
 * than once. The console says precisely what is wrong; this says it sooner.
 *
 *   node scripts/audit-shaders.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SYSTEMS = 'src/systems'

/**
 * Reserved in GLSL ES 1.00. Declaring one is a hard compile error — the whole
 * shader is rejected, not just the line.
 */
const RESERVED = [
  'active', 'asm', 'cast', 'class', 'common', 'double', 'enum', 'extern',
  'external', 'filter', 'fixed', 'flat', 'goto', 'half', 'image', 'inline',
  'input', 'interface', 'long', 'namespace', 'noinline', 'output', 'packed',
  'partition', 'public', 'resource', 'row_major', 'short', 'sizeof', 'static',
  'superp', 'template', 'this', 'typedef', 'union', 'unsigned', 'using',
  'volatile',
]

/**
 * Built-in functions. Declaring a local of the same name is *legal*, so this is
 * a trap rather than an error: it compiles until something further down calls
 * the built-in, and then the error points at the call, not at the shadowing.
 */
const BUILTINS = [
  'abs', 'ceil', 'clamp', 'cross', 'degrees', 'distance', 'dot', 'exp',
  'faceforward', 'floor', 'fract', 'fwidth', 'inversesqrt', 'length', 'log',
  'matrixCompMult', 'max', 'min', 'mix', 'mod', 'normalize', 'pow', 'radians',
  'reflect', 'refract', 'sign', 'smoothstep', 'sqrt', 'step', 'texture2D',
]

const DECLARATION = /^\s*(?:float|int|uint|vec[234]|ivec[234]|bvec[234]|mat[234]|bool|void)\s+([A-Za-z_]\w*)/

/** The spans of every /* glsl *​/ template literal in a file, as line numbers. */
function glslRanges(source) {
  const lines = source.split('\n')
  const ranges = []
  let start = null

  lines.forEach((line, i) => {
    if (start === null) {
      if (/\/\*\s*glsl\s*\*\/\s*`/.test(line)) start = i + 1
    } else if (/^\s*`/.test(line)) {
      ranges.push([start, i])
      start = null
    }
  })

  return ranges
}

let failures = 0

for (const file of readdirSync(SYSTEMS).filter((n) => /shader/i.test(n))) {
  const source = readFileSync(join(SYSTEMS, file), 'utf8')
  const lines = source.split('\n')

  for (const [from, to] of glslRanges(source)) {
    for (let i = from; i < to; i++) {
      const line = lines[i]
      const at = `${file}:${i + 1}`

      // A backtick anywhere inside the literal — comments included — closes it
      // early. The build then breaks somewhere unrelated, because the rest of
      // the GLSL is being parsed as JavaScript.
      if (line.includes('`')) {
        console.error(`${at}  backtick inside GLSL — closes the template literal`)
        failures++
      }

      const declared = line.match(DECLARATION)?.[1]
      if (!declared) continue

      if (RESERVED.includes(declared)) {
        console.error(`${at}  declares reserved word "${declared}" — shader will not compile`)
        failures++
      } else if (BUILTINS.includes(declared)) {
        console.error(`${at}  declares "${declared}", shadowing the built-in of that name`)
        failures++
      }
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} problem${failures === 1 ? '' : 's'} found.`)
  process.exit(1)
}

console.log('Shaders clean.')
