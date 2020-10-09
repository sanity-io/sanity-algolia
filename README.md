# Sanity + Algolia = ♥️

Here are some helpers to facilitate serializing your Sanity documents into Algolia records, via custom serializing, optional hidden/visibility filtering and directly syncing to an Algolia index from a Sanity webhook endpoint.

## Webhook example

This is an example of syncing to Algolia directly from a Sanity webhook. The example uses Vercel serverless, but will be mostly the same for any serverless/lambda host.

```typescript
import algoliasearch from 'algoliasearch';
import sanityClient, { SanityDocumentStub } from '@sanity/client';
import { NowRequest, NowResponse } from '@vercel/node';
import indexer, { flattenBlocks } from 'sanity-algolia';
import { AlgoliaRecord } from './src/types';

const algolia = algoliasearch('application-id', 'api-key');
const client = sanityClient({
  projectId: 'my-sanity-project-id',
  dataset: 'my-dataset',
  token: 'my-read-token-if-needed',
  useCdn: false,
});

/**
 *  This function receives webhook POSTs from Sanity and updates, creates or
 *  deletes records in the Algolia index.
 */
const handler = async (req: NowRequest, res: NowResponse) => {
  // Note: Its good practice to include a shared secret in your webhook URLs and
  // validate it before proceeding with webhook handling.
  if (req.headers['content-type'] !== 'application/json') {
    res.status(400);
    res.json({ message: 'Bad request' });
    return;
  }

  const algoliaIndex = algolia.initIndex('my-index');

  const sanityAlgolia = indexer(
    // The Sanity document types we care about
    ['post', 'article'],
    // Serialization function
    (document: SanityDocumentStub): AlgoliaRecord => {
      switch (document._type) {
        case 'post':
          return {
            title: document.title,
            path: document.slug.current,
            body: flattenBlocks(document.body),
          };
        case 'article':
          return {
            title: document.heading,
            excerpt: flattenBlocks(document.excerpt),
            body: flattenBlocks(document.body),
          };
      }
    },
    // Visibility function (optional)
    (document: SanityDocumentStub) => {
      if (document.hasOwnProperty('isHidden')) {
        return !document.isHidden;
      }
      return true;
    }
  );

  return sanityAlgolia
    .webhookSync(algoliaIndex, client, req.body)
    .then(() => res.status(200).send('ok'));
};

export default handler;
```

## Links

[Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
[Algolia indexing documentation](https://www.algolia.com/doc/api-client/methods/indexing/)
