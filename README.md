# Sanity + Algolia = ♥️

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
