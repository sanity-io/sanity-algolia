# Sanity + Algolia = ♥️

Sanity provides a structured content repository, live editing environment, and scalable content CDN. Algolia gives your application or website users a top-tier search experience. This repository provides an example of how to tie the two platforms together using webhooks and a cloud function. This will allow you to keep your Algolia search index up-to-date as you publish, update, and delete content in Sanity.

## Upgrading from the `sanity-algolia` package

Both Sanity webhooks and the Algolia client have significantly improved since the `sanity-algolia` package was originally released, so much so that the package is no longer necessary. Thus, we recommend refactoring to use GROQ-powered webhooks and the Algolia client directly. See below for details.

If you need to access the code for indexing with Algolia v4, see this [tagged branch](https://github.com/sanity-io/sanity-algolia/tree/1.1.0).

## Steps to implement

We have an in-depth guide covering the entire process of creating a NextJS + Sanity site indexed by Algolia you can find [here](https://www.sanity.io/guides/how-to-implement-front-end-search-with-sanity).

The example in this repo demonstrates using a [GROQ-powered webhook](https://www.sanity.io/docs/webhooks) and a serverless function to start initial indexing, as well as provide incremental updates to the index as data changes in Sanity. We will be using [Algolia Search API client](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/), which is part of the `algoliasearch` package.

1. Set up a webhook in Sanity to trigger when content is created, edited or deleted
2. Deploy a serverless function to receive the webhook payload and update the Algolia index

### Set up webhook in Sanity

#### Create webhook

You can use this [webhook template](<https://www.sanity.io/manage/webhooks/share?name=Algolia%20Indexing&description=indexes%20content%20for%20Algolia&url=https%3A%2F%2Fnextjs-sanity-algolia.vercel.app%2Fapi%2Falgolia&on=create&on=update&on=delete&filter=_type%20%3D%3D%27post%27&projection=%7B%0A%20%20%22transactionId%22%3A%20_rev%2C%0A%20%20%22projectId%22%3A%20sanity%3A%3AprojectId()%2C%0A%22dataset%22%3A%20sanity%3A%3Adataset()%2C%0A_id%2C%0A%22operation%22%3A%20delta%3A%3Aoperation()%2C%0A%22value%22%3A%20%7B%0A%20%20%20%20%22objectID%22%3A%20_id%2C%0A%20%20%20%20%22title%22%3A%20title%2C%0A%20%20%20%20%22slug%22%3A%20slug.current%2C%0A%20%20%20%20%22body%22%3A%20pt%3A%3Atext(content)%2C%0A%20%20%20%20%22_type%22%3A%20_type%2C%0A%20%20%20%20%22coverImage%22%3A%20coverImage.asset-%3Eurl%2C%0A%20%20%20%20%22date%22%3A%20date%2C%0A%20%20%20%20%22_createdAt%22%3A%20_createdAt%2C%0A%20%20%20%20%22_updatedAt%22%3A%20_updatedAt%0A%20%20%7D%0A%7D%0A&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=&headers=%7B%7D>) to automatically create the needed webhook in Sanity for you, or manually copy the filter and projection below.

**Filter**: A [GROQ filter](https://www.sanity.io/docs/query-cheat-sheet#3949cadc7524) to define the documents that will trigger the webhook:

```
_type =='post'
```

**Projection**: A [GROQ projection](https://www.sanity.io/docs/query-cheat-sheet#55d30f6804cc) to determine what data will be sent to the serverless function for indexing:

```
{
  "transactionId": _rev,
  "projectId": sanity::projectId(),
  "dataset": sanity::dataset(),
  _id,
  // Returns a string value of "create", "update" or "delete" according to which operation was executed
  "operation": delta::operation(),
  // Define the payload
  "value": {
    "objectID": _id,
    "title": title,
    "slug": slug.current,
    // Portable text
    "body": pt::text(content),
    "_type": _type,
    "coverImage": coverImage.asset->url,
    "date": date,
    "_createdAt": _createdAt,
    "_updatedAt": _updatedAt
  }
}

```

**Secret**: A string used by the function to block unwanted calls to the endpoint. Can be human readable or something harder to guess like a [UUID](https://www.uuidgenerator.net/version4). Take note of what you set here as it will be needed later for the serverless function.

#### Update default values

Once the webhook is created in your Sanity console, you should update the filter and projection according to your schema, and add your own chosen key to the "secret" field.

Once the serverless function is deployed in the next step, you should update your [webhook to target the function's URL](https://www.sanity.io/docs/webhooks#6587655a7ea3).

You can view the [Webhook attempts log](https://www.sanity.io/docs/webhooks#fba4a0f4c743) to determine whether your webhook was successfully delivered.

### Add serverless function

The logic inside `api/algolia.ts` handles both first-time indexing and incremental updates.

This example can be used as-is for a NextJS App Router route handler, but you can adapt it for any framework or serverless function hosting provider.

#### Install dependencies

```bash
npm install algoliasearch @sanity/webhooks @sanity/client
```

Note the client may already be installed or exposed via a framework integration like Next/Nuxt/Astro

#### Environment variables

You must add `ALGOLIA_APP_ID`, `ALGOLIA_INDEX_NAME` and `ALGOLIA_API_KEY`, to your environment variables, which can all be [found in your Algolia account](https://www.algolia.com/doc/guides/security/api-keys/#create-and-manage-your-api-keys). You will also need to add your `SANITY_WEBHOOK_SECRET` from when you set up the webhook.
Finally you will need your Sanity `projectId` and `dataset` name to initiate the Sanity client, in this example they're `SANITY_PROJECT_ID` and `SANITY_DATASET` but you may already have them present if adding to an existing Sanity project.

```
# .env

# Algolia ENV vars
ALGOLIA_APP_ID=your-app-id
ALGOLIA_API_KEY=your-api-key
ALGOLIA_INDEX_NAME=name-of-your-index

# Sanity ENV vars
SANITY_WEBHOOK_SECRET=secret-set-in-webhook-settings
SANITY_PROJECT_ID=your-sanity-project-id
SANITY_DATASET=your-sanity-dataset-name

```

#### Test locally

Testing the webhook flow locally is slightly tricky as you can't point the webhook to `localhost`, as such you must set up a proxy to allow your local dev server to be accessed via the internet. [ngrok](https://ngrok.com/) provides a simple and free option for doing this, or some hosting providers like Netlify allow you to [expose your local dev server](https://docs.netlify.com/cli/local-development/#share-a-live-development-server) with their CLI. Once you have your dev server proxied you can temporarily update the URL used by the webhook to test receiving and responding to events.

#### Deploy serverless function

Once you have the proper environment variables you can deploy your function to whatever provider you prefer to use. Make sure that once the function is deployed you return to your webhook settings to update the URL.

### First-time indexing

If you’re indexing for the first time, use the command below (after updating the URL to your serverless function) to start it and include query params `initialIndex=true`.

```
curl -X POST "http://localhost:3000/api/algolia?initialIndex=true"
```

After you run the above command, it will create a new named index in Algolia and use Algolia’s v5 function `saveObjects` to add existing documents to the index.

### Incremental indexing

For incremental indexing, the Webhook provides an `operation` parameter, which will be either `create`, `update` or `delete`. The code in the serverless function uses Algolia v5 (`deleteObject` or `saveObject`) accordingly to update its index incrementally.

### Indexing long records

Your Algolia plan has limits on the number of records and the size of records you can import. If you exceed these limits, you might get an error: `Algolia error: Record too big`. To work around this Algolia suggests to break the page into sections or even paragraphs, and store each as a separate record. When you split a page, the same content might appear in multiple records. [To avoid duplicates](https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/how-to/indexing-long-documents/#avoid-duplicates), you can turn on `distinct` and set `attributeForDistinct`.
[Indexing long documents with Algolia](https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/how-to/indexing-long-documents/).

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/)
- [Troubleshooting indexing issues](https://www.algolia.com/doc/tools/crawler/troubleshooting/indexing-issues/)
- [Indexing long documents](https://www.algolia.com/doc/guides/sending-and-managing-data/prepare-your-data/how-to/indexing-long-documents/)
- [The GROQ Query language](https://www.sanity.io/docs/groq)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Netlify functions documentation](https://docs.netlify.com/functions/build-with-javascript/)
