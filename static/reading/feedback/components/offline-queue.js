// static/reading/feedback/components/offline-queue.js
// PURPOSE: Queue feedback requests when offline with retry and priority

import { generateRequestId, isOnline, getRetryDelay } from '../utils/feedback-utils.js';

// Queue storage
let offlineQueue = [];
let processing = false;
let maxQueueSize = 100;
let maxRetries = 3;
let online = navigator.onLine;

// Queue statistics
let stats = {
    processed: 0,
    failed: 0,
    pending: 0
};

// Callbacks
let callbacks = {
    onItemProcessed: null,
    onQueueEmpty: null,
    onQueueError: null
};

/**
 * Initialize offline queue
 * @param {Object} options - Configuration options
 */
export function initOfflineQueue(options = {}) {
    if (options.maxQueueSize) maxQueueSize = options.maxQueueSize;
    if (options.maxRetries) maxRetries = options.maxRetries;
    if (options.callbacks) callbacks = { ...callbacks, ...options.callbacks };
    
    // Set up online/offline listeners
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    
    // Load saved queue
    loadQueue();
    
    // Update stats
    stats.pending = offlineQueue.length;
    
    console.log(`📋 Offline queue initialized with ${offlineQueue.length} pending items`);
    
    // If online, start processing
    if (online && offlineQueue.length > 0) {
        processQueue();
    }
}

/**
 * Handle online event
 */
function handleOnline() {
    online = true;
    console.log('📋 Device online, processing queue...');
    dispatchEvent('online');
    
    if (offlineQueue.length > 0) {
        processQueue();
    }
}

/**
 * Handle offline event
 */
function handleOffline() {
    online = false;
    console.log('📋 Device offline, queueing requests');
    dispatchEvent('offline');
}

/**
 * Add item to queue
 * @param {Object} item - Item to queue
 * @param {Object} options - Queue options
 * @param {number} options.priority - Priority (1-10, higher = more important)
 * @param {number} options.maxRetries - Max retries for this item
 * @returns {string} Item ID
 */
export function addToQueue(item, options = {}) {
    if (!item) return null;
    
    // Check queue size
    if (offlineQueue.length >= maxQueueSize) {
        // Remove oldest low-priority item
        const removed = removeOldestLowPriority();
        if (removed) {
            console.log('📋 Removed oldest low-priority item to make space');
        } else {
            console.warn('📋 Queue full, cannot add item');
            return null;
        }
    }
    
    const queueItem = {
        id: generateRequestId(),
        data: item,
        timestamp: Date.now(),
        priority: options.priority || 5,
        retries: 0,
        maxRetries: options.maxRetries || maxRetries,
        status: 'pending'
    };
    
    offlineQueue.push(queueItem);
    
    // Sort by priority (higher first)
    offlineQueue.sort((a, b) => b.priority - a.priority);
    
    saveQueue();
    stats.pending = offlineQueue.length;
    
    dispatchEvent('item-added', { id: queueItem.id });
    
    // Try to process if online
    if (online && !processing) {
        processQueue();
    }
    
    return queueItem.id;
}

/**
 * Remove oldest low-priority item to make space
 * @returns {boolean} Whether an item was removed
 */
function removeOldestLowPriority() {
    // Find items with priority <= 3
    const lowPriority = offlineQueue.filter(item => item.priority <= 3);
    
    if (lowPriority.length > 0) {
        // Remove the oldest low-priority item
        const oldest = lowPriority.reduce((oldest, current) => 
            current.timestamp < oldest.timestamp ? current : oldest
        );
        
        offlineQueue = offlineQueue.filter(item => item.id !== oldest.id);
        stats.evictions = (stats.evictions || 0) + 1;
        return true;
    }
    
    return false;
}

/**
 * Process the queue
 */
