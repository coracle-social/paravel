import WebSocket from "isomorphic-ws"
import {EventEmitter} from 'events'
import {Deferred, defer} from "./Deferred"

export class Socket extends EventEmitter {
  ws?: WebSocket
  url: string
  ready: Deferred<void>
  timeout?: NodeJS.Timeout
  queue: [string, any][]
  status: string
  error?: Error
  static STATUS = {
    NEW: "new",
    PENDING: "pending",
    CLOSED: "closed",
    READY: "ready",
  }
  constructor(url: string) {
    super()

    this.url = url
    this.ready = defer()
    this.queue = []
    this.status = Socket.STATUS.NEW
  }
  send = (message: any) => {
    this.connect()
    this.queue.push(['send', message])
    this.enqueueWork()
  }
  onMessage = (event: {data: string}) => {
    this.queue.push(['receive', event.data])
    this.enqueueWork()
  }
  onOpen = () => {
    this.error = undefined
    this.status = Socket.STATUS.READY
    this.ready.resolve()
    this.emit('open')
  }
  onError = (error: Error) => {
    this.error = error
    this.emit('error', error)
  }
  onClose = () => {
    this.disconnect()
    this.ready.reject()
    this.status = Socket.STATUS.CLOSED
    this.emit('close')
  }
  connect = () => {
    const {NEW, CLOSED, PENDING} = Socket.STATUS

    if ([NEW, CLOSED].includes(this.status)) {
      this.ready = defer()
      this.ws = new WebSocket(this.url)
      this.status = PENDING

      this.ws.addEventListener("open", this.onOpen)
      // @ts-ignore
      this.ws.addEventListener("error", this.onError)
      this.ws.addEventListener("close", this.onClose)
      // @ts-ignore
      this.ws.addEventListener("message", this.onMessage)
    }
  }
  disconnect = () => {
    if (this.ws) {
      const ws = this.ws

      // Avoid "WebSocket was closed before the connection was established"
      this.ready.then(() => ws.close(), () => null)
      this.ws = undefined
    }
  }
  receiveMessage = (json: string) => {
    try {
      this.emit('message', this.url, JSON.parse(json))
    } catch (e) {
      // pass
    }
  }
  sendMessage = (message: any) => {
    // @ts-ignore
    this.ws.send(JSON.stringify(message))
  }
  doWork = () => {
    this.timeout = undefined

    for (const [action, payload] of this.queue.splice(0, 50)) {
      if (action === 'receive') {
        this.receiveMessage(payload)
      }

      if (action === 'send') {
        if (this.status === Socket.STATUS.READY) {
          this.sendMessage(payload)
        } else {
          this.queue.push(['send', payload])
        }
      }
    }

    this.enqueueWork()
  }
  enqueueWork = () => {
    if (!this.timeout && this.queue.length > 0) {
      this.timeout = setTimeout(() => this.doWork(), 50) as NodeJS.Timeout
    }
  }
}
