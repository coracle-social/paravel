import {Emitter, Queue} from '@coracle.social/lib'
import {AuthStatus, ConnectionMeta} from './ConnectionMeta'
import {Socket, isMessage, asMessage} from './Socket'
import type {SocketMessage} from './Socket'

class SendQueue extends Queue {
  constructor(readonly cxn: Connection) {
    super()
  }

  shouldSend(message: SocketMessage) {
    if (!this.cxn.socket.isReady()) {
      return false
    }

    const [verb, ...extra] = asMessage(message)

    if (['AUTH', 'CLOSE'].includes(verb)) {
      return true
    }

    // Allow relay requests through
    if (verb === 'EVENT' && extra[0].kind === 28934) {
      return true
    }

    // Only defer for auth if we're not multiplexing
    if (isMessage(message) && ![AuthStatus.Ok, AuthStatus.Pending].includes(this.cxn.meta.authStatus)) {
      return false
    }

    if (verb === 'REQ') {
      return this.cxn.meta.pendingRequests.size < 8
    }

    return true
  }

  handle(message: SocketMessage) {
    // If we ended up handling a CLOSE before we handled the REQ, don't send the REQ
    if (message[0] === 'CLOSE') {
      this.messages = this.messages.filter(m => !(m[0] === 'REQ' && m[1] === message[1]))
    }

    this.cxn.onSend(message)
  }
}

class ReceiveQueue extends Queue {
  constructor(readonly cxn: Connection) {
    super()
  }

  handle(message: SocketMessage) {
    this.cxn.onReceive(message)
  }
}

export class Connection extends Emitter {
  url: string
  socket: Socket
  sendQueue: SendQueue
  receiveQueue: ReceiveQueue
  meta: ConnectionMeta

  constructor(url: string) {
    super()

    this.url = url
    this.socket = new Socket(url, this)
    this.sendQueue = new SendQueue(this)
    this.receiveQueue = new ReceiveQueue(this)
    this.meta = new ConnectionMeta(this)
    this.setMaxListeners(100)
  }

  send = (m: SocketMessage) => this.sendQueue.push(m)

  onOpen = () => this.emit('open', this)

  onClose = () => this.emit('close', this)

  onError = () => this.emit('fault', this)

  onMessage = (m: SocketMessage) => this.receiveQueue.push(m)

  onSend = (message: SocketMessage) => {
    this.emit('send', this, message)
    this.socket.send(message)
  }

  onReceive = (message: SocketMessage) => {
    this.emit('receive', this, message)
  }

  ensureConnected = ({shouldReconnect = true}) => {
    if (shouldReconnect && !this.socket.isHealthy()) {
      this.disconnect()
    }

    if (this.socket.isPending()) {
      this.socket.connect()
    }
  }

  disconnect() {
    this.socket.disconnect()
    this.sendQueue.clear()
    this.receiveQueue.clear()
    this.meta.clearPending()
  }

  destroy() {
    this.disconnect()
    this.removeAllListeners()
    this.sendQueue.stop()
    this.receiveQueue.stop()
  }
}
