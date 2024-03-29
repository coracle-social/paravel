import type {Event, Filter} from 'nostr-tools'
import type {Emitter} from '@coracle.social/lib'
import type {Connection} from './Connection'
import type {Message} from './Socket'

export type Target = Emitter & {
  connections: Connection[]
  send: (...args: Message) => void
  cleanup: () => void
}

type EventCallback = (url: string, event: Event) => void
type EoseCallback = (url: string) => void
type AuthCallback = (url: string, challenge: string) => void
type OkCallback = (url: string, id: string, ...extra: any[]) => void
type ErrorCallback = (url: string, id: string, ...extra: any[]) => void
type SubscribeOpts = {onEvent?: EventCallback, onEose?: EoseCallback}
type PublishOpts = {verb?: string, onOk?: OkCallback, onError?: ErrorCallback}
type AuthOpts = {onAuth: AuthCallback, onOk: OkCallback}

const createSubId = (prefix: string) => [prefix, Math.random().toString().slice(2, 10)].join('-')

export class Executor {

  constructor(readonly target: Target) {}

  subscribe(filters: Filter[], {onEvent, onEose}: SubscribeOpts = {}) {
    let closed = false

    const id = createSubId('REQ')
    const eventListener = (url: string, subid: string, e: Event) => subid === id && onEvent?.(url, e)
    const eoseListener = (url: string, subid: string) => subid === id && onEose?.(url)

    this.target.on('EVENT', eventListener)
    this.target.on('EOSE', eoseListener)
    this.target.send("REQ", id, ...filters)

    return {
      unsubscribe: () => {
        if (!closed) {
          this.target.send("CLOSE", id)
          this.target.off('EVENT', eventListener)
          this.target.off('EOSE', eoseListener)
        }

        closed = true
      },
    }
  }

  publish(event: Event, {verb = 'EVENT', onOk, onError}: PublishOpts = {}) {
    const okListener = (url: string, id: string, ...payload: any[]) => id === event.id && onOk?.(url, id, ...payload)
    const errorListener = (url: string, id: string, ...payload: any[]) => id === event.id && onError?.(url, id, ...payload)

    this.target.on('OK', okListener)
    this.target.on('ERROR', errorListener)
    this.target.send(verb, event)

    return {
      unsubscribe: () => {
        this.target.off('OK', okListener)
        this.target.off('ERROR', errorListener)
      }
    }
  }

  handleAuth({onAuth, onOk}: AuthOpts) {
    this.target.on('AUTH', onAuth)
    this.target.on('OK', onOk)

    return {
      unsubscribe: () => {
        this.target.off('AUTH', onAuth)
        this.target.off('OK', onOk)
      }
    }
  }
}

