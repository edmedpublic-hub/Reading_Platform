// static/reading/reading.analysis.js
// PURPOSE: Pure text comparison algorithm with Unicode/Arabic support
// DEPENDENCIES: None

export function analyzeReading(studentText, expectedText, options = {}) {
    const config = {
        ignorePunctuation: true,
        ignoreCase: true,
        ignoreExtraSpaces: true,
        preserveArabicHonorifics: true,
        ...options
    };

    if (typeof studentText !== 'string') studentText = '';
    if (typeof expectedText !== 'string') expectedText = '';

    const spoken = normalizeText(studentText, config);
    const expected = normalizeText(expectedText, config);

    if (!expected) return createEmptyResult('expected', 'Expected text is empty');
    if (!spoken) return createEmptyResult('spoken', 'No speech detected');

    const spokenWords = tokenize(spoken, config);
    const expectedWords = tokenize(expected, config);

    const matrix = buildAlignmentMatrix(spokenWords, expectedWords);
    const alignment = backtrackAlignment(matrix, spokenWords, expectedWords, config);
    
    return enhanceWithScores(alignment, spokenWords, expectedWords);
}

export function normalizeText(text, config = {}) {
    if (!text) return '';
    
    let normalized = String(text);
    
    // Remove HTML tags
    normalized = normalized.replace(/<[^>]*>/g, ' ');
    
    // Check if text contains Arabic/RTL characters
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(normalized);
    
    if (hasArabic) {
        // For Arabic: preserve Arabic characters and honorifics
        if (config.preserveArabicHonorifics) {
            // Keep honorific symbols like {ص}, {ع}, etc.
            // Only remove extra spaces
            normalized = normalized.replace(/\s+/g, ' ').trim();
        } else {
            // Remove punctuation but preserve Arabic letters
            normalized = normalized.replace(/[.,!?;:()[\]{}"\-]/g, ' ');
            normalized = normalized.replace(/\s+/g, ' ').trim();
        }
    } else {
        // For English/Latin: normal processing
        if (config.ignoreCase !== false) {
            normalized = normalized.toLowerCase();
        }
        if (config.ignorePunctuation !== false) {
            normalized = normalized.replace(/[.,!?;:()\[\]{}"\-]/g, ' ');
        }
        normalized = normalized.replace(/\s+/g, ' ').trim();
    }
    
    return normalized;
}

export function tokenize(text, config = {}) {
    if (!text) return [];
    
    // Check for Arabic
    const hasArabic = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
    
    if (hasArabic) {
        // For Arabic: split on spaces but keep Arabic words intact
        // Handle honorifics as separate tokens if needed
        const words = [];
        const parts = text.split(/\s+/);
        
        for (let part of parts) {
            if (part.includes('{') && part.includes('}')) {
                // Honorific might be attached to a word
                const honorificMatch = part.match(/\{[^}]+\}/);
                if (honorificMatch) {
                    const honorific = honorificMatch[0];
                    const word = part.replace(honorific, '');
                    if (word) words.push(word);
                    words.push(honorific);
                } else {
                    words.push(part);
                }
            } else {
                words.push(part);
            }
        }
        
        return words.filter(w => w.length > 0);
    } else {
        // For English: normal tokenization
        return text.split(/\s+/).map(word => expandContraction(word));
    }
}

function expandContraction(word) {
    const contractions = {
        "don't": "do not", "can't": "cannot", "won't": "will not",
        "didn't": "did not", "doesn't": "does not", "isn't": "is not",
        "aren't": "are not", "wasn't": "was not", "weren't": "were not",
        "haven't": "have not", "hasn't": "has not", "hadn't": "had not",
        "i'm": "i am", "you're": "you are", "he's": "he is",
        "she's": "she is", "it's": "it is", "we're": "we are",
        "they're": "they are", "i'll": "i will", "you'll": "you will",
        "he'll": "he will", "she'll": "she will", "we'll": "we will",
        "they'll": "they will", "i've": "i have", "you've": "you have",
        "we've": "we have", "they've": "they have"
    };
    return contractions[word] || word;
}

function buildAlignmentMatrix(spoken, expected) {
    const rows = spoken.length + 1;
    const cols = expected.length + 1;
    const matrix = Array(rows).fill(null).map(() => Array(cols).fill(0));
    
    for (let i = 0; i < rows; i++) matrix[i][0] = i;
    for (let j = 0; j < cols; j++) matrix[0][j] = j;
    
    for (let i = 1; i < rows; i++) {
        for (let j = 1; j < cols; j++) {
            const cost = (spoken[i - 1] === expected[j - 1]) ? 0 : 1;
            matrix[i][j] = Math.min(
                matrix[i - 1][j] + 1,
                matrix[i][j - 1] + 1,
                matrix[i - 1][j - 1] + cost
            );
        }
    }
    return matrix;
}

function backtrackAlignment(matrix, spoken, expected, config) {
    let i = spoken.length;
    let j = expected.length;
    
    const result = {
        correct: [], incorrect: [], missing: [], extra: [], alignment: []
    };
    
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && wordsMatch(spoken[i - 1], expected[j - 1], config)) {
            result.correct.unshift({
                word: spoken[i - 1],
                expectedIndex: j - 1,
                spokenIndex: i - 1,
                confidence: 1.0
            });
            result.alignment.unshift({
                type: 'correct', spoken: spoken[i - 1], expected: expected[j - 1],
                spokenIndex: i - 1, expectedIndex: j - 1
            });
            i--; j--;
            continue;
        }
        
        const substitution = (i > 0 && j > 0) ? matrix[i - 1][j - 1] : Infinity;
        const deletion = (i > 0) ? matrix[i - 1][j] : Infinity;
        const insertion = (j > 0) ? matrix[i][j - 1] : Infinity;
        const min = Math.min(substitution, deletion, insertion);
        
        if (min === substitution && i > 0 && j > 0) {
            result.incorrect.unshift({
                expected: expected[j - 1], heard: spoken[i - 1],
                expectedIndex: j - 1, spokenIndex: i - 1,
                confidence: calculateWordSimilarity(spoken[i - 1], expected[j - 1], config)
            });
            result.alignment.unshift({
                type: 'incorrect', spoken: spoken[i - 1], expected: expected[j - 1],
                spokenIndex: i - 1, expectedIndex: j - 1
            });
            i--; j--;
        }
        else if (min === deletion && i > 0) {
            result.extra.unshift({
                word: spoken[i - 1], spokenIndex: i - 1,
                context: j > 0 ? expected[j - 1] : null
            });
            result.alignment.unshift({
                type: 'extra', spoken: spoken[i - 1], expected: null,
                spokenIndex: i - 1, expectedIndex: null
            });
            i--;
        }
        else {
            result.missing.unshift({
                word: expected[j - 1], expectedIndex: j - 1,
                context: i > 0 ? spoken[i - 1] : null
            });
            result.alignment.unshift({
                type: 'missing', spoken: null, expected: expected[j - 1],
                spokenIndex: null, expectedIndex: j - 1
            });
            j--;
        }
    }
    return result;
}

function wordsMatch(word1, word2, config) {
    if (word1 === word2) return true;
    
    // Check if they're the same after ignoring Arabic honorifics
    if (config.preserveArabicHonorifics) {
        const clean1 = word1.replace(/\{[^}]+\}/g, '').trim();
        const clean2 = word2.replace(/\{[^}]+\}/g, '').trim();
        if (clean1 === clean2) return true;
    }
    
    return false;
}

