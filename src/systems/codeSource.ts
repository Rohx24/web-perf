import { DataTexture, NearestFilter, RedFormat, UnsignedByteType } from 'three'

import { CODE_CHARS } from './codeFont'

/**
 * What the wall is actually running.
 *
 * These are real lines, not generated filler, because the whole point of the
 * change was that patterns do not read as code. Something plausible has
 * indentation that means something, names that recur, and a shape the eye can
 * follow — and once it is real text anyway, it may as well say what this
 * portfolio is about.
 *
 * Uploaded as a texture of character indices rather than baked into the shader:
 * GLSL has no strings, and the CPU already owns the wall's other lookup tables
 * for the same reason. See ledPanels for the same pattern.
 */
const SOURCE = [
  'class Agent:',
  '    def __init__(self, name, tools, memory):',
  '        self.name = name',
  '        self.tools = tools',
  '        self.memory = memory',
  '',
  '    async def plan(self, goal: str) -> Plan:',
  '        ctx = await self.memory.recall(goal)',
  '        steps = await self.model.decompose(goal, ctx)',
  '        return Plan(steps=steps, owner=self.name)',
  '',
  '    async def act(self, plan: Plan) -> Result:',
  '        for step in plan.steps:',
  '            tool = self.tools.resolve(step.intent)',
  '            if tool is None:',
  '                yield self.delegate(step)',
  '                continue',
  '            out = await tool.run(**step.args)',
  '            self.memory.write(step, out)',
  '        return Result(ok=True, trace=plan.trace)',
  '',
  'async def orchestrate(goal, agents, budget=8):',
  '    queue = deque([Task(goal, depth=0)])',
  '    seen, results = set(), []',
  '',
  '    while queue and budget > 0:',
  '        task = queue.popleft()',
  '        if task.key in seen:',
  '            continue',
  '        seen.add(task.key)',
  '',
  '        agent = route(task, agents)',
  '        plan = await agent.plan(task.goal)',
  '        async for event in agent.act(plan):',
  '            if event.kind == "spawn":',
  '                queue.append(event.task)',
  '            results.append(event)',
  '        budget -= 1',
  '',
  '    return reduce(merge, results, Result.empty())',
  '',
  'def route(task, agents):',
  '    scored = [(a.fitness(task), a) for a in agents]',
  '    return max(scored, key=lambda pair: pair[0])[1]',
  '',
  '@retry(attempts=3, backoff=expo)',
  'async def call(model, prompt, **kw):',
  '    resp = await model.complete(prompt, **kw)',
  '    if resp.truncated:',
  '        raise Retry("hit the context ceiling")',
  '    return resp.text',
]

/**
 * The easter egg.
 *
 * Reached with the Konami code — chosen because nobody types it by accident,
 * which is the whole requirement for a thing meant to be found rather than
 * stumbled into. See LedWall for the listener.
 */
const SECRET = [
  '> konami accepted',
  '',
  'if you are reading this, you found it.',
  '',
  'this wall is one cylinder.',
  'there is no dot geometry anywhere in it:',
  'every emitter is computed per fragment,',
  'which is why it costs one draw call',
  'whether there are ten thousand or a million.',
  '',
  'the palette is generated, never listed,',
  'so an off-key colour is unwritable.',
  '',
  'the panel layout lives on the CPU,',
  'so a click and a light can never disagree.',
  '',
  'built by Rohit Diggi.',
  'thanks for looking closely.',
  '',
]

/** Longest line, rounded up — every row is padded to this. */
export const CODE_COLS = 52
export const CODE_ROWS = SOURCE.length
export const SECRET_ROWS = SECRET.length
/** Where the hidden block starts, in rows. */
export const SECRET_START = CODE_ROWS

/**
 * Both blocks in one texture, the hidden one after the visible one, so the
 * easter egg is a change of offset rather than a texture swap — nothing is
 * reallocated when it fires, and it cannot hitch on the frame it triggers.
 */
export function buildCodeText(): DataTexture {
  const rows = CODE_ROWS + SECRET_ROWS
  const data = new Uint8Array(CODE_COLS * rows)

  const write = (line: string, row: number) => {
    for (let col = 0; col < CODE_COLS; col++) {
      const index = CODE_CHARS.indexOf(line[col] ?? ' ')
      // Anything the font does not carry falls back to a space rather than to
      // glyph zero, which would print a stray character with no way to trace it.
      data[row * CODE_COLS + col] = index < 0 ? 0 : index
    }
  }

  SOURCE.forEach((line, row) => write(line, row))
  SECRET.forEach((line, row) => write(line, CODE_ROWS + row))

  const texture = new DataTexture(
    data,
    CODE_COLS,
    rows,
    RedFormat,
    UnsignedByteType,
  )
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.flipY = false
  texture.needsUpdate = true

  return texture
}
