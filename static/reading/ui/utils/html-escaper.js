// static/reading/ui/utils/html-escaper.js
// PURPOSE: Escape HTML to prevent XSS attacks

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} unsafe - Raw untrusted string
 * @param {Object} options - Escaping options
 * @param {boolean} options.attribute - Escape for attribute context
 * @param {boolean} options.preserveEntities - Skip if already has entities
 * @returns {string} Escaped safe string
 */
export function escapeHtml(unsafe, options = {}) {
    if (!unsafe) return '';
    
    const str = String(unsafe);
    
    // Skip if already escaped (simple check)
    if (options.preserveEntities && /&(?:amp|lt|gt|quot|#0?39|#0?47);/g.test(str)) {
        return str;
    }
    
    let escaped = str
        .replace(/&/g, '&amp;')  // Must be first
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;')
        .replace(/\//g, '&#047;')
        .replace(/`/g, '&#96;');  // Backticks can break out in some contexts
    
    // Additional escaping for attribute context
    if (options.attribute) {
        escaped = escaped.replace(/=/g, '&#61;').replace(/@/g, '&#64;');
    }
    
    return escaped;
}

/**
 * Escape for HTML text content (default)
 */
export function escapeText(unsafe) {
    return escapeHtml(unsafe, { attribute: false });
}

/**
 * Escape for HTML attribute values
 */
export function escapeAttr(unsafe) {
    return escapeHtml(unsafe, { attribute: true });
}

/**
 * Sanitize a URL to prevent javascript: protocol
 * @param {string} url - Raw URL string
 * @returns {string} Safe URL or empty string
 */
export function sanitizeUrl(url) {
    if (!url) return '';
    
    const str = String(url).toLowerCase().trim();
    
    // Block javascript: and data: protocols unless it's safe data
    if (str.startsWith('javascript:') || 
        (str.startsWith('data:') && !str.startsWith('data:text/plain'))) {
        return '';
    }
    
    return escapeHtml(url, { attribute: true });
}