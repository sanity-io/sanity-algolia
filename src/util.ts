// We do this locally just to trim the size of the records a bit
import sw from 'stopword'
import { SanityDocumentStub } from '@sanity/client'
import { SearchIndex } from 'algoliasearch'
import { AlgoliaRecord } from 'types'

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Properties that always should exist (only objectID is strictly needed from Algolia)
export const standardValues = (doc: SanityDocumentStub) => {
  return {
    objectID: doc._id,
    type: doc._type,
    rev: doc._rev,
  }
}

// TODO: Probably want to support other languages besides English for the stopwords
export const flattenBlocks = (
  blocks: Record<string, any>[],
  removeStopWords = false
) => {
  return [].concat
    .apply(
      [],
      blocks
        .filter((i) => i._type === 'block')
        .map((b) =>
          b.children
            .filter(
              (c: Record<string, any>) =>
                typeof c.text === 'string' && c.text.length > 0
            )
            .map((c: Record<string, any>) => {
              if (removeStopWords) {
                return sw.removeStopwords(c.text.split(' ')).join(' ')
              }
              return c.text
            })
        )
    )
    .join(' ')
}

export const getAllRecords = async (index: SearchIndex) => {
  let hits: AlgoliaRecord[] = []
  return index
    .browseObjects({
      batch: (objects) => (hits = hits.concat(objects)),
    })
    .then(() => hits)
}
