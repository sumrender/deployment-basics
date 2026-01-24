import express from 'express';
import cors from 'cors';
import swaggerUi from 'swagger-ui-express';
import config from './config/ConfigService.js';
import { connectMongoDB, connectElasticsearch } from './config/database.js';
import routes from './routes/index.js';
import swaggerSpec from './config/swagger.js';

const app = express();

// Middleware
const corsConfig = config.getCorsConfig();
app.use(cors({
  origin: corsConfig.origin,
  credentials: corsConfig.credentials,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Swagger Documentation
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'Todo Backend API Docs',
}));

// Serve OpenAPI spec as JSON
app.get('/api-docs.json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Redirect /docs to /api-docs for convenience
app.get('/docs', (req, res) => {
  res.redirect('/api-docs');
});

// Routes
app.use('/', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
  try {
    // Print configuration
    config.printConfig();

    // Connect to databases
    await connectMongoDB();
    await connectElasticsearch();

    // Start listening
    const PORT = config.getPort();
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Environment: ${config.getNodeEnv()}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

