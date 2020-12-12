# Sanity + Algolia = ♥️

Here are some helpers to facilitate indexing your Sanity documents as Algolia records, via custom serializing, optional hidden/visibility filtering and directly syncing to an Algolia index from a Sanity webhook endpoint.

## Webhook example

This is an example of indexing Sanity content in Algolia directly from a [Sanity webhook](https://www.sanity.io/docs/webhooks) receiver. The receving function can be a serverless function running on Vercel, Netlify, AWS etc. You can configure Sanity webhooks at [manage.sanity.io](https://manage.sanity.io) or via the `sanity hook` command from your Sanity Studio folder.

### Installing

```
npm i sanity-algolia
```

### Use in your serverless function

```typescript
import algoliasearch from "algoliasearch";
import sanityClient, { SanityDocumentStub } from "@sanity/client";
import { NowRequest, NowResponse } from "@vercel/node";
import indexer, { flattenBlocks } from "sanity-algolia";

const algolia = algoliasearch("application-id", "api-key");
const sanity = sanityClient({
  projectId: "my-sanity-project-id",
  dataset: "my-dataset-name",
  // If your dataset is private you need to add a read token.
  // You can mint one at https://manage.sanity.io
  token: "read-token",
  useCdn: false,
});

/**
 *  This function receives webhook POSTs from Sanity and updates, creates or
 *  deletes records in the corresponding Algolia indices.
 */
const handler = async (req: NowRequest, res: NowResponse) => {
  // Tip: Its good practice to include a shared secret in your webhook URLs and
  // validate it before proceeding with webhook handling. Omitted in this short
  // example.
  if (req.headers["content-type"] !== "application/json") {
    res.status(400);
    res.json({ message: "Bad request" });
    return;
  }

  // Configure this to match an existing Algolia index name
  const algoliaIndex = algolia.initIndex("my-index");

  const sanityAlgolia = indexer(
    // A mapping of Sanity document _type names and their respective Algolia
    // indices. In this example both document types live in the same index.
    {
      post: algoliaIndex,
      article: algoliaIndex,
    },
    // Serialization function. This is how you go from a Sanity document to an
    // Algolia record. Notice the flattenBlocks method used for extracting the
    // raw string values from portable text in this example.
    (document: SanityDocumentStub) => {
      switch (document._type) {
        case "post":
          return {
            title: document.title,
            path: document.slug.current,
            body: flattenBlocks(document.body),
          };
        case "article":
          return {
            title: document.heading,
            excerpt: flattenBlocks(document.excerpt),
            body: flattenBlocks(document.body),
          };
        default:
          throw new Error("You didnt handle a type you declared interest in");
      }
    },
    // Visibility function (optional).
    //
    // Returning `true` for a given document here specifies that it should be
    // indexed for search in Algolia. This is handy if for instance a field
    // value on the document decides if it should be indexed or not. This would
    // also be the place to implement any `publishedAt` datetime visibility
    // rules or other custom scheme you may have set up.
    (document: SanityDocumentStub) => {
      if (document.hasOwnProperty("isHidden")) {
        return !document.isHidden;
      }
      return true;
    }
  );

  // Finally connect the Sanity webhook payload to Algolia indices via the
  // configured serializers and optional visibility function. `webhookSync` will
  // inspect the webhook payload, make queries back to Sanity with the `sanity`
  // client and make sure the algolia indices are synced to match.
  return sanityAlgolia
    .webhookSync(sanity, req.body)
    .then(() => res.status(200).send("ok"));
};

export default handler;
```

## Todos

- [ ] Use Algolia batch APIs?
- [ ] Example of initial indexing of existing content
- [ ] Handle situations where the record is too large to index.

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/api-client/methods/indexing/)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
