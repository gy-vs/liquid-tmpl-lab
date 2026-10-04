import { getPerformance } from '../util/performance'
import { toPromise, RenderError, LiquidErrors, LiquidError } from '../util'
import { Context } from '../context'
import { Template } from '../template'
import { Emitter, KeepingTypeEmitter, StreamedEmitter, SimpleEmitter } from '../emitters'

export class Render {
  public renderTemplatesToNodeStream (templates: Template[], ctx: Context): NodeJS.ReadableStream {
    const emitter = new StreamedEmitter()
    Promise.resolve().then(() => toPromise(this.renderTemplates(templates, ctx, emitter)))
      .then(() => {
        if (ctx.opts.catchAllErrors && ctx.errors.length) {
          emitter.error(new LiquidErrors(ctx.errors))
        } else {
          emitter.end()
        }
      })
      .catch(err => emitter.error(err))
    return emitter.stream
  }
  public * renderTemplates (templates: Template[], ctx: Context, emitter?: Emitter): IterableIterator<any> {
    if (!emitter) {
      emitter = ctx.opts.keepOutputType ? new KeepingTypeEmitter() : new SimpleEmitter()
    }
    for (const tpl of templates) {
      ctx.renderLimit.check(getPerformance().now())
      try {
        // if tpl.render supports emitter, it'll return empty `html`
        const html = yield tpl.render(ctx, emitter)
        // if not, it'll return an `html`, write to the emitter for it
        html && emitter.write(html)
        if (ctx.breakCalled || ctx.continueCalled) break
      } catch (e) {
        const err = LiquidError.is(e) ? e : new RenderError(e as Error, tpl)
        // when catchAllErrors is enabled errors are gathered on a shared
        // context array so that nested blocks, loops and partials keep
        // rendering and contribute their errors in order. The top-level
        // render is responsible for throwing a single LiquidErrors.
        if (ctx.opts.catchAllErrors) ctx.errors.push(err)
        else throw err
      }
    }
    return emitter.buffer
  }
}
