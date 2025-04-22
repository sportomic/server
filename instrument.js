// const { init, Handlers } = require("@sentry/node");
// // const { httpIntegration, expressIntegration } = require("@sentry/node");

// init({
//   dsn: "https://71502a48c48034d1e3cfae30a8e459fd@o4509191553155072.ingest.us.sentry.io/4509191636975616",
//   integrations: [
//     // Enable HTTP calls tracing
//     // httpIntegration(),
//     // expressIntegration(),
//   ],
//   tracesSampleRate: 1.0,
//   environment: process.env.NODE_ENV || "development",
// });

// module.exports = {
//   init,
//   Handlers,
//   addIntegration: (integration) => integration,
// };

const Sentry = require("@sentry/node");
const Tracing = require("@sentry/tracing");
const express = require("express");

const app = express();

Sentry.init({
  dsn: "https://71502a48c48034d1e3cfae30a8e459fd@o4509191553155072.ingest.us.sentry.io/4509191636975616", // Replace with your actual DSN
  integrations: [
    // Enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // Enable Express.js middleware tracing
    new Tracing.Integrations.Express({ app }),
  ],
  // Adjust this value in production (0.0 to 1.0)
  tracesSampleRate: 0.1,
});
module.exports = {
  Sentry,
  Tracing,
};
