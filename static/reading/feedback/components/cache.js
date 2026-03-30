// static/reading/feedback/components/cache.js
// PURPOSE: Persistent caching for feedback results with statistics

// Cache storage
let memoryCache = new Map();
let persistentCache = null; // Will use localStorage
let cacheEnabled = true;
let cacheTTL = 5 * 60 * 1000; // 5 minutes default
let maxCacheItems = 100;
let currentLessonId = null;

// Cache statistics
let stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    evictions: 0,
    persistentHits: 0
};

// In-flight promise cache to prevent duplicate requests
const inFlightPromises = new Map();

/**
 * Initialize cache
 * @param {Object} options - Configuration options
 */
export function initCache(options = {}) {
    if (options.cacheEnabled !== undefined) cacheEnabled = options.cacheEnabled;
    if (options.cacheTTL) cacheTTL = options.cacheTTL;
    if (options.maxCacheItems) maxCacheItems = options.maxCacheItems;
    if (options.lessonId) currentLessonId = options.lessonId;
    
    // Load persistent cache
    loadPersistentCache();
    
    // Set up lesson change listener
    document.addEventListener('lesson-changed', (event) => {
        if (event.detail?.lessonId) {
            onLessonChange(event.detail.lessonId);
        }
    });
    
    console.log('📦 Cache initialized with TTL:', cacheTTL / 1000, 's');
}

/**
 * Load cache from localStorage
 */
function loadPersistentCache() {
    try {
        const saved = localStorage.getItem('feedback-cache');
        if (saved) {
            const parsed = JSON.parse(saved);
            
            // Filter out expired items
            const now = Date.now();
            Object.entries(parsed).forEach(([key, value]) => {
                if (now - value.timestamp <= cacheTTL) {
                    memoryCache.set(key, value);
                }
            });
            
            console.log(`📦 Loaded ${memoryCache.size} items from persistent cache`);
        }
    } catch (e) {
        console.warn('Could not load persistent cache:', e);
    }
}

/**
 * Save cache to localStorage
 */
function savePersistentCache() {
    if (!cacheEnabled) return;
    
    try {
        const toSave = {};
        memoryCache.forEach((value, key) => {
            toSave[key] = value;
        });
        localStorage.setItem('feedback-cache', JSON.stringify(toSave));
    } catch (e) {
        console.warn('Could not save persistent cache:', e);
    }
}

/**
 * Get cached item
 * @param {string} key - Cache key
 * @returns {*} Cached data or null
 */
export function getCached(key) {
    if (!cacheEnabled) return null;
    
    const cached = memoryCache.get(key);
    
    if (!cached) {
        stats.misses++;
        return null;
    }
    
    // Check TTL
    if (Date.now() - cached.timestamp > cacheTTL) {
        memoryCache.delete(key);
        stats.evictions++;
        savePersistentCache();
        stats.misses++;
        return null;
    }
    
    stats.hits++;
    return cached.data;
}

/**
 * Cache item
 * @param {string} key - Cache key
 * @param {*} data - Data to cache
 * @param {Object} options - Cache options
 * @param {number} options.ttl - Custom TTL for this item
 * @param {boolean} options.persist - Whether to persist to localStorage
 */
export function setCached(key, data, options = {}) {
    if (!cacheEnabled) return;
    
    const ttl = options.ttl || cacheTTL;
    const persist = options.persist !== false;
    
    const cacheItem = {
        data,
        timestamp: Date.now(),
        ttl,
        lessonId: currentLessonId
    };
    
    memoryCache.set(key, cacheItem);
    stats.sets++;
    
    // Limit cache size
    if (memoryCache.size > maxCacheItems) {
        // Remove oldest item
        const oldestKey = memoryCache.keys().next().value;
        memoryCache.delete(oldestKey);
        stats.evictions++;
    }
    
    // Persist to localStorage if needed
    if (persist) {
        savePersistentCache();
    }
}

/**
 * Cache a promise to prevent duplicate requests
 * @param {string} key - Cache key
 * @param {Promise} promise - Promise to cache
 * @returns {Promise} Cached promise
 */
