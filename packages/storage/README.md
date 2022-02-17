# Local Emulation of [Apify Storage](https://apify.com/storage)
This package helps with local development of Apify Actors, by providing an emulation layer
for Apify cloud Storage. Interface of this package replicates the [Apify API client
for JavaScript](https://github.com/apify/apify-client-js) and can be used as its local
replacement.

[Apify SDK](https://sdk.apify.com) is the main consumer of this package. It allows the SDK
to be used without access to the Apify Platform.

## How to build from source

If you are working on this module, or would like to contribute to it, and need to test your changes locally,
here are the build steps to get this module up and running.

1. Install dependencies via `npm i`
2. Run the `build` script (`npm run build`)

The compiled code will be found in the `dist` folder that gets created.