export async function processQueue() {
    if (processing || !online || offlineQueue.length === 0) return;
    
    processing = true;
    console.log(`📋 Processing queue (${offlineQueue.length} items)`);
    
    // Process items in order (already sorted by priority)
    const processedIds = [];
    
    for (const item of offlineQueue) {
        if (!online) {
            console.log('📋 Device went offline, stopping queue processing');
            break;
        }
        
        try {
            const success = await processItem(item);
            if (success) {
                processedIds.push(item.id);
                stats.processed++;
                
                if (callbacks.onItemProcessed) {
                    callbacks.onItemProcessed(item);
                }
                
                dispatchEvent('item-processed', { id: item.id });
            } else {
                // Handle failure
                item.retries++;
                
                if (item.retries >= item.maxRetries) {
                    processedIds.push(item.id); // Remove after max retries
                    stats.failed++;
                    
                    if (callbacks.onQueueError) {
                        callbacks.onQueueError({ 
                            id: item.id, 
                            error: 'Max retries exceeded' 
                        });
                    }
                    
                    dispatchEvent('item-failed', { 
                        id: item.id, 
                        error: 'Max retries exceeded' 
                    });
                } else {
                    // Will retry later
                    item.status = 'retry';
                }
            }
        } catch (error) {
            console.error('Error processing queue item:', error);
            
            item.retries++;
            if (item.retries >= item.maxRetries) {
                processedIds.push(item.id);
                stats.failed++;
            }
        }
        
        // Small delay between items
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // Remove processed items
    if (processedIds.length > 0) {
        offlineQueue = offlineQueue.filter(item => !processedIds.includes(item.id));
        saveQueue();
        stats.pending = offlineQueue.length;
    }
    
    processing = false;
    
    if (offlineQueue.length === 0) {
        console.log('📋 Queue processing complete');
        if (callbacks.onQueueEmpty) callbacks.onQueueEmpty();
        dispatchEvent('queue-empty');
    } else {
        // Schedule next processing attempt for failed items
        if (online) {
            setTimeout(() => processQueue(), getRetryDelay(1));
        }
    }
}

/**
 * Process a single queue item
 * @param {Object} item - Queue item
 * @returns {Promise<boolean>} Success
 */
async function processItem(item) {
    // This should be implemented by the main module
    // We dispatch an event for the main module to handle
    return new Promise((resolve) => {
        // Dispatch event for main module to handle
        const event = new CustomEvent('process-queued-item', {
            detail: { 
                item: item.data,
                id: item.id,
                resolve: (success) => resolve(success)
            }
        });
        document.dispatchEvent(event);
        
        // Timeout if no response
        setTimeout(() => resolve(false), 10000);
    });
}

/**
 * Check online status
 * @returns {boolean}
 */
export function isOnlineStatus() {
    return online;
}

/**
 * Get queue length
 * @returns {number}
 */
export function getQueueLength() {
    return offlineQueue.length;
}

/**
 * Get full queue
 * @returns {Array} Queue items
 */
export function getQueue() {
    return [...offlineQueue];
}

/**
 * Get queue statistics
 * @returns {Object} Queue stats
 */
export function getQueueStats() {
    return {
        ...stats,
        pending: offlineQueue.length,
        online,
        memoryUsage: JSON.stringify(offlineQueue).length
    };
}

/**
 * Clear processed items
 * @param {Array} processedIds - IDs of processed items
 */
export function clearProcessedItems(processedIds) {
    offlineQueue = offlineQueue.filter(item => !processedIds.includes(item.id));
    stats.pending = offlineQueue.length;
    saveQueue();
}

/**
 * Remove item from queue
 * @param {string} id - Item ID
 */
export function removeFromQueue(id) {
    offlineQueue = offlineQueue.filter(item => item.id !== id);
    stats.pending = offlineQueue.length;
    saveQueue();
}

/**
 * Clear entire queue
 */
export function clearQueue() {
    offlineQueue = [];
    stats.pending = 0;
    saveQueue();
    dispatchEvent('queue-cleared');
}

/**
 * Save queue to localStorage
 */
function saveQueue() {
    try {
        localStorage.setItem('feedbackOfflineQueue', JSON.stringify(offlineQueue));
    } catch (error) {
        console.warn('Could not save offline queue:', error);
    }
}

/**
 * Load queue from localStorage
 */
function loadQueue() {
    try {
        const saved = localStorage.getItem('feedbackOfflineQueue');
        if (saved) {
            offlineQueue = JSON.parse(saved);
            
            // Filter out expired items (older than 7 days)
            const oneWeek = 7 * 24 * 60 * 60 * 1000;
            const now = Date.now();
            offlineQueue = offlineQueue.filter(item => 
                now - item.timestamp < oneWeek
            );
            
            stats.pending = offlineQueue.length;
        }
    } catch (error) {
        console.warn('Could not load offline queue:', error);
    }
}

/**
 * Dispatch custom event
 * @param {string} name - Event name
 * @param {Object} detail - Event detail
 */
function dispatchEvent(name, detail = {}) {
    document.dispatchEvent(new CustomEvent(`offline-queue-${name}`, {
        detail: { ...detail, timestamp: Date.now() }
    }));
}

/**
 * Retry failed items
 */
export function retryFailed() {
    const failedItems = offlineQueue.filter(item => item.status === 'retry');
    if (failedItems.length > 0 && online && !processing) {
        console.log(`📋 Retrying ${failedItems.length} failed items`);
        processQueue();
    }
}

export default {
    initOfflineQueue,
    addToQueue,
    isOnlineStatus,
    getQueueLength,
    getQueue,
    getQueueStats,
    clearProcessedItems,
    removeFromQueue,
    clearQueue,
    retryFailed
};