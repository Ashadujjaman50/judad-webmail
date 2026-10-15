const serverless = require('serverless-http');
const app = require('../../server');

// Wrap Express app with serverless-http handler for Netlify Functions
module.exports.handler = serverless(app);
