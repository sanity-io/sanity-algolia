# Sanity + Algolia = ♥️

Here are some helpers to facilitate indexing your Sanity documents as Algolia records, via custom serializing, optional hidden/visibility filtering and directly syncing to an Algolia index from a Sanity webhook.

## Webhook example

This is an example of indexing Sanity content in Algolia directly from a [Sanity webhook](https://www.sanity.io/docs/webhooks). The target of the webhook is a serverless function running on Vercel, Netlify, AWS etc.

Set up the [following Webhook on Sanity](https://www.sanity.io/manage/webhooks/share?name=Legacy+webhook&description=Recreation+of+legacy+webhooks&url=&on=create&on=delete&on=update&filter=&projection=%7B%0A++%22transactionId%22%3A+_rev%2C%0A++%22projectId%22%3A+sanity%3A%3AprojectId%28%29%2C%0A++%22dataset%22%3A+sanity%3A%3Adataset%28%29%2C%0A++%22ids%22%3A+%7B%0A++++%22created%22%3A+%5B%0A++++%09select%28before%28%29+%3D%3D+null+%26%26+after%28%29+%21%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22deleted%22%3A+%5B%0A++++++select%28before%28%29+%21%3D+null+%26%26+after%28%29+%3D%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22updated%22%3A+%5B%0A++++++select%28before%28%29+%21%3D+null+%26%26+after%28%29+%21%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22all%22%3A+%5B%0A++++++_id%0A++++%5D%0A++%7D%0A%7D&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=). It needs to be that specific webhook projection at the moment, as this module is not yet updated to take advantage of [the new GROQ powered Webhooks](https://www.sanity.io/blog/introducing-groq-powered-webhooks). You should configure your webhook to target the URL of the serverless function once deployed.

### Use in your serverless function

Note that your serverless hosting might require a build step to properly deploy your serverless functions, and that the exported handler and passed parameters might differ from the following example, which is TypeScript on Vercel. Please refer to documentation on deploying functions at your hosting service of choice in order to adapt it to your own needs.

```typescript
import algoliasearch from 'algoliasearch'
import sanityClient, { SanityDocumentStub } from '@sanity/client'
import { NowRequest, NowResponse } from '@vercel/node'
import indexer from 'sanity-algolia'

const algolia = algoliasearch(
  'application-id',
  process.env.ALGOLIA_ADMIN_API_KEY
)
const sanity = sanityClient({
  projectId: 'my-sanity-project-id',
  dataset: 'my-dataset-name',
  // If your dataset is private you need to add a read token.
  // You can mint one at https://manage.sanity.io,
  token: 'read-token',
  apiVersion: '2021-03-25',
  useCdn: false,
})

/**
 *  This function receives webhook POSTs from Sanity and updates, creates or
 *  deletes records in the corresponding Algolia indices.
 */
const handler = (req: NowRequest, res: NowResponse) => {
  // Tip: Its good practice to include a shared secret in your webhook URLs and
  // validate it before proceeding with webhook handling. Omitted in this short
  // example.
  if (req.headers['content-type'] !== 'application/json') {
    res.status(400)
    res.json({ message: 'Bad request' })
    return
  }

  // Configure this to match an existing Algolia index name
  const algoliaIndex = algolia.initIndex('my-index')

  const sanityAlgolia = indexer(
    // The first parameter maps a Sanity document type to its respective Algolia
    // search index. In this example both `post` and `article` Sanity types live
    // in the same Algolia index. Optionally you can also customize how the
    // document is fetched from Sanity by specifying a GROQ projection.
    //
    // In this example we fetch the plain text from Portable Text rich text
    // content via the pt::text function.
    //
    // _id and other system fields are handled automatically.
    {
      post: {
        index: algoliaIndex,
        projection: `{
          title,
          "path": slug.current,
          "body": pt::text(body)
        }`,
      },
      // For the article document in this example we want to resolve a list of
      // references to authors and get their names as an array. We can do this
      // directly in the GROQ query in the custom projection.
      article: {
        index: algoliaIndex,
        projection: `{
          heading,
          "body": pt::text(body),
          "authorNames": authors[]->name
        }`,
      },
    },

    // The second parameter is a function that maps from a fetched Sanity document
    // to an Algolia Record. Here you can do further mutations to the data before
    // it is sent to Algolia.
    (document: SanityDocumentStub) => {
      switch (document._type) {
        case 'post':
          return Object.assign({}, document, {
            custom: 'An additional custom field for posts, perhaps?',
          })
        case 'article':
          return {
            title: document.heading,
            body: document.body,
            authorNames: document.authorNames,
          }
        default:
          return document
      }
    },
    // Visibility function (optional).
    //
    // The third parameter is an optional visibility function. Returning `true`
    // for a given document here specifies that it should be indexed for search
    // in Algolia. This is handy if for instance a field value on the document
    // decides if it should be indexed or not. This would also be the place to
    // implement any `publishedAt` datetime visibility rules or other custom
    // visibility scheme you may be using.
    (document: SanityDocumentStub) => {
      if (document.hasOwnProperty('isHidden')) {
        return !document.isHidden
      }
      return true
    }
  )

  // Finally connect the Sanity webhook payload to Algolia indices via the
  // configured serializers and optional visibility function. `webhookSync` will
  // inspect the webhook payload, make queries back to Sanity with the `sanity`
  // client and make sure the algolia indices are synced to match.
  return sanityAlgolia
    .webhookSync(sanity, req.body)
    .then(() => res.status(200).send('ok'))
}

export default handler
```

## First time indexing

The webhook is great for keeping Algolia up to date to new changes in your Sanity datasets, but you likely also want to first index any content you already have. The simplest way to do this is to run the `sanityAlgolia.webhookSync` method manually. For ease of use you can export the sanity client and the sanityAlgolia objects from your handler file exemplified above and make use of them like this

```javascript
const sanity = ...; // configured Sanity client
const sanityAlgolia = ...; // configured sanity-algolia

// Fetch the _id of all the documents we want to index
const types = ["article", "page", "product", "author"];
const query = `* [_type in $types && !(_id in path("drafts.**"))][]._id`

sanity.fetch(query, { types }).then(ids => 
  sanityAlgolia.webhookSync(client, { ids: { created: ids, updated: [], deleted: [] }})
)
```

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/api-client/methods/indexing/)
- [The GROQ Query language](https://www.sanity.io/docs/groq)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Netlify functions documentation](https://docs.netlify.com/functions/build-with-javascript/)
