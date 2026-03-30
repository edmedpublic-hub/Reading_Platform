// static/reading/ui/components/score-display.js
// PURPOSE: Display pronunciation score with visual feedback

// Ensure styles are loaded
function ensureScoreStyles() {
    if (document.getElementById('score-display-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'score-display-styles';
    style.textContent = `
        .score-display {
            display: inline-flex;
            flex-direction: column;
            align-items: center;
            padding: 1rem;
            border-radius: 12px;
            background: #f8f9fa;
            min-width: 120px;
            transition: all 0.3s ease;
        }
        
        .score-display.compact {
            flex-direction: row;
            gap: 1rem;
            padding: 0.5rem 1rem;
        }
        
        .score-circle {
            position: relative;
            width: 80px;
            height: 80px;
            margin-bottom: 0.5rem;
        }
        
        .compact .score-circle {
            width: 50px;
            height: 50px;
            margin-bottom: 0;
        }
        
        .score-circle svg {
            width: 100%;
            height: 100%;
            transform: rotate(-90deg);
        }
        
        .score-circle-bg {
            fill: none;
            stroke: #e9ecef;
            stroke-width: 8;
        }
        
        .score-circle-fill {
            fill: none;
            stroke-width: 8;
            stroke-linecap: round;
            transition: stroke-dasharray 0.5s ease;
        }
        
        .score-circle-fill.high { stroke: #28a745; }
        .score-circle-fill.medium { stroke: #ffc107; }
        .score-circle-fill.low { stroke: #dc3545; }
        
        .score-value {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            font-size: 1.5rem;
            font-weight: bold;
        }
        
        .compact .score-value {
            font-size: 1.25rem;
        }
        
        .score-content {
            text-align: center;
        }
        
        .compact .score-content {
            display: flex;
            flex-direction: row;
            align-items: center;
            gap: 1rem;
        }
        
        .score-number {
            font-size: 2rem;
            font-weight: 700;
            line-height: 1;
        }
        
        .compact .score-number {
            font-size: 1.5rem;
        }
        
        .score-label {
            font-size: 0.875rem;
            color: #6c757d;
            margin-top: 0.25rem;
        }
        
        .score-stats {
            display: flex;
            gap: 1rem;
            margin-top: 0.75rem;
            font-size: 0.75rem;
            color: #6c757d;
        }
        
        .score-trend {
            display: inline-flex;
            align-items: center;
            gap: 0.25rem;
            margin-left: 0.5rem;
            font-size: 0.875rem;
        }
        
        .trend-up { color: #28a745; }
        .trend-down { color: #dc3545; }
        .trend-same { color: #6c757d; }
        
        .score-high .score-number { color: #28a745; }
        .score-medium .score-number { color: #ffc107; }
        .score-low .score-number { color: #dc3545; }
        
        .score-high .score-circle-fill { stroke: #28a745; }
        .score-medium .score-circle-fill { stroke: #ffc107; }
        .score-low .score-circle-fill { stroke: #dc3545; }
        
        .score-emoji {
            font-size: 1.5rem;
            margin-right: 0.5rem;
        }
        
        .compact .score-emoji {
            font-size: 1.25rem;
        }
        
        /* RTL Support */
        [dir="rtl"] .score-trend {
            margin-left: 0;
            margin-right: 0.5rem;
        }
        
        [dir="rtl"] .score-emoji {
            margin-right: 0;
            margin-left: 0.5rem;
        }
        
        [dir="rtl"] .compact .score-content {
            flex-direction: row-reverse;
        }
        
        /* Animation */
        @keyframes scorePop {
            0% { transform: scale(0.8); opacity: 0; }
            100% { transform: scale(1); opacity: 1; }
        }
        
        .score-display {
            animation: scorePop 0.3s ease-out;
        }
    `;
    document.head.appendChild(style);
}

/**
 * Update score display with appropriate formatting
 * @param {HTMLElement|string} element - Score element or ID
 * @param {number} score - Score value (0-100)
 * @param {Object} options - Display options
 * @param {Object} options.stats - Additional statistics
 * @param {number} options.previousScore - Previous score for trend
 * @param {string} options.variant - 'default' or 'compact'
 * @param {boolean} options.showCircle - Show circular progress
 * @param {boolean} options.showEmoji - Show emoji indicator
 * @param {string} options.label - Custom label
 * @param {string} options.language - 'en' or 'ar'
 */
export function updateScoreDisplay(element, score, options = {}) {
    // Get element
    const scoreEl = typeof element === 'string' 
        ? document.getElementById(element) 
        : element;
    
    if (!scoreEl) {
        console.error('updateScoreDisplay: Element not found');
        return;
    }

    // Ensure styles exist
    ensureScoreStyles();

    // Default options
    const {
        stats = {},
        previousScore = null,
        variant = 'default',
        showCircle = true,
        showEmoji = true,
        label = null,
        language = 'en'
    } = options;

    // Check for RTL
    if (language === 'ar') {
        scoreEl.setAttribute('dir', 'rtl');
    }

    // Validate and format score
    const numericScore = typeof score === 'number' ? score : parseFloat(score) || 0;
    const formattedScore = numericScore.toFixed(1);
    
    // Determine color class and emoji
    const { colorClass, emoji, description } = getScoreMetadata(numericScore, language);
    
    // Calculate trend if previous score provided
    const trend = previousScore !== null ? 
        numericScore - previousScore : null;
    
    // Build score display
    const html = buildScoreHTML({
        score: numericScore,
        formattedScore,
        colorClass,
        emoji: showEmoji ? emoji : null,
        label: label || getDefaultLabel(language),
        description,
        trend,
        variant,
        showCircle,
        stats
    });

    scoreEl.innerHTML = html;

    // Update circle progress if shown
    if (showCircle) {
        updateCircleProgress(scoreEl, numericScore, colorClass);
    }

    // Add ARIA label
    const ariaLabel = language === 'ar'
        ? `النتيجة: ${formattedScore} بالمائة. ${description}`
        : `Score: ${formattedScore} percent. ${description}`;
    scoreEl.setAttribute('aria-label', ariaLabel);
    
    // Add role
    scoreEl.setAttribute('role', 'status');
}

/**
 * Get score metadata (color class, emoji, description)
 */
function getScoreMetadata(score, language) {
    if (score >= 90) {
        return {
            colorClass: 'score-high',
            emoji: '🌟',
            description: language === 'ar' ? 'ممتاز!' : 'Excellent!'
        };
    } else if (score >= 80) {
        return {
            colorClass: 'score-high',
            emoji: '🎉',
            description: language === 'ar' ? 'جيد جداً' : 'Very good!'
        };
    } else if (score >= 70) {
        return {
            colorClass: 'score-high',
            emoji: '👍',
            description: language === 'ar' ? 'جيد' : 'Good job!'
        };
    } else if (score >= 60) {
        return {
            colorClass: 'score-medium',
            emoji: '📝',
            description: language === 'ar' ? 'مرضٍ' : 'Satisfactory'
        };
    } else if (score >= 50) {
        return {
            colorClass: 'score-medium',
            emoji: '🤔',
            description: language === 'ar' ? 'بحاجة لممارسة' : 'Needs practice'
        };
    } else if (score >= 30) {
        return {
            colorClass: 'score-low',
            emoji: '🔊',
            description: language === 'ar' ? 'حاول مرة أخرى' : 'Try again'
        };
    } else {
        return {
            colorClass: 'score-low',
            emoji: '🎤',
            description: language === 'ar' ? 'استمر في المحاولة' : 'Keep practicing'
        };
    }
}

/**
 * Get default label based on language
 */
function getDefaultLabel(language) {
    return language === 'ar' ? 'الدقة الكلية' : 'Overall Accuracy';
}

/**
 * Build score HTML
 */
function buildScoreHTML({
    score,
    formattedScore,
    colorClass,
    emoji,
    label,
    description,
    trend,
    variant,
    showCircle,
    stats
}) {
    const trendHtml = trend !== null ? buildTrendHTML(trend) : '';
    const statsHtml = Object.keys(stats).length > 0 ? buildStatsHTML(stats) : '';
    
    const circleHtml = showCircle ? `
        <div class="score-circle">
            <svg viewBox="0 0 100 100">
                <circle class="score-circle-bg" cx="50" cy="50" r="45"></circle>
                <circle class="score-circle-fill ${colorClass}" cx="50" cy="50" r="45" 
                    stroke-dasharray="0 283" stroke-dashoffset="0"></circle>
            </svg>
            <span class="score-value">${Math.round(score)}</span>
        </div>
    ` : '';

    const emojiHtml = emoji ? `<span class="score-emoji">${emoji}</span>` : '';

    if (variant === 'compact') {
        return `
            <div class="score-display compact ${colorClass}">
                ${emojiHtml}
                <div class="score-content">
                    <span class="score-number">${formattedScore}%</span>
                    <span class="score-label">${label}</span>
                    ${trendHtml}
                </div>
            </div>
        `;
    }

    return `
        <div class="score-display ${colorClass}">
            ${circleHtml}
            <div class="score-content">
                ${emojiHtml}
                <span class="score-number">${formattedScore}%</span>
                <span class="score-label">${label}</span>
                <span class="score-description">${description}</span>
                ${trendHtml}
                ${statsHtml}
            </div>
        </div>
    `;
}

/**
 * Build trend HTML
 */
function buildTrendHTML(trend) {
    if (trend > 0) {
        return `
            <span class="score-trend trend-up">
                ▲ +${trend.toFixed(1)}%
            </span>
        `;
    } else if (trend < 0) {
        return `
            <span class="score-trend trend-down">
                ▼ ${trend.toFixed(1)}%
            </span>
        `;
    } else {
        return `
            <span class="score-trend trend-same">
                ◆ 0%
            </span>
        `;
    }
}

/**
 * Build stats HTML
 */
function buildStatsHTML(stats) {
    const items = [];
    
    if (stats.correct !== undefined) {
        items.push(`✅ ${stats.correct} correct`);
    }
    if (stats.incorrect !== undefined) {
        items.push(`❌ ${stats.incorrect} incorrect`);
    }
    if (stats.missing !== undefined) {
        items.push(`❓ ${stats.missing} missing`);
    }
    
    if (items.length === 0) return '';
    
    return `<div class="score-stats">${items.join(' • ')}</div>`;
}

/**
 * Update circle progress
 */
function updateCircleProgress(container, score, colorClass) {
    const circle = container.querySelector('.score-circle-fill');
    if (!circle) return;
    
    const circumference = 2 * Math.PI * 45; // radius = 45
    const offset = circumference - (score / 100) * circumference;
    
    circle.style.strokeDasharray = `${circumference} ${circumference}`;
    circle.style.strokeDashoffset = offset;
}

/**
 * Get CSS class based on score (legacy function)
 * @param {number} score - Score value
 * @returns {string} CSS class
 */
export function getScoreClass(score) {
    if (score >= 80) return 'score-high';
    if (score >= 60) return 'score-medium';
    return 'score-low';
}

/**
 * Animate score change
 * @param {HTMLElement} element - Score element
 * @param {number} newScore - Target score
 * @param {number} duration - Animation duration in ms
 */
export function animateScoreChange(element, newScore, duration = 1000) {
    const scoreEl = typeof element === 'string' 
        ? document.getElementById(element) 
        : element;
    
    if (!scoreEl) return;
    
    const currentText = scoreEl.querySelector('.score-number')?.textContent || '0';
    const currentScore = parseFloat(currentText) || 0;
    
    const startTime = performance.now();
    
    const animate = (currentTime) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Easing function
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = currentScore + (newScore - currentScore) * easeProgress;
        
        const numberEl = scoreEl.querySelector('.score-number');
        if (numberEl) {
            numberEl.textContent = `${currentValue.toFixed(1)}%`;
        }
        
        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    };
    
    requestAnimationFrame(animate);
}

export default {
    updateScoreDisplay,
    getScoreClass,
    animateScoreChange
};