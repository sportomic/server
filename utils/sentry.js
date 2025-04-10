const Sentry = require("@sentry/node");

const initSentry = () => {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express(),
    ],
    tracesSampleRate: 1.0,
    environment: process.env.NODE_ENV || "development",
  });
};

const setupSentryErrorHandler = (app) => {
  // The error handler must be registered before any other error middleware and after all controllers
  app.use(Sentry.Handlers.errorHandler());

  // Optional fallthrough error handler
  app.use((err, req, res, next) => {
    res.statusCode = 500;
    res.json({
      error: "Internal Server Error",
      sentryId: res.sentry,
    });
  });
};

module.exports = { Sentry, initSentry, setupSentryErrorHandler };
