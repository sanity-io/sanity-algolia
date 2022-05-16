import indexer, { indexMapProjection } from '../src/index'
import fixture from './fixtures/internalFaq.json'
import { SearchIndex } from 'algoliasearch'
import { SanityClient } from '@sanity/client'

const mockIndex = {} as SearchIndex

describe('transform', () => {
  it('includes standard values for some standard properties', async () => {
    const algo = indexer(
      {
        internalFaq: { index: mockIndex },
      },
      () => ({})
    )

    const record = (await algo.transform([fixture]))[0]
    expect(record.objectID).toEqual(fixture._id)
    expect(record.type).toEqual(fixture._type)
    expect(record.rev).toEqual(fixture._rev)
  })

  it('serialized according to passed function', async () => {
    const algo = indexer({ internalFaq: { index: mockIndex } }, (document) => {
      return {
        title: document.title,
        body: 'flattened body',
        weirdField: 29,
        keywords: document.keywords,
      }
    })

    const records = await algo.transform([fixture])
    expect(records[0]).toMatchObject({
      title: fixture.title,
      body: 'flattened body',
      weirdField: 29,
      keywords: fixture.keywords,
    })
  })

  it('serialized according to passed async function', async () => {
    const algo = indexer({ internalFaq: { index: mockIndex } }, (document) => {
      return Promise.resolve({
        title: document.title,
        body: 'flattened body',
        weirdField: 29,
        keywords: document.keywords,
      })
    })

    const records = await algo.transform([fixture])
    expect(records[0]).toMatchObject({
      title: fixture.title,
      body: 'flattened body',
      weirdField: 29,
      keywords: fixture.keywords,
    })
  })

  it('can override default values', async () => {
    const algo = indexer({ internalFaq: { index: mockIndex } }, (_document) => {
      return {
        objectID: 'totally custom',
        type: 'invented',
        rev: 'made up',
      }
    })

    const records = await algo.transform([fixture])
    expect(records[0]).toMatchObject({
      objectID: 'totally custom',
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

    await i.webhookSync((client as unknown) as SanityClient, {
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

  it('uses the correct index', async () => {
    const sharedIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const authorIndex = {
      saveObjects: jest.fn(),
      deleteObjects: jest.fn(),
    }

    const i = indexer(
      {
        post: { index: (sharedIndex as unknown) as SearchIndex },
        article: { index: (sharedIndex as unknown) as SearchIndex },
        author: { index: (authorIndex as unknown) as SearchIndex },
      },
      () => ({
        title: 'Hello',
      })
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
        _rev: '2',
      },
      {
        _id: 'update-me-too',
        _type: 'article',
        _rev: '2',
      },
      {
        _id: 'john_doe',
        _type: 'author',
        _rev: '1',
      },
      {
        _id: 'jane_doe',
        _type: 'author',
        _rev: '2',
      },
    ])

    const webhookBody = {
      ids: {
        updated: ['update-me', 'update-me-too', 'jane_doe'],
        created: ['create-me', 'create-me-too', 'john_doe'],
        deleted: ['delete-me', 'delete-me-too', 'richard_roe'],
      },
    }
    await i.webhookSync((client as unknown) as SanityClient, webhookBody)

    expect(sharedIndex.saveObjects.mock.calls.length).toBe(2)
    expect(sharedIndex.deleteObjects.mock.calls.length).toBe(1)

    expect(authorIndex.saveObjects.mock.calls.length).toBe(1)
    expect(authorIndex.deleteObjects.mock.calls.length).toBe(1)

    const savedSharedIndexIds = sharedIndex.saveObjects.mock.calls
      .reduce((acc, next) => acc.concat(next), [])
      .flat()
      .map((object: Record<string, any>) => object['objectID'])
    expect(savedSharedIndexIds).toEqual([
      'create-me',
      'update-me',
      'create-me-too',
      'update-me-too',
    ])

    const savedAuthorIndexIds = authorIndex.saveObjects.mock.calls
      .reduce((acc, next) => acc.concat(next), [])
      .flat()
      .map((object: Record<string, any>) => object['objectID'])
    expect(savedAuthorIndexIds).toEqual(['john_doe', 'jane_doe'])

    const deletedSharedIndexIds = sharedIndex.deleteObjects.mock.calls[0][0]
    const deletedAuthorIndexIds = authorIndex.deleteObjects.mock.calls[0][0]
    expect(deletedSharedIndexIds).toEqual(webhookBody.ids.deleted)
    expect(deletedAuthorIndexIds).toEqual(webhookBody.ids.deleted)
  })
})
