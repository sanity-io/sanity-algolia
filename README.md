# Sanity + Algolia = ♥️

We completely changed how this works, you no longer need helper function. 
If you need to access the code for indexing with Algolia v4, see this [tagged branch](https://github.com/sanity-io/sanity-algolia/tree/1.1.0).

## Upgrade section - from sanity-algolia 1.1.0
Algolia v5 JavaScript API client had some [breaking changes](https://www.algolia.com/doc/libraries/javascript/v5/upgrade/) since v4, it's better to start from scratch if you're starting indexing with Algolia v5. 

The example below shows a serverless function to start initial indexing with Algolia v5 as well as incremental updates, with Webhook instructions. We will be using [Algolia Search API client](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/) which is part of the `algoliasearch` package.

## Steps to implement

1. Set up one or more webhooks on Sanity to trigger when content is created, edited or deleted.
2. Deploy a serverless function to receive the webhook payload and update Algolia index

### Setup Webhook
Set up the following [Webhook](https://www.sanity.io/manage/webhooks/share?name=Algolia%20Indexing&description=indexes%20content%20for%20Algolia&url=https%3A%2F%2Fnextjs-sanity-algolia.vercel.app%2Fapi%2Falgolia&on=create&on=update&on=delete&filter=_type%20%3D%3D%27post%27&projection=%7B%0A%20%20%22transactionId%22%3A%20_rev%2C%0A%20%20%22projectId%22%3A%20sanity%3A%3AprojectId()%2C%0A%22dataset%22%3A%20sanity%3A%3Adataset()%2C%0A_id%2C%0A%22operation%22%3A%20delta%3A%3Aoperation()%2C%0A%22value%22%3A%20%7B%0A%20%20%20%20%22objectID%22%3A%20_id%2C%0A%20%20%20%20%22title%22%3A%20title%2C%0A%20%20%20%20%22slug%22%3A%20slug.current%2C%0A%20%20%20%20%22body%22%3A%20pt%3A%3Atext(content)%2C%0A%20%20%20%20%22_type%22%3A%20_type%2C%0A%20%20%20%20%22coverImage%22%3A%20coverImage%2C%0A%20%20%20%20%22date%22%3A%20date%2C%0A%20%20%20%20%22_createdAt%22%3A%20_createdAt%2C%0A%20%20%20%20%22_updatedAt%22%3A%20_updatedAt%0A%20%20%7D%0A%7D%0A&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=&headers=%7B%7D) in Sanity.

Adjust content types according to your schema, as well as GROQ projection inside `value` object.

You should configure your [webhook](https://www.sanity.io/docs/webhooks) to target the URL of the serverless function once deployed.

After deployment you can view the [Webhook attempts log](https://www.sanity.io/docs/webhooks#fba4a0f4c743) to determine whether your webhook was successfully delivered.

### Deploy Serverless function 

The logic inside `api/algolia.ts` handles both first-time indexing and incremental updates. You can also provide the index name for Algolia.
This example is for Vercel, but you can adapt it for any hosting provider. 

### Environment variables

You will need to add `algoliaAppId` and `algoliaApiKey` which can be found inside your Algolia account.
You will also need your `projectId` and `dataset` name to initiate Sanity client.

### First time indexing

If you’re indexing for the first time, you have to run the command below (with a link to your serverless function) to start it and include query params `initialIndex=true`. 

```
curl -X POST "http://localhost:3000/api/algolia?initialIndex=true"
```

After you run the above command, it will create a new named index in Algolia and it will use Algolia’s v5 function `saveObjects` to add existing documents to the index. 

### Incremental indexing

For incremental indexing, the Webhook provides `operation` parameter, and it will either be `create, update or delete`. The code in serverless function uses Algolia v5 (`deleteObject` or `saveObject`) accordingly to update it’s index incrementally.

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/libraries/javascript/v5/methods/search/)
- [The GROQ Query language](https://www.sanity.io/docs/groq)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Netlify functions documentation](https://docs.netlify.com/functions/build-with-javascript/)
