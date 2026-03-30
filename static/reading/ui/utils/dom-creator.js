// static/reading/ui/utils/dom-creator.js
// PURPOSE: Helper for creating DOM elements with attributes

/**
 * Create a DOM element with attributes and children
 * @param {string} tag - HTML tag name
 * @param {Object} attributes - Element attributes
 * @param {string|Array|HTMLElement} children - Child content
 * @returns {HTMLElement} The created element
 */
export function createElement(tag, attributes = {}, children = []) {
    // Validate tag
    if (!tag || typeof tag !== 'string') {
        throw new Error('createElement: tag must be a non-empty string');
    }
    
    // Create element with namespace support for SVG
    const isSvg = tag === 'svg' || attributes.xmlns === 'http://www.w3.org/2000/svg';
    const element = isSvg 
        ? document.createElementNS('http://www.w3.org/2000/svg', tag)
        : document.createElement(tag);
    
    // Set attributes
    Object.entries(attributes).forEach(([key, value]) => {
        if (value === undefined || value === null) return; // Skip undefined/null
        
        if (key === 'className') {
            element.className = value;
        } else if (key === 'dataset') {
            Object.entries(value).forEach(([dataKey, dataValue]) => {
                if (dataValue !== undefined && dataValue !== null) {
                    element.dataset[dataKey] = dataValue;
                }
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            const eventName = key.slice(2).toLowerCase();
            element.addEventListener(eventName, value);
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(element.style, value);
        } else if (isSvg && key === 'href') {
            // Special handling for SVG href
            element.setAttributeNS('http://www.w3.org/1999/xlink', 'href', value);
        } else {
            element.setAttribute(key, value);
        }
    });
    
    // Append children
    appendChildren(element, children);
    
    return element;
}

/**
 * Append children to an element
 * @param {HTMLElement} element - Parent element
 * @param {string|Array|HTMLElement} children - Children to append
 */
function appendChildren(element, children) {
    if (!element) return;
    
    if (typeof children === 'string') {
        element.textContent = children;
    } else if (typeof children === 'number' || typeof children === 'boolean') {
        element.textContent = String(children);
    } else if (children instanceof HTMLElement) {
        element.appendChild(children);
    } else if (Array.isArray(children)) {
        children.forEach(child => {
            if (child instanceof HTMLElement) {
                element.appendChild(child);
            } else if (child !== null && child !== undefined) {
                element.appendChild(document.createTextNode(String(child)));
            }
        });
    } else if (children !== null && children !== undefined) {
        element.textContent = String(children);
    }
}

/**
 * Create a fragment from multiple elements
 * @param {Array} elements - Elements to combine
 * @returns {DocumentFragment}
 */
export function createFragment(elements = []) {
    const fragment = document.createDocumentFragment();
    elements.forEach(el => {
        if (el instanceof HTMLElement) {
            fragment.appendChild(el);
        }
    });
    return fragment;
}

/**
 * Create a text element with common text properties
 * @param {string} tag - Usually 'p', 'span', 'div'
 * @param {string} text - Text content
 * @param {Object} options - Additional options
 */
export function createTextElement(tag, text, options = {}) {
    return createElement(tag, {
        className: options.className,
        title: options.title,
        ...options.attributes
    }, text);
}