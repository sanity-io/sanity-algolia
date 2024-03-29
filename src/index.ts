import { SearchIndex } from 'algoliasearch'
import { standardValues, sleep } from './util'
import type {
  AlgoliaRecord,
  SerializeFunction,
  VisiblityFunction,
  WebhookBody,
  DocumentStub,
  SanityApiclient,
} from './types'

export { flattenBlocks } from './util'

export type TypeConfig = {
  index: SearchIndex
  projection?: string
}

export type IndexMap = {
  [key: string]: TypeConfig
}

export const indexMapProjection = (indexMap: IndexMap): string => {
  const types = Object.keys(indexMap)
  const res = `{
  _id,
  _type,
  _rev,
  ${types
    .map((t) => `_type == "${t}" => ${indexMap[t].projection || '{...}'}`)
    .join(',\n  ')}
}`
  return res
}

const indexer = (
  typeIndexMap: IndexMap,
  // Defines how the transformation from Sanity document to Algolia record is
  // performed. Must return an AlgoliaRecord for every input. Inputs are only
  // those Sanity document types declared as keys in `typeIndexMap`.
  serializer: SerializeFunction,
  // Optionally provide logic for which documents should be visible or not.
  // Useful if your documents have a isHidden or isIndexed property or similar
  visible?: VisiblityFunction
) => {
  const transform = async (documents: DocumentStub[]) => {
    const records: AlgoliaRecord[] = await Promise.all(
      documents.map(async (document: DocumentStub) => {
        return Object.assign(
          standardValues(document),
          await serializer(document)
        )
      })
    )
    return records
  }

  // Syncs the Sanity documents represented by the ids in the WebhookBody to
  // Algolia via the `typeIndexMap` and `serializer`
  const webhookSync = async (client: SanityApiclient, body: WebhookBody) => {
    // Sleep a bit to make sure Sanity query engine is caught up to mutation
    // changes we are responding to.
    await sleep(2000)

    // Query Sanity for more information
    //
    // Fetch the full objects that we are probably going to index in Algolia. Some
    // of these might get filtered out later by the optional visibility function.
    const query = `* [(_id in $created || _id in $updated) && _type in $types] ${indexMapProjection(
      typeIndexMap
    )}`
    const { created = [], updated = [] } = body.ids
    const docs: DocumentStub[] = await client.fetch(query, {
      created,
      updated,
      types: Object.keys(typeIndexMap),
    })

    // In the event that a field on a document was updated such that it is no
    // longer visible (visible set to false, published set to false etc) we need
    // to make sure these are removed if they have been indexed previously. We do
    // this by calculating the diff between ids we're about to save and all ids
    // that came in as created or updated. The resulting difference is added into
    // the delete operation further down.
    const allCreatedOrUpdated = created.concat(updated)
    const visibleRecords = docs.filter((document) => {
      return visible ? visible(document) : true
    })
    const visibleIds = visibleRecords.map((doc: any) => doc._id)
    const hiddenIds = allCreatedOrUpdated.filter(
      (id: string) => !visibleIds.includes(id)
    )

    const recordsToSave = await transform(visibleRecords)

    if (recordsToSave.length > 0) {
      for (const type in typeIndexMap) {
        await typeIndexMap[type].index.saveObjects(
          recordsToSave.filter((r) => r.type === type)
        )
      }
    }

    /*
     * Optimalization: We can check the history of the deleted document(s) with
     * history API to see if they were of a type that we have probably indexed
     * before. Right now we blankly tell Algolia to try to delete any deleted record
     * in any index we have.
     */
    const { deleted = [] } = body.ids
    const recordsToDelete = deleted.concat(hiddenIds)

    if (recordsToDelete.length > 0) {
      const uniqueIndexes = new Set(
        Object.values(typeIndexMap).map(
          (typeIndexConfig) => typeIndexConfig.index
        )
      )
      for (const index of uniqueIndexes) {
        await index.deleteObjects(recordsToDelete)
      }
    }
  }

  return { transform, webhookSync }
}

export default indexer
