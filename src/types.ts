import { SanityDocumentStub } from '@sanity/client'

export type AlgoliaRecord = Readonly<Record<string, any>>

export interface SerializeFunction {
  (document: SanityDocumentStub): AlgoliaRecord
}

export interface VisiblityFunction {
  (document: SanityDocumentStub): boolean
}

export type Options = {
  spread?: boolean
}

export type SyncOptions = {
  types?: string[]
  replaceAll?: boolean
  sleep?: number
}

export type WebhookBody = {
  ids: {
    created?: string[]
    updated?: string[]
    deleted?: string[]
  }
}
