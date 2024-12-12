# Sanity + Algolia = ♥️

Sanity provides a structured content repository, live editing environment, and scalable content CDN. Algolia gives your application or website users a top-tier search experience. This repository provides an example of how to tie the two platforms together using webhooks and a cloud function. This will allow you to keep your Algolia search index up-to-date as you publish, update, and delete content in Sanity.

## Upgrading from the `sanity-algolia` package
Both Sanity webhooks and the Algolia client have significantly improved since the `sanity-algolia` package was originally released, so much so that the package is no longer necessary. Thus, we recommend refactoring to use GROQ-powered webhooks and the Algolia client directly. See below for details.

If you need to access the code for indexing with Algolia v4, see this [tagged branch](https://github.com/sanity-io/sanity-algolia/tree/1.1.0).

## Steps to implement

The example in this repo demonstrates using a webhook and a serverless function to start initial indexing, as well as incremental updates. We will be using [Algolia Search API client](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/), which is part of the `algoliasearch` package.

1. Set up one or more webhooks on Sanity to trigger when content is created, edited or deleted
2. Deploy a serverless function to receive the webhook payload and update the Algolia index

### Setup webhook in Sanity

You can use copy the filter and projection below, or use this [webhook template](https://www.sanity.io/manage/webhooks/share?name=Algolia%20Indexing&description=indexes%20content%20for%20Algolia&url=https%3A%2F%2Fnextjs-sanity-algolia.vercel.app%2Fapi%2Falgolia&on=create&on=update&on=delete&filter=_type%20%3D%3D%27post%27&projection=%7B%0A%20%20%22transactionId%22%3A%20_rev%2C%0A%20%20%22projectId%22%3A%20sanity%3A%3AprojectId()%2C%0A%22dataset%22%3A%20sanity%3A%3Adataset()%2C%0A_id%2C%0A%22operation%22%3A%20delta%3A%3Aoperation()%2C%0A%22value%22%3A%20%7B%0A%20%20%20%20%22objectID%22%3A%20_id%2C%0A%20%20%20%20%22title%22%3A%20title%2C%0A%20%20%20%20%22slug%22%3A%20slug.current%2C%0A%20%20%20%20%22body%22%3A%20pt%3A%3Atext(content)%2C%0A%20%20%20%20%22_type%22%3A%20_type%2C%0A%20%20%20%20%22coverImage%22%3A%20coverImage%2C%0A%20%20%20%20%22date%22%3A%20date%2C%0A%20%20%20%20%22_createdAt%22%3A%20_createdAt%2C%0A%20%20%20%20%22_updatedAt%22%3A%20_updatedAt%0A%20%20%7D%0A%7D%0A&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=&headers=%7B%7D) in Sanity.

Filter (documents that will trigger webhooks):
```
```
Projection (data to be sent to the serverless function):
```
```

Adjust the filter and projection according to your schema.

Once the serverless function is deployed, you should configure your [webhook](https://www.sanity.io/docs/webhooks) to target the function's URL.

After deployment, you can view the [Webhook attempts log](https://www.sanity.io/docs/webhooks#fba4a0f4c743) to determine whether your webhook was successfully delivered.

### Deploy serverless function 

The logic inside `api/algolia.ts` handles both first-time indexing and incremental updates. You can also provide the index name for Algolia.
This example is for Vercel, but you can adapt it for any hosting provider. 

### Environment variables

You must add `algoliaAppId` and `algoliaApiKey`, which can be found in your Algolia account.
You will also need your `projectId` and `dataset` name to initiate the Sanity client.

### First-time indexing

If you’re indexing for the first time, use the command below (with a link to your serverless function) to start it and include query params `initialIndex=true`. 

```
curl -X POST "http://localhost:3000/api/algolia?initialIndex=true"
```

After you run the above command, it will create a new named index in Algolia and use Algolia’s v5 function `saveObjects` to add existing documents to the index. 

### Incremental indexing

For incremental indexing, the Webhook provides an `operation` parameter, which will be either `create`, `update` or `delete`. The code in the serverless function uses Algolia v5 (`deleteObject` or `saveObject`) accordingly to update its index incrementally.

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/)
- [The GROQ Query language](https://www.sanity.io/docs/groq)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Netlify functions documentation](https://docs.netlify.com/functions/build-with-javascript/)
