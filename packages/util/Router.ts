import type {EventTemplate, UnsignedEvent} from 'nostr-tools'
import {first, uniq, shuffle} from '@coracle.social/lib'
import type {Rumor} from './Events'
import {getAddress, isReplaceable} from './Events'
import {Tag, Tags} from './Tags'
import {GROUP_DEFINITION, COMMUNITY_DEFINITION} from './Kinds'
import {addressFromEvent, decodeAddress} from './Address'

const isGroupAddress = (a: string) => decodeAddress(a).kind === GROUP_DEFINITION

const isCommunityAddress = (a: string) => decodeAddress(a).kind === COMMUNITY_DEFINITION

export enum RelayMode {
  Read = "read",
  Write = "write",
}

export type RouterOptions = {
  getUserPubkey: () => string | null
  getGroupRelays: (address: string) => string[]
  getCommunityRelays: (address: string) => string[]
  getPubkeyRelays: (pubkey: string, mode?: RelayMode) => string[]
  getDefaultRelays: (mode?: RelayMode) => string[]
  getRelayQuality?: (url: string) => number
  getDefaultLimit: () => number
}

export type RouteScores = Record<string, {score: number, count: number}>

export type FallbackPolicy = (urls: string[], limit: number) => number

export class Router {
  constructor(readonly options: RouterOptions) {}

  // Utilities derived from options

  getUserRelays = (mode?: RelayMode) => {
    const pubkey = this.options.getUserPubkey()

    return pubkey ? this.options.getPubkeyRelays(pubkey, mode) : []
  }

  getContextRelayGroups = (event: EventTemplate) => {
    const addresses = Tags.fromEvent(event).context().values().valueOf()

    return [
      ...addresses.filter(isCommunityAddress).map(this.options.getCommunityRelays),
      ...addresses.filter(isGroupAddress).map(this.options.getGroupRelays),
    ]
  }

  // Utilities for processing hints

  scoreGroups = (groups: string[][]) => {
    const scores: RouteScores = {}

    groups.filter(g => g?.length > 0).forEach((urls, i) => {
      for (const url of shuffle(uniq(urls))) {
        if (!scores[url]) {
          scores[url] = {score: 0, count: 0}
        }

        scores[url].score += 1 / (i + 1)
        scores[url].count += 1
      }
    })

    for (const [url, score] of Object.entries(scores)) {
      const quality = this.options.getRelayQuality?.(url) || 1

      score.score = score.score * Math.cbrt(score.count) * quality
    }

    const items = Object.entries(scores)
      .filter(([url, {score}]) => score > 0)
      .sort((a, b) => b[1].score - a[1].score)
      .map(([url, {score, count}]) => ({url, score, count}))

    return items
  }

  scenario = (groups: string[][]) => new RouterScenario(this, groups)

  merge = (scenarios: RouterScenario[]) =>
    this.scenario(scenarios.map(scenario => scenario.policy(this.addNoFallbacks).getUrls()))

  // Routing scenarios

  User = () => this.scenario([this.getUserRelays()])

  ReadRelays = () => this.scenario([this.getUserRelays()]).mode(RelayMode.Read)

  WriteRelays = () => this.scenario([this.getUserRelays()]).mode(RelayMode.Write)

  AllMessages = () => this.scenario([this.getUserRelays()])

  Messages = (pubkeys: string[]) =>
    this.scenario([
      this.getUserRelays(),
      ...pubkeys.map(pubkey => this.options.getPubkeyRelays(pubkey))
    ])

  PublishMessage = (pubkey: string) =>
    this.scenario([
      this.getUserRelays(RelayMode.Write),
      this.options.getPubkeyRelays(pubkey, RelayMode.Read)
    ]).policy(this.addMinimalFallbacks)

  Event = (event: UnsignedEvent) =>
    this.scenario([
      this.options.getPubkeyRelays(event.pubkey, RelayMode.Write),
      ...this.getContextRelayGroups(event),
    ])

  EventChildren = (event: UnsignedEvent) =>
    this.scenario([
      this.options.getPubkeyRelays(event.pubkey, RelayMode.Read),
      ...this.getContextRelayGroups(event),
    ])

  EventParent = (event: UnsignedEvent) => {
    const tags = Tags.fromEvent(event)

    return this.scenario([
      tags.replies().relays().valueOf(),
      tags.roots().relays().valueOf(),
      ...this.getContextRelayGroups(event),
      ...tags.whereKey("p").values().valueOf()
        .map(pk => this.options.getPubkeyRelays(pk, RelayMode.Write)),
      tags.whereKey("p").relays().valueOf(),
      this.options.getPubkeyRelays(event.pubkey, RelayMode.Read),
    ])
  }

