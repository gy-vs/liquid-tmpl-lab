import { RenderError } from '../../../src/util/error'
import { Liquid } from '../../../src/liquid'
import { resolve } from 'path'
import { mock, restore } from '../../stub/mockfs'
import { throwIntendedError, rejectIntendedError } from '../../stub/util'

const strictEngine = new Liquid({
  strictVariables: true,
  strictFilters: true
})
const strictCatchingEngine = new Liquid({
  catchAllErrors: true,
  strictVariables: true,
  strictFilters: true
})
strictEngine.registerTag('throwingTag', { render: throwIntendedError })
strictEngine.registerFilter('throwingFilter', throwIntendedError)
strictCatchingEngine.registerTag('throwingTag', { render: throwIntendedError })
strictCatchingEngine.registerFilter('throwingFilter', throwIntendedError)

describe('error', function () {
  afterEach(restore)

  describe('TokenizationError', function () {
    const engine = new Liquid()
    it('should throw TokenizationError when tag illegal', async function () {
      await expect(engine.parseAndRender('{% . a %}', {})).rejects.toMatchObject({
        name: 'TokenizationError',
        message: expect.stringContaining('illegal tag syntax')
      })
    })
    it('should contain template content in err.message', async function () {
      const html = ['1st', '2nd', 'X{% . a %} Y', '4th']
      const message = [
        '   1| 1st',
        '   2| 2nd',
        '>> 3| X{% . a %} Y',
        '          ^',
        '   4| 4th',
        'TokenizationError'
      ]
      await expect(engine.parseAndRender(html.join('\n'))).rejects.toMatchObject({
        message: 'illegal tag syntax, tag name expected, line:3, col:5',
        stack: expect.stringContaining(message.join('\n')),
        name: 'TokenizationError'
      })
    })
    it('should contain the whole template content in err.token.input', async function () {
      const html = 'bar\nfoo{% . a %}\nfoo'
      await expect(engine.parseAndRender(html)).rejects.toMatchObject({
        token: expect.objectContaining({
          input: html
        })
      })
    })
    it('should contain stack in err.stack', async function () {
      await expect(engine.parseAndRender('{% . a %}')).rejects.toMatchObject({
        message: expect.stringContaining('illegal tag syntax'),
        stack: expect.stringContaining('at Liquid.parse')
      })
    })
    describe('captureStackTrace compatibility', function () {
      it('should be empty when captureStackTrace undefined', async function () {
        await expect(engine.parseAndRender('{% . a %}')).rejects.toMatchObject({
          stack: expect.stringContaining('illegal tag syntax')
        })
        await expect(engine.parseAndRender('{% . a %}')).rejects.toMatchObject({
          stack: expect.not.stringContaining('at Object.parse')
        })
      })
    })
    it('should throw error with [line, col] if tag unmatched', async function () {
      await expect(engine.parseAndRender('1\n2\nfoo{% assign a = 4 }\n4')).rejects.toMatchObject({
        name: 'TokenizationError',
        message: 'tag "{% assign a = 4 }\\n4" not closed, line:3, col:4'
      })
    })
  })

  describe('RenderError', function () {
    let engine: Liquid
    beforeEach(function () {
      engine = new Liquid({
        root: '/'
      })
      engine.registerTag('throwingTag', { render: throwIntendedError })
      engine.registerTag('rejectingTag', { render: rejectIntendedError })
      engine.registerFilter('throwingFilter', throwIntendedError)
    })
    it('should throw RenderError when tag throws', async function () {
      const src = '{%throwingTag%}'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'RenderError',
        message: expect.stringContaining('intended error')
      })
    })
    it('should throw RenderError when tag rejects', async function () {
      const src = '{%rejectingTag%}'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'RenderError',
        message: expect.stringContaining('intended reject')
      })
    })
    it('should throw RenderError when filter throws', async function () {
      const src = '{{1|throwingFilter}}'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'RenderError',
        message: expect.stringContaining('intended error')
      })
    })
    it('should not throw when variable undefined by default', async function () {
      const html = await engine.parseAndRender('X{{a}}Y')
      return expect(html).toBe('XY')
    })
    it('should throw RenderError when variable not defined', async function () {
      await expect(strictEngine.parseAndRender('{{a}}')).rejects.toMatchObject({
        name: 'UndefinedVariableError',
        message: 'undefined variable: a, line:1, col:3'
      })
    })
    it('should contain template context in err.stack', async function () {
      const html = ['1st', '2nd', '3rd', 'X{%throwingTag%} Y', '5th', '6th', '7th']
      const message = [
        '   2| 2nd',
        '   3| 3rd',
        '>> 4| X{%throwingTag%} Y',
        '       ^',
        '   5| 5th',
        '   6| 6th',
        '   7| 7th',
        'RenderError'
      ]
      await expect(engine.parseAndRender(html.join('\n'))).rejects.toMatchObject({
        name: 'RenderError',
        message: 'intended error, line:4, col:2',
        stack: expect.stringContaining(message.join('\n'))
      })
    })
    it('should contain original error info for {% layout %}', async function () {
      mock({
        '/throwing-tag.html': [
          '1st',
          '2nd',
          '3rd',
          'X{%throwingTag%} Y',
          '5th',
          '{%block%}{%endblock%}',
          '7th'
        ].join('\n')
      })
      const html = '{%layout "throwing-tag.html"%}'
      const message = [
        '   2| 2nd',
        '   3| 3rd',
        '>> 4| X{%throwingTag%} Y',
        '       ^',
        '   5| 5th',
        '   6| {%block%}{%endblock%}',
        '   7| 7th',
        'RenderError'
      ]
      await expect(engine.parseAndRender(html)).rejects.toMatchObject({
        name: 'RenderError',
        message: `intended error, file:${resolve('/throwing-tag.html')}, line:4, col:2`,
        stack: expect.stringContaining(message.join('\n'))
      })
    })
    it('should contain original error info for {% include %}', async function () {
      const origin = ['1st', '2nd', '3rd', 'X{%throwingTag%} Y', '5th', '6th', '7th']
      mock({
        '/throwing-tag.html': origin.join('\n')
      })
      const html = '{%include "throwing-tag.html"%}'
      const message = [
        '   2| 2nd',
        '   3| 3rd',
        '>> 4| X{%throwingTag%} Y',
        '       ^',
        '   5| 5th',
        '   6| 6th',
        '   7| 7th',
        'RenderError'
      ]
      await expect(engine.parseAndRender(html)).rejects.toMatchObject({
        name: 'RenderError',
        message: `intended error, file:${resolve('/throwing-tag.html')}, line:4, col:2`,
        stack: expect.stringContaining(message.join('\n'))
      })
    })
    it('should contain stack in err.stack', async function () {
      await expect(engine.parseAndRender('{%rejectingTag%}')).rejects.toMatchObject({
        message: expect.stringContaining('intended reject'),
        stack: expect.stringMatching(/at .*:\d+:\d+/)
      })
    })
  })

  describe('catchAllErrors', function () {
    it('should catch render errors', async function () {
      const template = '{{foo}}\n{{"hello" | throwingFilter}}\n{% throwingTag %}'
      return expect(strictCatchingEngine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '3 errors found, line:1, col:3',
        errors: [{
          name: 'UndefinedVariableError',
          message: 'undefined variable: foo, line:1, col:3'
        }, {
          name: 'RenderError',
          message: 'intended error, line:2, col:1'
        }, {
          name: 'RenderError',
          message: 'intended error, line:3, col:1'
        }]
      })
    })
    it('should catch some parse errors', async function () {
      const template = '{{"foo" | filter foo }}'
      return expect(strictCatchingEngine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '1 error found, line:1, col:18',
        errors: [{
          name: 'TokenizationError',
          message: 'expected ":" after filter name, line:1, col:18'
        }]
      })
    })
    it('should catch parse errors from filter/tag', async function () {
      const template = '{{"foo" | nonExistFilter }} {% nonExistTag %}'
      return expect(strictCatchingEngine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '2 errors found, line:1, col:1',
        errors: [{
          name: 'ParseError',
          message: 'undefined filter: nonExistFilter, line:1, col:1'
        }, {
          name: 'ParseError',
          message: 'tag "nonExistTag" not found, line:1, col:29'
        }]
      })
    })
    it('should flatten errors inside a block', async function () {
      const template = '{% if true %}x{{ n1 }}y{% endif %}z{{ n2 }}'
      return expect(strictCatchingEngine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        message: '2 errors found, line:1, col:18',
        errors: [{
          name: 'UndefinedVariableError',
          message: 'undefined variable: n1, line:1, col:18'
        }, {
          name: 'UndefinedVariableError',
          message: 'undefined variable: n2, line:1, col:39'
        }]
      })
    })
    it('should report errors from every loop iteration', async function () {
      const template = '{% for i in (1..3) %}{{ i }}{{ nope }}{% endfor %}after{{ nope2 }}'
      const caught = strictCatchingEngine.parseAndRender(template).then(
        () => { throw new Error('should reject') },
        err => err
      )
      await expect(caught).resolves.toMatchObject({ name: 'LiquidErrors' })
      const err = await caught
      expect(err.errors).toHaveLength(4)
      expect(err.errors.map((e: any) => e.name)).toEqual([
        'UndefinedVariableError',
        'UndefinedVariableError',
        'UndefinedVariableError',
        'UndefinedVariableError'
      ])
      expect(err.errors.map((e: any) => e.message)).toEqual([
        'undefined variable: nope, line:1, col:32',
        'undefined variable: nope, line:1, col:32',
        'undefined variable: nope, line:1, col:32',
        'undefined variable: nope2, line:1, col:59'
      ])
    })
    it('should keep rendering after an error in a loop (sync)', function () {
      const template = '{% for i in (1..3) %}{{ i }}{{ nope }}{% endfor %}after{{ nope2 }}'
      let err: any
      try {
        strictCatchingEngine.parseAndRenderSync(template)
      } catch (e) {
        err = e
      }
      expect(err).toMatchObject({ name: 'LiquidErrors' })
      expect(err.errors).toHaveLength(4)
      expect(err.errors.every((e: any) => e.name === 'UndefinedVariableError')).toBe(true)
    })
    it('should assign captured variable even if its body has errors', async function () {
      const template = '{% capture c %}1{{ n1 }}2{% endcapture %}[{{ c }}]{{ n2 }}'
      return expect(strictCatchingEngine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        errors: [{
          name: 'UndefinedVariableError',
          message: 'undefined variable: n1, line:1, col:20'
        }, {
          name: 'UndefinedVariableError',
          message: 'undefined variable: n2, line:1, col:54'
        }]
      })
    })
    it('should flatten errors from included and rendered partials', async function () {
      mock({ '/card.html': 'P{{ missing_in_partial }}P' })
      const engine = new Liquid({
        catchAllErrors: true,
        strictVariables: true,
        strictFilters: true,
        root: '/'
      })
      const template = '{% include "card.html" %},{% render "card.html" %},{{ n4 }}'
      return expect(engine.parseAndRender(template)).rejects.toMatchObject({
        name: 'LiquidErrors',
        errors: [{
          name: 'UndefinedVariableError',
          message: `undefined variable: missing_in_partial, file:${resolve('/card.html')}, line:1, col:5`
        }, {
          name: 'UndefinedVariableError',
          message: `undefined variable: missing_in_partial, file:${resolve('/card.html')}, line:1, col:5`
        }, {
          name: 'UndefinedVariableError',
          message: 'undefined variable: n4, line:1, col:55'
        }]
      })
    })
    it('should flatten partial errors in sync rendering', function () {
      mock({ '/card.html': 'P{{ missing_in_partial }}P' })
      const engine = new Liquid({
        catchAllErrors: true,
        strictVariables: true,
        root: '/'
      })
      const template = '{% include "card.html" %},{{ n }}'
      let err: any
      try {
        engine.parseAndRenderSync(template)
      } catch (e) {
        err = e
      }
      expect(err).toMatchObject({ name: 'LiquidErrors' })
      expect(err.errors).toHaveLength(2)
      expect(err.errors.every((e: any) => e.name === 'UndefinedVariableError')).toBe(true)
    })
  })

  describe('ParseError', function () {
    let engine: Liquid
    beforeEach(function () {
      engine = new Liquid()
      engine.registerTag('throwsOnParse', {
        parse: throwIntendedError,
        render: () => ''
      })
    })
    it('should throw ParseError when filter not defined', async function () {
      await expect(strictEngine.parseAndRender('{{1 | a}}')).rejects.toMatchObject({
        name: 'ParseError',
        message: expect.stringContaining('undefined filter: a')
      })
    })
    it('should throw ParseError when tag not closed', async function () {
      await expect(engine.parseAndRender('{% if true %}')).rejects.toMatchObject({
        name: 'ParseError',
        message: expect.stringContaining('tag {% if true %} not closed')
      })
    })
    it('should throw ParseError when tag value not specified', async function () {
      await expect(engine.parseAndRender('{% if %}{% endif %}')).rejects.toMatchObject({
        name: 'TokenizationError',
        message: 'invalid value expression: "", line:1, col:6'
      })
    })
    it('should throw ParseError when tag parse throws', async function () {
      await expect(engine.parseAndRender('{%throwsOnParse%}')).rejects.toMatchObject({
        name: 'ParseError',
        message: expect.stringContaining('intended error')
      })
    })
    it('should throw ParseError when tag not found', async function () {
      const src = '{%if true%}\naaa{%endif%}\n{% -a %}\n3'
      await expect(engine.parseAndRender(src)).rejects.toMatchObject({
        name: 'ParseError',
        message: expect.stringContaining('tag "-a" not found')
      })
    })
    it('should throw ParseError when tag not exist', async function () {
      await expect(engine.parseAndRender('{% a %}')).rejects.toMatchObject({
        name: 'ParseError',
        message: expect.stringContaining('tag "a" not found')
      })
    })

    it('should contain template context in err.stack', async function () {
      const html = ['1st', '2nd', '3rd', 'X{% a %} {% enda %} Y', '5th', '6th', '7th']
      const message = [
        '   2| 2nd',
        '   3| 3rd',
        '>> 4| X{% a %} {% enda %} Y',
        '       ^',
        '   5| 5th',
        '   6| 6th',
        '   7| 7th',
        'ParseError: tag "a" not found'
      ]
      await expect(engine.parseAndRender(html.join('\n'))).rejects.toMatchObject({
        name: 'ParseError',
        message: 'tag "a" not found, line:4, col:2',
        stack: expect.stringContaining(message.join('\n'))
      })
    })

    it('should handle err.message when context not enough', async function () {
      const html = ['1st', 'X{% a %} {% enda %} Y', '3rd', '4th']
      const message = [
        '   1| 1st',
        '>> 2| X{% a %} {% enda %} Y',
        '       ^',
        '   3| 3rd',
        '   4| 4th',
        'ParseError: tag "a" not found'
      ]
      await expect(engine.parseAndRender(html.join('\n'))).rejects.toMatchObject({
        message: 'tag "a" not found, line:2, col:2',
        stack: expect.stringContaining(message.join('\n'))
      })
    })

    it('should contain stack in err.stack', async function () {
      await expect(engine.parseAndRender('{% -a %}')).rejects.toMatchObject({
        stack: expect.stringContaining('ParseError: tag "-a" not found')
      })
      await expect(engine.parseAndRender('{% -a %}')).rejects.toMatchObject({
        stack: expect.stringMatching(/at .*:\d+:\d+\)/)
      })
    })
  })
  describe('sync support', function () {
    let engine: Liquid
    beforeEach(function () {
      engine = new Liquid({
        root: '/'
      })
      engine.registerTag('throwingTag', {
        render: function () {
          throw new Error('intended error')
        }
      })
    })
    it('should throw RenderError when tag throws', function () {
      const src = '{%throwingTag%}'
      expect(() => engine.parseAndRenderSync(src)).toThrow(RenderError)
      expect(() => engine.parseAndRenderSync(src)).toThrow(/intended error/)
    })
    it('should contain original error info for {% include %}', function () {
      mock({
        '/throwing-tag.html': ['1st', '2nd', '3rd', 'X{%throwingTag%} Y', '5th', '6th', '7th'].join('\n')
      })
      const html = '{%include "throwing-tag.html"%}'
      const message = [
        '   2| 2nd',
        '   3| 3rd',
        '>> 4| X{%throwingTag%} Y',
        '       ^',
        '   5| 5th',
        '   6| 6th',
        '   7| 7th',
        'RenderError'
      ]
      try {
        engine.parseAndRenderSync(html)
        throw new Error('expected throw')
      } catch (err) {
        expect(err).toHaveProperty('name', 'RenderError')
        expect(err).toHaveProperty('message', `intended error, file:${resolve('/throwing-tag.html')}, line:4, col:2`)
        expect(err).toHaveProperty('stack', expect.stringContaining(message.join('\n')))
      }
    })
  })
})
