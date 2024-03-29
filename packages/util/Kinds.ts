import {between} from '@coracle.social/lib'

export const isEphemeralKind = (kind: number) => between(19999, 29999, kind)

export const isPlainReplaceableKind = (kind: number) => between(9999, 20000, kind)

export const isParameterizedReplaceableKind = (kind: number) => between(29999, 40000, kind)

export const isReplaceableKind = (kind: number) => isPlainReplaceableKind(kind) || isParameterizedReplaceableKind(kind)

export const PROFILE = 0
export const NOTE = 1
export const RELAY = 2
export const DM = 4
export const EVENT_DELETION = 5
export const REPOST = 6
export const REACTION = 7
export const BADGE_AWARD = 8
export const GENERIC_REPOST = 16
export const CHANNEL_CREATION = 40
export const CHANNEL_METADATA = 41
export const CHANNEL_MESSAGE = 42
export const CHANNEL_HIDE_MESSAGE = 43
export const CHANNEL_MUTE_USER = 44
export const OPEN_TIMESTAMP = 1040
export const GIFT_WRAP = 1059
export const FILE_METADATA = 1063
export const LIVE_CHAT_MESSAGE = 1311
export const PROBLEM_TRACKER = 1971
export const REPORT = 1984
export const LABEL = 1985
export const COMMUNITY_POST_APPROVAL = 4550
export const JOB_REQUEST = 5999
export const JOB_RESULT = 6999
export const JOB_FEEDBACK = 7000
export const ZAP_GOAL = 9041
export const ZAP_REQUEST = 9734
export const ZAP_RESPONSE = 9735
export const HIGHLIGHT = 9802
export const USER_LIST_MUTES = 10000
export const USER_LIST_PINS = 10001
export const USER_LIST_RELAYS = 10002
export const USER_LIST_BOOKMARKS = 10003
export const USER_LIST_COMMUNITIES = 10004
export const USER_LIST_PUBLIC_CHATS = 10005
export const USER_LIST_BLOCKED_RELAYS = 10006
export const USER_LIST_SEARCH_RELAYS = 10007
export const USER_LIST_INTERESTS = 10015
export const USER_LIST_EMOJIS = 10030
export const LIGHTNING_PUB_RPC = 21000
export const CLIENT_AUTH = 22242
export const NWC_INFO = 13194
export const NWC_REQUEST = 23194
export const NWC_RESPONSE = 23195
export const NOSTR_CONNECT = 24133
export const HTTP_AUTH = 27235
export const LIST_FOLLOWS = 3
export const LIST_PEOPLE = 30000
export const LIST_GENERIC = 30001
export const LIST_RELAYS = 30002
export const LIST_BOOKMARKS = 30003
export const LIST_CURATIONS = 30004
export const PROFILE_BADGES = 30008
export const BADGE_DEFINITION = 30009
export const LIST_EMOJIS = 30030
export const LIST_INTERESTS = 30015
export const LONG_FORM_ARTICLE = 30023
export const LONG_FORM_ARTICLE_DRAFT = 30024
export const APPLICATION = 30078
export const LIVE_EVENT = 30311
export const USER_STATUSES = 30315
export const CLASSIFIED_LISTING = 30402
export const DRAFT_CLASSIFIED_LISTING = 30403
export const CALENDAR = 31924
export const CALENDAR_EVENT_DATE = 31922
export const CALENDAR_EVENT_TIME = 31923
export const CALENDAR_EVENT_RSVP = 31925
export const HANDLER_RECOMMENDATION = 31989
export const HANDLER_INFORMATION = 31990
export const COMMUNITY_DEFINITION = 34550
export const GROUP_DEFINITION = 35834
