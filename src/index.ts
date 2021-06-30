import { SearchIndex } from 'algoliasearch'
import { standardValues, sleep } from './util'
import { SanityDocumentStub, SanityClient } from '@sanity/client'
import {
  AlgoliaRecord,
  SerializeFunction,
  VisiblityFunction,
  Options,
  SyncOptions,
  WebhookBody,
} from './types'

export { flattenBlocks } from './util'

type TypeConfig = {
  index: SearchIndex
  projection?: string
}

type IndexMap = {
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

const saveRecords = async (
  recordsToSave: AlgoliaRecord[],
  typeIndexMap: IndexMap,
  replaceAll = false
) => {
  if (replaceAll && recordsToSave.length > 0) {
    for (const type in typeIndexMap) {
      await typeIndexMap[type].index.replaceAllObjects(
        recordsToSave.filter((r) => r.type === type)
      )
    }
  } else if (recordsToSave.length > 0) {
    for (const type in typeIndexMap) {
      await typeIndexMap[type].index.saveObjects(
        recordsToSave.filter((r) => r.type === type)
      )
    }
  }
}

const deleteRecords = async (
  ids: string[],
  typeIndexMap: IndexMap,
  deleteByQuery = false
) => {
  if (deleteByQuery && ids.length > 0) {
    for await (const typeIndexConfig of Object.values(typeIndexMap)) {
      typeIndexConfig.index.deleteBy({ tagFilters: [ids] })
    }
  } else if (ids.length > 0) {
    for await (const typeIndexConfig of Object.values(typeIndexMap)) {
      typeIndexConfig.index.deleteObjects(ids)
    }
  }
}

const indexer = (
  typeIndexMap: IndexMap,
  // Defines how the transformation from Sanity document to Algolia record is
  // performed. Must return an AlgoliaRecord for every input. Inputs are only
  // those Sanity document types declared as keys in `typeIndexMap`.
  serializer: SerializeFunction,
  // Optionally provide logic for which documents should be visible or not.
  // Useful if your documents have a isHidden or isIndexed property or similar
  visible?: VisiblityFunction,
  // When { deleteByQuery: true }, the source document id will be kept in the
  // _tags property. In addition, it will cause the delete step to delete items
  // from Algolia by a tags filter. This is useful if you expect to return
  // multiple items from the serializer function, which would otherwise break
  // the 1:1 mapping between the Sanity document._id and the Algolia objectID.
  // In addition, the deleteBy method counts as a single operation, whereas
  // deleteObjects wil cause each id to be registered as a separate operation.
  // That said, deleteObjects can be more performant.
  options?: Options
) => {
  const { deleteByQuery } = options ?? {}

  const transform = async (documents: SanityDocumentStub[]) => {
    const records: AlgoliaRecord[] = await Promise.all(
      documents.map(async (document: SanityDocumentStub) => {
        const serializedDocs = await serializer(document)
        if (Array.isArray(serializedDocs)) {
          return serializedDocs.map((chunk) =>
            Object.assign(standardValues(document, deleteByQuery), chunk)
          )
        } else {
          return Object.assign(
            standardValues(document, deleteByQuery),
            serializedDocs
          )
        }
      })
    )
    return records.flat()
  }

  // Syncs the Sanity documents represented by the ids in the WebhookBody to
  // Algolia via the `typeIndexMap` and `serializer`
  const webhookSync = async (
    client: SanityClient,
    body: WebhookBody,
    options: SyncOptions = {}
  ) => {
    const { replaceAll = false, sleep: sleepTime = 2000, params = {} } = options

    // Sleep a bit to make sure Sanity query engine is caught up to mutation
    // changes we are responding to.
    if (sleepTime > 0) await sleep(sleepTime)

    // Query Sanity for more information
    //
    // Fetch the full objects that we are probably going to index in Algolia. Some
    // of these might get filtered out later by the optional visibility function.
    const query = `* [(_id in $created || _id in $updated) && _type in $types] ${indexMapProjection(
      typeIndexMap
    )}`
    const { created = [], updated = [] } = body.ids
    const docs: SanityDocumentStub[] = await client.fetch(query, {
      ...params,
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

    // Purge any updated records that do not have a 1:1 mapping
    if (deleteByQuery && !replaceAll) {
      await deleteRecords(
        updated.filter((id: string) => visibleIds.includes(id)),
        typeIndexMap,
        deleteByQuery
      )
    }

    const recordsToSave = await transform(visibleRecords)

    if (recordsToSave.length > 0) {
      saveRecords(recordsToSave, typeIndexMap, replaceAll)
    }

    /*
     * Optimalization: We can check the history of the deleted document(s) with
     * history API to see if they were of a type that we have probably indexed
     * before. Right now we blankly tell Algolia to try to delete any deleted record
     * in any index we have.
     */
    if (!replaceAll) {
      const { deleted = [] } = body.ids
      await deleteRecords(
        deleted.concat(hiddenIds),
        typeIndexMap,
        deleteByQuery
      )
    }

    return recordsToSave
  }

  // This is a convenience method to perform a full (re-)index.
  // When replaceAll is set, all the records in the index will be replaced
  // with items fetched from Sanity.
  const syncAll = async (client: SanityClient, options: SyncOptions = {}) => {
    const { types: typesToSync = [] } = options
    const types =
      typesToSync.length > 0 ? typesToSync : Object.keys(typeIndexMap)
    const ids = await client.fetch(
      `*[_type in $types && !(_id in path("drafts.**"))][]._id`,
      { types }
    )
    return await syncRecords(client, ids, options)
  }

  // This is a more low-level method to handle indexing items by their id.
  const syncRecords = async (
    client: SanityClient,
    ids: string[],
    options: SyncOptions = {}
  ) => {
    return await webhookSync(client, { ids: { created: ids } }, options)
  }

  // This is an explicit method to perform a full re-index.
  const replaceAll = async (
    client: SanityClient,
    options: SyncOptions = {}
  ) => {
    return await syncAll(client, { ...options, replaceAll: true })
  }

  return { transform, webhookSync, syncAll, syncRecords, replaceAll }
}

export default indexer
