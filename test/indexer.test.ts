import indexer, { indexMapProjection } from '../src/index'
import fixture from './fixtures/internalFaq.json'
import { SearchIndex } from 'algoliasearch'

const mockIndex = {} as SearchIndex

describe('transform', () => {
  it('includes standard values for some standard properties', () => {
    const algo = indexer(
      {
        internalFaq: { index: mockIndex },
      },
      () => ({})
    )

    const record = algo.transform([fixture])[0]
    expect(record.objectID).toEqual(fixture._id)
    expect(record.type).toEqual(fixture._type)
    expect(record.rev).toEqual(fixture._rev)
  })

  it('serialized according to passed function', () => {
    const algo = indexer({ internalFaq: { index: mockIndex } }, (document) => {
      return {
        title: document.title,
        body: 'flattened body',
        weirdField: 29,
        keywords: document.keywords,
      }
    })

    const records = algo.transform([fixture])
    expect(records[0]).toMatchObject({
      title: fixture.title,
      body: 'flattened body',
      weirdField: 29,
      keywords: fixture.keywords,
    })
  })

  it('can override default values', () => {
    const algo = indexer({ internalFaq: { index: mockIndex } }, (_document) => {
      return {
        objectId: 'totally custom',
        type: 'invented',
        rev: 'made up',
      }
    })

    const records = algo.transform([fixture])
    expect(records[0]).toMatchObject({
      objectId: 'totally custom',
      type: 'invented',
      rev: 'made up',
    })
  })
})

describe('type index map', () => {
  it('uses custom projection if specified for type', () => {
    const postIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const articleIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const indexMap = {
      post: { index: (postIndex as unknown) as SearchIndex },
      article: {
        index: (articleIndex as unknown) as SearchIndex,
        projection: `{ authors[]-> }`,
      },
    }
    const result = indexMapProjection(indexMap)
    expect(result).toEqual(`{
  _id,
  _type,
  _rev,
  _type == "post" => {...},
  _type == "article" => { authors[]-> }
}`)
  })
})

describe('webhookSync', () => {
  test.todo('uses the correct index')

  it('syncs the webhook payload', async () => {
    const postIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const articleIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const i = indexer(
      {
        post: { index: (postIndex as unknown) as SearchIndex },
        article: {
          index: (articleIndex as unknown) as SearchIndex,
          projection: '{"title": "Hardcode"}',
        },
      },
      () => ({
        title: 'Hello',
      }),
      (document) => document._id !== 'ignore-me'
    )

    const client = { fetch: jest.fn() }

    // Fake a result from Sanity
    client.fetch.mockResolvedValueOnce([
      {
        _id: 'create-me',
        _type: 'post',
        _rev: '1',
      },
      {
        _id: 'create-me-too',
        _type: 'article',
        _rev: '1',
      },
      {
        _id: 'update-me',
        _type: 'post',
        _rev: '1',
      },
      {
        _id: 'ignore-me',
        _type: 'post',
        _rev: 1,
      },
    ])

    // @ts-ignore
    await i.webhookSync(client as SanityClient, {
      ids: {
        updated: ['update-me', 'ignore-me'],
        created: ['create-me', 'create-me-too'],
        deleted: ['delete-me'],
      },
    })

    // Check that we queried for the updated and created objects of the types we
    // are interested in
    expect(client.fetch.mock.calls.length).toBe(1)
    // Check no custom projection (... fetches all fields)
    expect(client.fetch.mock.calls[0][0]).toContain('_type == "post" => {...}')
    // Check the custom projection
    expect(client.fetch.mock.calls[0][0]).toContain(
      '_type == "article" => {"title": "Hardcode"}'
    )
    expect(client.fetch.mock.calls[0][1]).toMatchObject({
      created: ['create-me', 'create-me-too'],
      updated: ['update-me', 'ignore-me'],
      types: ['post', 'article'],
    })

    expect(postIndex.saveObjects.mock.calls.length).toBe(1)
    expect(articleIndex.saveObjects.mock.calls.length).toBe(1)

    const savedPostIndexIds = postIndex.saveObjects.mock.calls[0][0].map(
      (object: Record<string, any>) => object['objectID']
    )
    expect(savedPostIndexIds).toEqual(['create-me', 'update-me'])

    const savedArticleIndexIds = articleIndex.saveObjects.mock.calls[0][0].map(
      (object: Record<string, any>) => object['objectID']
    )
    expect(savedArticleIndexIds).toEqual(['create-me-too'])

    expect(postIndex.deleteObjects.mock.calls.length).toBe(1)
    expect(articleIndex.deleteObjects.mock.calls.length).toBe(1)

    const deletedPostIndexIds = postIndex.deleteObjects.mock.calls[0][0]
    const deletedArticleIndexIds = articleIndex.deleteObjects.mock.calls[0][0]
    // We expect that we asked Algolia to try to delete the delete-me document,
    // and also try to delete the ignore-me document, since it may have been
    // indexed before
    expect(deletedPostIndexIds).toEqual(['delete-me', 'ignore-me'])
    expect(deletedArticleIndexIds).toEqual(['delete-me', 'ignore-me'])
  })
})
