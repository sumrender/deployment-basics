import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Singleton hog state
let hogState = {
  worker: null,
  config: null,
  startedAt: null,
};

/**
 * Parse and clamp configuration from query params
 */
function parseConfig(query) {
  const memoryMb = Math.max(0, Math.min(2048, parseInt(query.memoryMb || '256', 10) || 256));
  const cpuSliceMs = Math.max(1, Math.min(200, parseInt(query.cpuSliceMs || '20', 10) || 20));
  const maxMinutes = Math.max(1, Math.min(120, parseInt(query.maxMinutes || '10', 10) || 10));
  const intensityMultiplier = Math.max(1, Math.min(100, parseInt(query.intensityMultiplier || '2', 10) || 2));
  
  return { memoryMb, cpuSliceMs, maxMinutes, intensityMultiplier };
}

/**
 * Start resource hog
 */
export const startHog = async (req, res) => {
  try {
    // Stop existing worker if running (allows dynamic config updates)
    if (hogState.worker) {
      console.log('🔄 Stopping existing worker to start with new configuration');
      hogState.worker.postMessage({ type: 'stop' });
      hogState.worker.terminate();
      hogState.worker = null;
      hogState.config = null;
      hogState.startedAt = null;
    }
    
    // Parse configuration from query params
    const config = parseConfig(req.query);
    
    console.log('🔥 Starting resource hog with config:', config);
    
    // Create worker thread
    const workerPath = join(__dirname, '../workers/hogWorker.js');
    const worker = new Worker(workerPath, {
      env: {
        ...process.env,
        HOG_CONFIG: JSON.stringify(config),
      },
    });
    
    // Handle worker events
    worker.on('error', (err) => {
      console.error('❌ Worker error:', err);
      hogState.worker = null;
      hogState.config = null;
      hogState.startedAt = null;
    });
    
    worker.on('exit', (code) => {
      console.log(`🛑 Worker exited with code ${code}`);
      hogState.worker = null;
      hogState.config = null;
      hogState.startedAt = null;
    });
    
    worker.on('message', (msg) => {
      console.log('[Worker message]:', msg);
    });
    
    // Store state
    hogState.worker = worker;
    hogState.config = config;
    hogState.startedAt = new Date().toISOString();
    
    res.status(202).json({
      status: 'started',
      config,
      startedAt: hogState.startedAt,
      message: `Resource hog started. Will auto-stop after ${config.maxMinutes} minutes.`,
    });
  } catch (error) {
    console.error('Error starting resource hog:', error);
    res.status(500).json({ error: 'Failed to start resource hog', details: error.message });
  }
};

/**
 * Stop resource hog
 */
export const stopHog = async (req, res) => {
  try {
    // Check if running
    if (!hogState.worker) {
      return res.status(200).json({
        status: 'not_running',
        message: 'Resource hog is not currently running.',
      });
    }
    
    console.log('🛑 Stopping resource hog');
    
    // Send stop message to worker
    hogState.worker.postMessage({ type: 'stop' });
    
    // Force terminate after 1 second if it hasn't stopped
    setTimeout(() => {
      if (hogState.worker) {
        console.log('⚠️  Force terminating worker');
        hogState.worker.terminate();
        hogState.worker = null;
        hogState.config = null;
        hogState.startedAt = null;
      }
    }, 1000);
    
    const stoppedConfig = hogState.config;
    const runtime = hogState.startedAt 
      ? Math.floor((Date.now() - new Date(hogState.startedAt).getTime()) / 1000)
      : 0;
    
    // Clear state immediately
    hogState.worker = null;
    hogState.config = null;
    hogState.startedAt = null;
    
    res.status(200).json({
      status: 'stopped',
      config: stoppedConfig,
      runtime: `${runtime} seconds`,
      message: 'Resource hog stopped successfully.',
    });
  } catch (error) {
    console.error('Error stopping resource hog:', error);
    res.status(500).json({ error: 'Failed to stop resource hog', details: error.message });
  }
};

/**
 * Get hog status
 */
export const getHogStatus = async (req, res) => {
  try {
    if (!hogState.worker) {
      return res.status(200).json({
        status: 'not_running',
      });
    }
    
    const runtime = hogState.startedAt 
      ? Math.floor((Date.now() - new Date(hogState.startedAt).getTime()) / 1000)
      : 0;
    
    res.status(200).json({
      status: 'running',
      config: hogState.config,
      startedAt: hogState.startedAt,
      runtime: `${runtime} seconds`,
    });
  } catch (error) {
    console.error('Error getting hog status:', error);
    res.status(500).json({ error: 'Failed to get hog status', details: error.message });
  }
};