export function calculateWordSimilarity(word1, word2, config = {}) {
    if (!word1 || !word2) return 0;
    if (word1 === word2) return 1.0;
    
    // For Arabic, check if they match after removing honorifics
    if (config.preserveArabicHonorifics) {
        const clean1 = word1.replace(/\{[^}]+\}/g, '').trim();
        const clean2 = word2.replace(/\{[^}]+\}/g, '').trim();
        if (clean1 === clean2) return 0.9; // High similarity, only honorifics differ
    }
    
    const longer = word1.length > word2.length ? word1 : word2;
    const shorter = word1.length > word2.length ? word2 : word1;
    if (longer.length === 0) return 1.0;
    
    const distance = levenshteinDistance(longer, shorter);
    return (longer.length - distance) / longer.length;
}

function levenshteinDistance(a, b) {
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
            }
        }
    }
    return matrix[b.length][a.length];
}

function enhanceWithScores(alignment, spoken, expected) {
    const totalExpected = expected.length;
    const totalSpoken = spoken.length;
    const correctCount = alignment.correct.length;
    
    const accuracy = totalExpected > 0 ? (correctCount / totalExpected * 100).toFixed(1) : 0;
    const precision = totalSpoken > 0 ? (correctCount / totalSpoken * 100).toFixed(1) : 0;
    
    const weightedCorrect = alignment.correct.length +
        (alignment.incorrect.reduce((sum, item) => sum + (item.confidence || 0), 0) * 0.5);
    const weightedScore = totalExpected > 0 ? (weightedCorrect / totalExpected * 100).toFixed(1) : 0;
    
    return {
        ...alignment,
        stats: {
            totalExpected, totalSpoken,
            correct: correctCount,
            incorrect: alignment.incorrect.length,
            missing: alignment.missing.length,
            extra: alignment.extra.length,
            accuracy: parseFloat(accuracy),
            precision: parseFloat(precision),
            weightedScore: parseFloat(weightedScore),
            confidence: weightedScore > 80 ? 'high' : weightedScore > 50 ? 'medium' : 'low'
        },
        metadata: { timestamp: Date.now(), version: '2.1.0' }
    };
}

function createEmptyResult(reason, message) {
    return {
        correct: [], incorrect: [], missing: [], extra: [], alignment: [],
        stats: {
            totalExpected: 0, totalSpoken: 0, correct: 0, incorrect: 0,
            missing: 0, extra: 0, accuracy: 0, precision: 0, weightedScore: 0,
            confidence: 'none'
        },
        metadata: { timestamp: Date.now(), version: '2.1.0', error: { reason, message } }
    };
}

export default analyzeReading;