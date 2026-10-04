import { Liquid } from '../../../src/liquid'
import { Context } from '../../../src/context'
import { mock, restore } from '../../stub/mockfs'

describe('catchAllErrors in nested blocks', function () {
  afterEach(restore)

  function createEngine () {
    const marks: unknown[] = []
    const engine = new Liquid({
      root: '/',
      strictVariables: true,
      strictFilters: true,
      catchAllErrors: true
    })
    engine.registerFilter('mark', (v: unknown) => {
      marks.push(v)
      return v
    })
    return { engine, marks }
  }

  describe('for', function () {
    const src = '{% for i in (1..3) %}{{ i }}{{ nope }}{% endfor %}after{{ nope2 }}'
    it('should flatten errors from every iteration', async function () {
      const { engine } = createEngine()
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '4 errors found, line:1, col:32',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: nope, line:1, col:32' },
          { name: 'UndefinedVariableError', message: 'undefined variable: nope, line:1, col:32' },
          { name: 'UndefinedVariableError', message: 'undefined variable: nope, line:1, col:32' },
          { name: 'UndefinedVariableError', message: 'undefined variable: nope2, line:1, col:59' }
        ]
      })
    })
    it('should flatten errors from every iteration (sync)', function () {
      const { engine } = createEngine()
      expect(() => engine.parseAndRenderSync(src)).toThrow(
        expect.objectContaining({
          name: 'LiquidErrors',
          errors: [
            expect.objectContaining({ name: 'UndefinedVariableError' }),
            expect.objectContaining({ name: 'UndefinedVariableError' }),
            expect.objectContaining({ name: 'UndefinedVariableError' }),
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: nope2, line:1, col:59' })
          ]
        })
      )
    })
    it('should keep rendering remaining iterations after an error', async function () {
      const { engine, marks } = createEngine()
      await expect(engine.parseAndRender('{% for i in (1..3) %}{{ i | mark }}{{ nope }}{% endfor %}')).rejects.toMatchObject({
        name: 'LiquidErrors'
      })
      expect(marks).toEqual([1, 2, 3])
    })
  })

  describe('if', function () {
    const src = '{% if true %}x{{ n1 }}y{% endif %}z{{ n2 }}'
    it('should flatten errors inside the branch', async function () {
      const { engine } = createEngine()
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '2 errors found, line:1, col:18',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: n1, line:1, col:18' },
          { name: 'UndefinedVariableError', message: 'undefined variable: n2, line:1, col:39' }
        ]
      })
    })
    it('should flatten errors inside the branch (sync)', function () {
      const { engine } = createEngine()
      expect(() => engine.parseAndRenderSync(src)).toThrow(
        expect.objectContaining({
          name: 'LiquidErrors',
          errors: [
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: n1, line:1, col:18' }),
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: n2, line:1, col:39' })
          ]
        })
      )
    })
    it('should keep rendering the branch after an error', async function () {
      const { engine, marks } = createEngine()
      await expect(engine.parseAndRender('{% if true %}{{ n1 }}{{ "y" | mark }}{% endif %}')).rejects.toMatchObject({
        name: 'LiquidErrors'
      })
      expect(marks).toEqual(['y'])
    })
  })

  describe('capture', function () {
    const src = '{% capture c %}1{{ n1 }}2{% endcapture %}[{{ c }}]{{ n2 }}'
    it('should not report the captured variable as undefined', async function () {
      const { engine } = createEngine()
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '2 errors found, line:1, col:20',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: n1, line:1, col:20' },
          { name: 'UndefinedVariableError', message: 'undefined variable: n2, line:1, col:54' }
        ]
      })
    })
    it('should not report the captured variable as undefined (sync)', function () {
      const { engine } = createEngine()
      expect(() => engine.parseAndRenderSync(src)).toThrow(
        expect.objectContaining({
          name: 'LiquidErrors',
          errors: [
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: n1, line:1, col:20' }),
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: n2, line:1, col:54' })
          ]
        })
      )
    })
    it('should still assign the captured content', async function () {
      const { engine, marks } = createEngine()
      await expect(engine.parseAndRender('{% capture c %}1{{ n1 }}2{% endcapture %}{{ c | mark }}')).rejects.toMatchObject({
        name: 'LiquidErrors'
      })
      expect(marks).toEqual(['12'])
    })
  })

  describe('include/render', function () {
    const src = '{% include "card.liquid" %},{% render "card.liquid" %},{{ n4 }}'
    beforeEach(function () {
      mock({ '/card.liquid': 'P{{ missing_in_partial }}P' })
    })
    it('should flatten errors from partials with their own position', async function () {
      const { engine } = createEngine()
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '3 errors found, file:/card.liquid, line:1, col:5',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' },
          { name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' },
          { name: 'UndefinedVariableError', message: 'undefined variable: n4, line:1, col:59' }
        ]
      })
    })
    it('should flatten errors from partials with their own position (sync)', function () {
      const { engine } = createEngine()
      expect(() => engine.parseAndRenderSync(src)).toThrow(
        expect.objectContaining({
          name: 'LiquidErrors',
          errors: [
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' }),
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' }),
            expect.objectContaining({ name: 'UndefinedVariableError', message: 'undefined variable: n4, line:1, col:59' })
          ]
        })
      )
    })
    it('should flatten parse errors from partials', async function () {
      mock({ '/broken.liquid': '{{ "foo" | nonExistFilter }}' })
      const { engine } = createEngine()
      await expect(engine.parseAndRender('{% include "broken.liquid" %}{{ n4 }}')).rejects.toMatchObject({
        name: 'LiquidErrors',
        errors: [
          { name: 'ParseError', message: 'undefined filter: nonExistFilter, file:/broken.liquid, line:1, col:1' },
          { name: 'UndefinedVariableError', message: 'undefined variable: n4, line:1, col:33' }
        ]
      })
    })
    it('should flatten errors from every iteration of {% render %} with for', async function () {
      const { engine } = createEngine()
      await expect(engine.parseAndRender('{% render "card.liquid" for (1..3) %}')).rejects.toMatchObject({
        name: 'LiquidErrors',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' },
          { name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' },
          { name: 'UndefinedVariableError', message: 'undefined variable: missing_in_partial, file:/card.liquid, line:1, col:5' }
        ]
      })
    })
  })

  describe('nested blocks', function () {
    it('should flatten errors from deeply nested blocks', async function () {
      const { engine } = createEngine()
      const src = '{% if true %}{% for i in (1..2) %}{{ nope }}{% endfor %}{% endif %}{{ n2 }}'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '3 errors found, line:1, col:38',
        errors: [
          { name: 'UndefinedVariableError', message: 'undefined variable: nope, line:1, col:38' },
          { name: 'UndefinedVariableError', message: 'undefined variable: nope, line:1, col:38' },
          { name: 'UndefinedVariableError', message: 'undefined variable: n2, line:1, col:71' }
        ]
      })
    })
  })

  describe('when catchAllErrors is not enabled', function () {
    const engine = new Liquid({ strictVariables: true })
    it('should stop at the first error and throw the original error', async function () {
      const src = '{% for i in (1..3) %}{{ i }}{{ nope }}{% endfor %}after{{ nope2 }}'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'UndefinedVariableError',
        message: 'undefined variable: nope, line:1, col:32'
      })
      await expect(engine.parseAndRender(src)).rejects.not.toHaveProperty('errors')
    })
    it('should stop at the first error and throw the original error (sync)', function () {
      const src = '{% if true %}x{{ n1 }}y{% endif %}z{{ n2 }}'
      expect(() => engine.parseAndRenderSync(src)).toThrow(
        expect.objectContaining({
          name: 'UndefinedVariableError',
          message: 'undefined variable: n1, line:1, col:18'
        })
      )
      expect(() => engine.parseAndRenderSync(src)).not.toThrow(
        expect.objectContaining({ name: 'LiquidErrors' })
      )
    })
  })

  describe('rendering without errors', function () {
    it('should render blocks normally', async function () {
      const { engine } = createEngine()
      const html = await engine.parseAndRender('{% for i in (1..3) %}{{ i }}{% endfor %}')
      expect(html).toBe('123')
    })
    it('should render blocks normally (sync)', function () {
      const { engine } = createEngine()
      const html = engine.parseAndRenderSync('{% if true %}a{% endif %}{% capture c %}b{% endcapture %}{{ c }}')
      expect(html).toBe('ab')
    })
    it('should not interfere with break/continue', async function () {
      const { engine } = createEngine()
      const html = await engine.parseAndRender('{% for i in (1..5) %}{% if i == 3 %}{% break %}{% endif %}{{ i }}{% endfor %}')
      expect(html).toBe('12')
    })
    it('should collect errors afresh when a Context is reused', async function () {
      const { engine } = createEngine()
      const ctx = new Context({}, engine.options)
      for (let i = 0; i < 2; i++) {
        await expect(engine.render(engine.parse('{% if true %}{{ nope }}{% endif %}'), ctx)).rejects.toMatchObject({
          name: 'LiquidErrors',
          errors: [{ name: 'UndefinedVariableError' }]
        })
      }
      await expect(engine.render(engine.parse('ok{{ 1 }}'), ctx)).resolves.toBe('ok1')
    })
  })
})
