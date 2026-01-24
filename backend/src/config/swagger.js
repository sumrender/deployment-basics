import swaggerJsdoc from 'swagger-jsdoc';
import config from './ConfigService.js';

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Todo Backend API',
      version: '1.0.0',
      description: 'Express backend API with MongoDB and Elasticsearch for todo management, including resource hog endpoints for Kubernetes scaling tests.',
      contact: {
        name: 'API Support',
      },
    },
    servers: [
      {
        url: `http://localhost:${config.getPort()}`,
        description: 'Development server',
      },
      {
        url: 'http://localhost:3000',
        description: 'Default development server',
      },
    ],
    tags: [
      {
        name: 'Health',
        description: 'Health check and status endpoints',
      },
      {
        name: 'MongoDB',
        description: 'MongoDB todo operations',
      },
      {
        name: 'Elasticsearch',
        description: 'Elasticsearch todo operations',
      },
      {
        name: 'Resource Hog',
        description: 'Resource consumption endpoints for Kubernetes scaling tests',
      },
    ],
    components: {
      schemas: {
        Todo: {
          type: 'object',
          required: ['title'],
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the todo',
              example: '507f1f77bcf86cd799439011',
            },
            title: {
              type: 'string',
              description: 'Todo title',
              example: 'Buy groceries',
            },
            completed: {
              type: 'boolean',
              description: 'Completion status',
              example: false,
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              description: 'Creation timestamp',
              example: '2024-01-24T10:30:00.000Z',
            },
          },
        },
        TodoInput: {
          type: 'object',
          required: ['title'],
          properties: {
            title: {
              type: 'string',
              description: 'Todo title',
              example: 'Buy groceries',
            },
            completed: {
              type: 'boolean',
              description: 'Completion status (optional, defaults to false)',
              example: false,
            },
          },
        },
        HealthResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              description: 'Overall service status',
              example: 'IAAAAAAAAC',
            },
            mongodb: {
              type: 'string',
              enum: ['connected', 'disconnected'],
              description: 'MongoDB connection status',
              example: 'connected',
            },
            elasticsearch: {
              type: 'string',
              enum: ['connected', 'disconnected'],
              description: 'Elasticsearch connection status',
              example: 'connected',
            },
          },
        },
        HogConfig: {
          type: 'object',
          properties: {
            memoryMb: {
              type: 'integer',
              description: 'Memory to allocate in MB (clamped between 0-2048)',
              example: 256,
              minimum: 0,
              maximum: 2048,
            },
            cpuSliceMs: {
              type: 'integer',
              description: 'CPU slice duration in milliseconds (clamped between 1-200)',
              example: 20,
              minimum: 1,
              maximum: 200,
            },
            maxMinutes: {
              type: 'integer',
              description: 'Maximum runtime in minutes (clamped between 1-120)',
              example: 10,
              minimum: 1,
              maximum: 120,
            },
          },
        },
        HogStartResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['started', 'already_running'],
              description: 'Operation status',
              example: 'started',
            },
            config: {
              $ref: '#/components/schemas/HogConfig',
            },
            startedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when hog was started',
              example: '2024-01-24T10:30:00.000Z',
            },
            message: {
              type: 'string',
              description: 'Status message',
              example: 'Resource hog started. Will auto-stop after 10 minutes.',
            },
          },
        },
        HogStopResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['stopped', 'not_running'],
              description: 'Operation status',
              example: 'stopped',
            },
            config: {
              $ref: '#/components/schemas/HogConfig',
            },
            runtime: {
              type: 'string',
              description: 'Total runtime duration',
              example: '45 seconds',
            },
            message: {
              type: 'string',
              description: 'Status message',
              example: 'Resource hog stopped successfully.',
            },
          },
        },
        HogStatusResponse: {
          type: 'object',
          properties: {
            status: {
              type: 'string',
              enum: ['running', 'not_running'],
              description: 'Current hog status',
              example: 'running',
            },
            config: {
              $ref: '#/components/schemas/HogConfig',
            },
            startedAt: {
              type: 'string',
              format: 'date-time',
              description: 'Timestamp when hog was started',
              example: '2024-01-24T10:30:00.000Z',
            },
            runtime: {
              type: 'string',
              description: 'Current runtime duration',
              example: '45 seconds',
            },
          },
        },
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'string',
              description: 'Error message',
              example: 'Failed to create todo',
            },
            details: {
              type: 'string',
              description: 'Additional error details',
              example: 'Database connection failed',
            },
          },
        },
      },
    },
  },
  apis: ['./src/routes/*.js'], // Path to the API routes
};

const swaggerSpec = swaggerJsdoc(options);

export default swaggerSpec;
