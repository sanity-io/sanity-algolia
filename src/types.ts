export type AlgoliaRecord = Readonly<Record<string, any>>

export type DocumentStub = Record<string, any> & {
  _id: string
  _type: string
  _rev: string
}

export interface SanityApiclient {
  fetch: (query: string, params?: any) => Promise<DocumentStub[]>
}

export interface SerializeFunction {
  (document: DocumentStub): AlgoliaRecord
}

export interface VisiblityFunction {
  (document: DocumentStub): boolean
}

export type WebhookBody = {
  ids: {
    created: string[]
    updated: string[]
    deleted: string[]
  }
}
