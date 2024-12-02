# Sanity + Algolia = ♥️

## Algolia v5

Algolia v5 JavaScript API client had some [breaking changes](https://www.algolia.com/doc/libraries/javascript/v5/upgrade/) since v4, it's better to start from scratch if you're starting indexing with Algolia v5. 

Use **branch v5**.

This example shows a serverless function to start initial indexing with Algolia v5 as well as incremental updates, with Webhook instructions:

## Webhook
Set up the following [Webhook](https://www.sanity.io/manage/webhooks/share?name=Algolia%20Indexing&description=indexes%20content%20for%20Algolia&url=https%3A%2F%2Fnextjs-sanity-algolia.vercel.app%2Fapi%2Falgolia&on=create&on=update&on=delete&filter=_type%20%3D%3D%27post%27&projection=%7B%0A%20%20%22transactionId%22%3A%20_rev%2C%0A%20%20%22projectId%22%3A%20sanity%3A%3AprojectId()%2C%0A%22dataset%22%3A%20sanity%3A%3Adataset()%2C%0A_id%2C%0A%22operation%22%3A%20delta%3A%3Aoperation()%2C%0A%22value%22%3A%20%7B%0A%20%20%20%20%22objectID%22%3A%20_id%2C%0A%20%20%20%20%22title%22%3A%20title%2C%0A%20%20%20%20%22slug%22%3A%20slug.current%2C%0A%20%20%20%20%22body%22%3A%20pt%3A%3Atext(content)%2C%0A%20%20%20%20%22_type%22%3A%20_type%2C%0A%20%20%20%20%22coverImage%22%3A%20coverImage%2C%0A%20%20%20%20%22date%22%3A%20date%2C%0A%20%20%20%20%22_createdAt%22%3A%20_createdAt%2C%0A%20%20%20%20%22_updatedAt%22%3A%20_updatedAt%0A%20%20%7D%0A%7D%0A&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=&headers=%7B%7D) in Sanity.

Adjust content types according to your schema, as well as GROQ projection inside `value` object.

You should configure your [webhook](https://www.sanity.io/docs/webhooks) to target the URL of the serverless function once deployed.

After deployment you can view the [Webhook attempts log](https://www.sanity.io/docs/webhooks#fba4a0f4c743) to determine whether your webhook was successfully delivered.

## Serverless function

The logic inside `api/algolia.ts` handles both first-time indexing and incremental updates.

### Environment variables

You will need to add `algoliaAppId` and `algoliaApiKey` which can be found inside your Algolia account.
You will also need your `projectId` and `dataset` name to initiate Sanity client.

### Initial indexing

If you’re indexing for the first time, you have to run the command below to start it and include query params `initialIndex=true`. 

```
curl -X POST "http://localhost:3000/api/algolia?initialIndex=true"
```

After you run the above command, it will create a new index in Algolia and it will use Algolia’s v5 function `saveObjects` to add existing documents to the index. 

### Incremental indexing

For incremental indexing, the Webhook provides `operation` parameter, and it will either be `create, update or delete`. The code in serverless function uses Algolia v5 (`deleteObject` or `saveObject`) accordingly to update it’s index incrementally.

---
## Instructions for Algolia v4

Here are some helpers to facilitate indexing your Sanity documents as Algolia
records, via custom serializing, optional hidden/visibility filtering and
directly syncing to an Algolia index from a Sanity webhook.

## Steps to implement

1. Set up one or more webhooks on Sanity to trigger when content is created, edited or deleted.
2. Deploy a serverless function to receive the webhook payload and update Algolia index

### Setup webhook

This is an example of indexing Sanity content in Algolia directly from a [Sanity
webhook](https://www.sanity.io/docs/webhooks). The target of the webhook is a
serverless function running on Vercel, Netlify, AWS etc.

Set up the [following Webhook on
Sanity](https://www.sanity.io/manage/webhooks/share?name=Legacy+webhook&description=Recreation+of+legacy+webhooks&url=&on=create&on=delete&on=update&filter=&projection=%7B%0A++%22transactionId%22%3A+_rev%2C%0A++%22projectId%22%3A+sanity%3A%3AprojectId%28%29%2C%0A++%22dataset%22%3A+sanity%3A%3Adataset%28%29%2C%0A++%22ids%22%3A+%7B%0A++++%22created%22%3A+%5B%0A++++%09select%28before%28%29+%3D%3D+null+%26%26+after%28%29+%21%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22deleted%22%3A+%5B%0A++++++select%28before%28%29+%21%3D+null+%26%26+after%28%29+%3D%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22updated%22%3A+%5B%0A++++++select%28before%28%29+%21%3D+null+%26%26+after%28%29+%21%3D+null+%3D%3E+_id%29%0A++++%5D%2C%0A++++%22all%22%3A+%5B%0A++++++_id%0A++++%5D%0A++%7D%0A%7D&httpMethod=POST&apiVersion=v2021-03-25&includeDrafts=).
It needs to be that specific webhook projection at the moment, as this module is
not yet updated to take advantage of [the new GROQ powered
Webhooks](https://www.sanity.io/blog/introducing-groq-powered-webhooks). You
should configure your webhook to target the URL of the serverless function once
deployed.

#### Deploy serverless function

See examples in the `example/` folder in this repository for how this can be
done. You will want to tailor this code to your own content types and fields,
and do any transformation on your data before its indexed in Algolia.

Note that your serverless hosting might require a build step to properly deploy
your serverless functions, and that the exported handler and passed parameters
might differ from the included examples. Please refer to documentation on
deploying functions at your hosting service of choice in order to adapt it to
your own needs.

## First time indexing

The webhook is great for keeping Algolia up to date to new changes in your
Sanity datasets, but you likely also want to first index any content you already
have. The simplest way to do this is to run the `sanityAlgolia.webhookSync`
method manually. For ease of use you can export the sanity client and the
sanityAlgolia objects from your handler file exemplified above and make use of
them like this

```javascript
const sanity = ...; // configured Sanity client
const sanityAlgolia = ...; // configured sanity-algolia

// Fetch the _id of all the documents we want to index
const types = ["article", "page", "product", "author"];
const query = `* [_type in $types && !(_id in path("drafts.**"))][]._id`

sanity.fetch(query, { types }).then(ids =>
  sanityAlgolia.webhookSync(sanity, { ids: { created: ids, updated: [], deleted: [] }})
)
```

## Links

- [Sanity webhook documentataion](https://www.sanity.io/docs/webhooks)
- [Algolia indexing documentation](https://www.algolia.com/doc/api-client/methods/indexing/)
- [The GROQ Query language](https://www.sanity.io/docs/groq)
- [Vercel Serverless Functions documentation](https://vercel.com/docs/serverless-functions/introduction)
- [Netlify functions documentation](https://docs.netlify.com/functions/build-with-javascript/)
