import express from 'express';
import mongoose from 'mongoose';
import { createTodo, getTodos } from '../controllers/dbController.js';
import { indexTodo, searchTodos } from '../controllers/esController.js';
import { startHog, stopHog, getHogStatus } from '../controllers/hogController.js';
import { getElasticsearchClient } from '../config/database.js';

const router = express.Router();

// MongoDB routes
router.post('/db', createTodo);
router.get('/db', getTodos);

// Elasticsearch routes
router.post('/es', indexTodo);
router.get('/es', searchTodos);

// Resource hog routes for K8s scaling tests
router.post('/hog-resources', startHog);
router.post('/clear-hog-resources', stopHog);
router.get('/hog-status', getHogStatus);

// Health check
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