  EventRoot = (event: UnsignedEvent) => {
    const tags = Tags.fromEvent(event)

    return this.scenario([
      tags.roots().relays().valueOf(),
      tags.replies().relays().valueOf(),
      ...this.getContextRelayGroups(event),
      ...tags.whereKey("p").values().valueOf()
        .map(pk => this.options.getPubkeyRelays(pk, RelayMode.Write)),
      tags.whereKey("p").relays().valueOf(),
      this.options.getPubkeyRelays(event.pubkey, RelayMode.Read),
    ])
  }

  PublishEvent = (event: UnsignedEvent) => {
    const tags = Tags.fromEvent(event)
    const mentions = tags.values("p").valueOf()
    const addresses = tags.context().values().valueOf()
    const groupAddresses = addresses.filter(isGroupAddress)
    const communityAddresses = addresses.filter(isCommunityAddress)

    // If we're publishing only to private groups, only publish to those groups' relays.
    // Otherwise, publish to all relays, because it's essentially public.
    if (groupAddresses.length > 0 && communityAddresses.length === 0) {
      return this.scenario(groupAddresses.map(this.options.getGroupRelays))
    }

    return this.scenario([
      this.options.getPubkeyRelays(event.pubkey, RelayMode.Write),
      ...groupAddresses.map(this.options.getGroupRelays),
      ...communityAddresses.map(this.options.getCommunityRelays),
      ...mentions.map((pk: string) => this.options.getPubkeyRelays(pk, RelayMode.Read)),
    ])
  }

  FromPubkeys = (pubkeys: string[]) =>
    this.scenario(pubkeys.map(pk => this.options.getPubkeyRelays(pk, RelayMode.Write)))

  ForPubkeys = (pubkeys: string[]) =>
    this.scenario(pubkeys.map(pk => this.options.getPubkeyRelays(pk, RelayMode.Read)))

  WithinGroup = (address: string) =>
    this.scenario([this.options.getGroupRelays(address)]).policy(this.addNoFallbacks)

  WithinCommunity = (address: string) =>
    this.scenario([this.options.getCommunityRelays(address)])

  WithinContext = (address: string) => {
    if (isGroupAddress(address)) {
      return this.WithinGroup(address)
    }

    if (isCommunityAddress(address)) {
      return this.WithinCommunity(address)
    }

    throw new Error(`Unknown context ${address}`)
  }

  WithinMultipleContexts = (addresses: string[]) =>
    this.merge(addresses.map(this.WithinContext))

  // Fallback policies

  addNoFallbacks = (urls: string[], limit: number) => 0

  addMinimalFallbacks = (urls: string[], limit: number) => Math.max(0, 1 - urls.length)

  addMaximalFallbacks = (urls: string[], limit: number) => Math.max(0, limit - urls.length)

  // Higher level utils that use hints

  tagPubkey = (pubkey: string) =>
    Tag.from(["p", pubkey, this.FromPubkeys([pubkey]).getUrl()])

  tagEventId = (event: Rumor, ...extra: string[]) =>
    Tag.from(["e", event.id, this.Event(event).getUrl(), ...extra])

  tagEventAddress = (event: UnsignedEvent, ...extra: string[]) =>
    Tag.from(["a", getAddress(event), this.Event(event).getUrl(), ...extra])

  tagEvent = (event: Rumor, ...extra: string[]) => {
    const tags = [this.tagEventId(event, ...extra)]

    if (isReplaceable(event)) {
      tags.push(this.tagEventAddress(event, ...extra))
    }

    return new Tags(tags)
  }

  address = (event: UnsignedEvent) =>
    addressFromEvent(event, this.Event(event).limit(3).getUrls())
}

// Router Scenario

export type RouterScenarioOptions = {
  mode?: RelayMode
  limit?: number
  policy?: FallbackPolicy
}

export class RouterScenario {
  constructor(readonly router: Router, readonly groups: string[][], readonly options: RouterScenarioOptions = {}) {}

  clone = (options: RouterScenarioOptions) =>
    new RouterScenario(this.router, this.groups, {...this.options, ...options})

  limit = (limit: number) => this.clone({limit})

  mode = (mode: RelayMode) => this.clone({mode})

  policy = (policy: FallbackPolicy) => this.clone({policy})

  getLimit = () => this.options.limit || this.router.options.getDefaultLimit()

  getPolicy = () => this.options.policy || this.router.addMaximalFallbacks

  getFallbackRelays = () =>
    shuffle(this.router.options.getDefaultRelays(this.options.mode))

  getUrls = () => {
    const fallbackPolicy = this.getPolicy()
    const urls = this.router.scoreGroups(this.groups).map(s => s.url)
    const limit = this.getLimit()
    const limitWithFallbacks = Math.min(limit, urls.length) + fallbackPolicy(urls, limit)

    for (const url of this.getFallbackRelays()) {
      if (urls.length >= limitWithFallbacks) {
        break
      }

      if (!urls.includes(url)) {
        urls.push(url)
      }
    }

    return urls.slice(0, limitWithFallbacks)
  }

  getUrl = () => first(this.limit(1).getUrls())
}
