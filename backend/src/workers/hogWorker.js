import { parentPort } from 'worker_threads';

let stopped = false;
let allocatedMemory = [];
let stopTimeout = null;

// Listen for stop messages from parent
if (parentPort) {
  parentPort.on('message', (msg) => {
    if (msg.type === 'stop') {
      stopped = true;
      if (stopTimeout) {
        clearTimeout(stopTimeout);
      }
      process.exit(0);
    }
  });
}

/**
 * CPU burn function - busy loop for specified duration
 */
function burnCPU(durationMs) {
  const start = Date.now();
  let iterations = 0;
  
  while (Date.now() - start < durationMs) {
    // Perform some CPU-intensive work
    Math.sqrt(Math.random() * 1000000);
    Math.sin(Math.random() * Math.PI);
    Math.cos(Math.random() * Math.PI);
    iterations++;
  }
  
  return iterations;
}

/**
 * Allocate memory in chunks
 */
function allocateMemory(targetMb) {
  const chunkSize = 8 * 1024 * 1024; // 8MB chunks
  const targetBytes = targetMb * 1024 * 1024;
  let allocated = 0;
  
  console.log(`[Worker] Starting memory allocation: ${targetMb}MB`);
  
  while (allocated < targetBytes && !stopped) {
    const chunk = Buffer.alloc(chunkSize);
    // Write to buffer to ensure it's actually allocated
    chunk.fill(Math.floor(Math.random() * 256));
    allocatedMemory.push(chunk);
    allocated += chunkSize;
    
    // Occasionally log progress
    if (allocatedMemory.length % 32 === 0) {
      console.log(`[Worker] Allocated ${Math.floor(allocated / 1024 / 1024)}MB`);
    }
  }
  
  console.log(`[Worker] Memory allocation complete: ${Math.floor(allocated / 1024 / 1024)}MB`);
}

/**
 * Main worker loop
 */
function startHog(config) {
  const { memoryMb, cpuSliceMs, maxMinutes } = config;
  
  console.log('[Worker] Starting resource hog with config:', config);
  
  // Set auto-stop timer
  stopTimeout = setTimeout(() => {
    console.log(`[Worker] Auto-stopping after ${maxMinutes} minutes`);
    stopped = true;
    process.exit(0);
  }, maxMinutes * 60 * 1000);
  
  // Allocate memory first
  if (memoryMb > 0) {
    allocateMemory(memoryMb);
  }
  
  // Start CPU burn loop
  console.log('[Worker] Starting CPU burn loop');
  
  function cpuLoop() {
    if (stopped) {
      console.log('[Worker] Stopping CPU burn loop');
      process.exit(0);
      return;
    }
    
    // Burn CPU for the specified slice
    burnCPU(cpuSliceMs);
    
    // Yield control back to event loop
    setImmediate(cpuLoop);
  }
  
  cpuLoop();
}

// Start the hog when worker is initialized
const config = process.env.HOG_CONFIG ? JSON.parse(process.env.HOG_CONFIG) : {};
startHog(config);
