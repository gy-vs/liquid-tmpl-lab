import { getPerformance } from '../util/performance'
import { toPromise, RenderError, LiquidErrors, LiquidError } from '../util'
import { Context } from '../context'
import { Template } from '../template'
import { Emitter, KeepingTypeEmitter, StreamedEmitter, SimpleEmitter } from '../emitters'

export class Render {
  public renderTemplatesToNodeStream (templates: Template[], ctx: Context): NodeJS.ReadableStream {
    const emitter = new StreamedEmitter()
    Promise.resolve().then(() => toPromise(this.renderTemplates(templates, ctx, emitter)))
      .then(() => emitter.end(), err => emitter.error(err))
    return emitter.stream
  }
  public * renderTemplates (templates: Template[], ctx: Context, emitter?: Emitter): IterableIterator<any> {
    if (!emitter) {
      emitter = ctx.opts.keepOutputType ? new KeepingTypeEmitter() : new SimpleEmitter()
    }
    // With `catchAllErrors` enabled, errors are collected into `ctx.renderErrors`,
    // which is shared by nested renders (block bodies, partials, child contexts),
    // so all errors are flattened into a single `LiquidErrors` thrown by the
    // top-level call, and nested templates keep rendering after an error occurs.
    const topLevel = ctx.opts.catchAllErrors && ctx.renderErrors === undefined
    let errors: RenderError[] | undefined
    if (topLevel) errors = ctx.renderErrors = []
    try {
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
          if (!ctx.opts.catchAllErrors) throw err
          // flatten errors thrown by nested renders, e.g. parse errors of a partial
          if (LiquidErrors.is(err)) ctx.renderErrors!.push(...err.errors)
          else ctx.renderErrors!.push(err)
        }
      }
    } finally {
      if (topLevel) ctx.renderErrors = undefined
    }
    if (errors?.length) throw new LiquidErrors(errors)
    return emitter.buffer
  }
}
