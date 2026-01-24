import express from 'express';
import mongoose from 'mongoose';
import { createTodo, getTodos } from '../controllers/dbController.js';
import { indexTodo, searchTodos } from '../controllers/esController.js';
import { startHog, stopHog, getHogStatus } from '../controllers/hogController.js';
import { getElasticsearchClient } from '../config/database.js';

const router = express.Router();

/**
 * @swagger
 * /db:
 *   post:
 *     summary: Create a new todo in MongoDB
 *     description: Creates a new todo item and automatically indexes it in Elasticsearch
 *     tags: [MongoDB]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TodoInput'
 *           examples:
 *             example1:
 *               value:
 *                 title: Buy groceries
 *                 completed: false
 *     responses:
 *       201:
 *         description: Todo created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Todo'
 *       400:
 *         description: Bad request - title is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             example:
 *               error: Title is required
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/db', createTodo);

/**
 * @swagger
 * /db:
 *   get:
 *     summary: Get all todos from MongoDB
 *     description: Retrieves all todos sorted by creation date (newest first)
 *     tags: [MongoDB]
 *     responses:
 *       200:
 *         description: List of todos retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Todo'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/db', getTodos);

/**
 * @swagger
 * /es:
 *   post:
 *     summary: Index a todo in Elasticsearch
 *     description: Creates a new todo document directly in Elasticsearch
 *     tags: [Elasticsearch]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TodoInput'
 *           examples:
 *             example1:
 *               value:
 *                 title: Learn Kubernetes
 *                 completed: false
 *     responses:
 *       201:
 *         description: Todo indexed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Todo'
 *       400:
 *         description: Bad request - title is required
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/es', indexTodo);

/**
 * @swagger
 * /es:
 *   get:
 *     summary: Search todos in Elasticsearch
 *     description: Search for todos using wildcard matching on title. Returns all todos if no query provided.
 *     tags: [Elasticsearch]
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         required: false
 *         description: Search query for todo title (case-insensitive wildcard match)
 *         example: groceries
 *     responses:
 *       200:
 *         description: Search results retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Todo'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/es', searchTodos);

/**
 * @swagger
 * /hog-resources:
 *   post:
 *     summary: Start resource hog for K8s scaling tests
 *     description: Starts a worker thread that consumes specified amounts of memory and CPU for testing Kubernetes horizontal pod autoscaling (HPA)
 *     tags: [Resource Hog]
 *     parameters:
 *       - in: query
 *         name: memoryMb
 *         schema:
 *           type: integer
 *           default: 256
 *           minimum: 0
 *           maximum: 2048
 *         description: Memory to allocate in MB (clamped between 0-2048)
 *       - in: query
 *         name: cpuSliceMs
 *         schema:
 *           type: integer
 *           default: 20
 *           minimum: 1
 *           maximum: 200
 *         description: CPU slice duration in milliseconds (clamped between 1-200)
 *       - in: query
 *         name: maxMinutes
 *         schema:
 *           type: integer
 *           default: 10
 *           minimum: 1
 *           maximum: 120
 *         description: Maximum runtime in minutes (clamped between 1-120), auto-stops after this duration
 *     responses:
 *       202:
 *         description: Resource hog started successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HogStartResponse'
 *       409:
 *         description: Resource hog is already running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HogStartResponse'
 *             example:
 *               status: already_running
 *               config:
 *                 memoryMb: 256
 *                 cpuSliceMs: 20
 *                 maxMinutes: 10
 *               startedAt: '2024-01-24T10:30:00.000Z'
 *               message: Resource hog is already running. Use POST /clear-hog-resources to stop it first.
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/hog-resources', startHog);

/**
 * @swagger
 * /clear-hog-resources:
 *   post:
 *     summary: Stop the running resource hog
 *     description: Stops the currently running resource hog worker thread
 *     tags: [Resource Hog]
 *     responses:
 *       200:
 *         description: Resource hog stopped or was not running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HogStopResponse'
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/clear-hog-resources', stopHog);

/**
 * @swagger
 * /hog-status:
 *   get:
 *     summary: Get resource hog status
 *     description: Returns the current status of the resource hog, including configuration and runtime if running
 *     tags: [Resource Hog]
 *     responses:
 *       200:
 *         description: Status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HogStatusResponse'
 *             examples:
 *               running:
 *                 value:
 *                   status: running
 *                   config:
 *                     memoryMb: 256
 *                     cpuSliceMs: 20
 *                     maxMinutes: 10
 *                   startedAt: '2024-01-24T10:30:00.000Z'
 *                   runtime: 45 seconds
 *               notRunning:
 *                 value:
 *                   status: not_running
 *       500:
 *         description: Internal server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/hog-status', getHogStatus);

/**
 * @swagger
 * /:
 *   get:
 *     summary: Health check endpoint
 *     description: Returns the health status of the service including MongoDB and Elasticsearch connection status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/HealthResponse'
 *       500:
 *         description: Service encountered an error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: error
 *                 error:
 *                   type: string
 *                   example: Connection failed
 */
router.get('/', async (req, res) => {
  try {
    let mongoStatus = 'disconnected';
    let esStatus = 'disconnected';
    
    // Check MongoDB connection
    try {
      if (mongoose.connection.readyState === 1) {
        mongoStatus = 'connected';
      }
    } catch (error) {
      mongoStatus = 'disconnected';
    }
    
    // Check Elasticsearch connection
    try {
      const client = getElasticsearchClient();
      await client.ping();
      esStatus = 'connected';
    } catch (error) {
      esStatus = 'disconnected';
    }

    res.status(200).json({
      status: 'IAAAAAAAAC',
      mongodb: mongoStatus,
      elasticsearch: esStatus,
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      error: error.message,
    });
  }
});

export default router;