export function cachePromise(key, promise) {
    if (!cacheEnabled) return promise;
    
    // Check if promise already in flight
    if (inFlightPromises.has(key)) {
        return inFlightPromises.get(key);
    }
    
    // Check cache for resolved value
    const cached = getCached(key);
    if (cached !== null) {
        return Promise.resolve(cached);
    }
    
    // Cache the promise
    inFlightPromises.set(key, promise);
    
    // Remove from in-flight when done
    const cleanup = () => {
        inFlightPromises.delete(key);
    };
    
    return promise
        .then(result => {
            cleanup();
            // Cache the result
            setCached(key, result);
            return result;
        })
        .catch(error => {
            cleanup();
            throw error;
        });
}

/**
 * Clear cache
 * @param {string} key - Specific key to clear (null for all)
 */
export function clearCache(key = null) {
    if (key) {
        memoryCache.delete(key);
    } else {
        memoryCache.clear();
    }
    
    // Clear in-flight promises
    inFlightPromises.clear();
    
    // Update persistent storage
    savePersistentCache();
    
    console.log(`📦 Cache cleared${key ? ' for key: ' + key : ''}`);
}

/**
 * Preload expected results for current lesson
 * @param {string} lessonId - Lesson ID
 * @param {Array} expectedTexts - Array of expected texts
 */
export async function preloadForLesson(lessonId, expectedTexts) {
    if (!cacheEnabled || !lessonId || !expectedTexts) return;
    
    console.log(`📦 Preloading ${expectedTexts.length} items for lesson ${lessonId}`);
    
    // This would be implemented based on your API
    // Could pre-fetch common expected results
}

/**
 * Handle lesson change
 * @param {string} newLessonId - New lesson ID
 */
function onLessonChange(newLessonId) {
    // Clear old lesson data if desired
    if (currentLessonId !== newLessonId) {
        // Optionally keep some items, clear others
        const keysToKeep = [];
        const keysToDelete = [];
        
        memoryCache.forEach((value, key) => {
            if (value.lessonId === newLessonId) {
                keysToKeep.push(key);
            } else if (value.lessonId === currentLessonId) {
                keysToDelete.push(key);
            }
        });
        
        keysToDelete.forEach(key => memoryCache.delete(key));
        
        if (keysToDelete.length > 0) {
            console.log(`📦 Cleared ${keysToDelete.length} items from previous lesson`);
            savePersistentCache();
        }
    }
    
    currentLessonId = newLessonId;
}

/**
 * Get cache statistics
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
    const totalRequests = stats.hits + stats.misses;
    const hitRate = totalRequests > 0 ? (stats.hits / totalRequests * 100).toFixed(1) : 0;
    
    // Calculate memory usage (approximate)
    let memoryUsage = 0;
    memoryCache.forEach(item => {
        memoryUsage += JSON.stringify(item).length;
    });
    
    return {
        ...stats,
        hitRate: parseFloat(hitRate),
        size: memoryCache.size,
        memoryUsage: `${(memoryUsage / 1024).toFixed(2)} KB`,
        inFlightRequests: inFlightPromises.size,
        persistentStorage: localStorage.getItem('feedback-cache')?.length || 0
    };
}

/**
 * Enable/disable cache
 * @param {boolean} enabled
 */
export function setCacheEnabled(enabled) {
    cacheEnabled = enabled;
    if (!enabled) {
        clearCache();
    }
}

/**
 * Set cache TTL
 * @param {number} ttl - TTL in milliseconds
 */
export function setCacheTTL(ttl) {
    cacheTTL = ttl;
}

/**
 * Get cache entry without affecting stats
 * @param {string} key - Cache key
 * @returns {*} Cache entry or null
 */
export function peek(key) {
    const cached = memoryCache.get(key);
    return cached ? cached.data : null;
}

export default {
    initCache,
    getCached,
    setCached,
    cachePromise,
    clearCache,
    preloadForLesson,
    getCacheStats,
    setCacheEnabled,
    setCacheTTL,
    peek
};