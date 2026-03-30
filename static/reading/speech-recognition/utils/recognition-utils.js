// static/reading/speech-recognition/utils/recognition-utils.js
// PURPOSE: Utility functions for speech recognition

let isMobileCache = null;

/* =========================================================
   FEATURE DETECTION
========================================================= */

export function isSpeechRecognitionSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function getSpeechRecognition() {
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

/* =========================================================
   DEVICE DETECTION
========================================================= */

export function isMobile() {

    if (isMobileCache !== null) return isMobileCache;

    const uaMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i
        .test(navigator.userAgent);

    const touchDevice = navigator.maxTouchPoints > 1;

    isMobileCache = uaMobile || touchDevice;

    return isMobileCache;

}

/* =========================================================
   LANGUAGE UTILITIES
========================================================= */

export function getRecognitionLanguage(language) {

    const languages = {
        en: 'en-US',
        ar: 'ar-SA',
        'en-US': 'en-US',
        'ar-SA': 'ar-SA'
    };

    return languages[language] || 'en-US';

}

export function hasArabic(text) {

    if (!text) return false;

    return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/.test(text);

}

export function hasEnglish(text) {

    if (!text) return false;

    return /[a-zA-Z]/.test(text);

}

export function detectTextLanguage(text) {

    if (!text) return 'en';

    const ar = hasArabic(text);
    const en = hasEnglish(text);

    if (ar && !en) return 'ar';

    return 'en';

}

/* =========================================================
   TRANSCRIPT NORMALIZATION
========================================================= */

export function cleanTranscript(transcript) {

    if (!transcript) return '';

    let cleaned = transcript
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();

    /* Normalize Arabic characters */

    cleaned = cleaned
        .replace(/[إأآ]/g, 'ا')
        .replace(/ة/g, 'ه')
        .replace(/ى/g, 'ي');

    /* Keep letters, numbers, spaces, apostrophes */

    cleaned = cleaned.replace(/[^\w\s\u0600-\u06FF']/g, '');

    return cleaned;

}

/* =========================================================
   TOKENIZATION (FOR READING ANALYSIS)
========================================================= */

export function tokenizeTranscript(text) {

    if (!text) return [];

    const cleaned = cleanTranscript(text);

    return cleaned.split(/\s+/).filter(Boolean);

}

/* =========================================================
   RECOGNITION RESULT HELPERS
========================================================= */

export function filterResultsByConfidence(results, threshold = 0.5) {

    if (!results || !Array.isArray(results)) return [];

    return results.filter(result => {

        if (typeof result === 'string') return true;

        return (result.confidence || 0) >= threshold;

    });

}

export function getBestTranscript(alternatives) {

    if (!alternatives || alternatives.length === 0) return '';

    const normalized = alternatives.map(a => {

        if (typeof a === 'string') {
            return { transcript: a, confidence: 0 };
        }

        return {
            transcript: a.transcript || '',
            confidence: a.confidence || 0
        };

    });

    normalized.sort((a, b) => b.confidence - a.confidence);

    return normalized[0].transcript;

}

/* =========================================================
   ERROR MESSAGES (CLASSROOM FRIENDLY)
========================================================= */

export function getErrorMessage(error, language = 'en') {

    const errorCode = String(error).toLowerCase();

    const enMessages = {
        'not-allowed': '🔇 Microphone access denied. Please click the microphone icon and select "Allow".',
        'permission-denied': '🔇 Microphone access denied. Please check your browser settings.',
        'no-speech': '🎤 No speech detected. Try speaking louder or moving closer.',
        'audio-capture': '🎙️ No microphone found. Please connect a microphone.',
        'network': '📶 Network error. Check your internet connection.',
        'service-not-allowed': '⚙️ Speech service unavailable. Try again in a moment.',
        'aborted': '⏹️ Recording stopped.',
        'language-not-supported': '🌐 This language is not supported yet.',
        'max-retries': '🔄 Unable to connect. Please refresh the page.',
        'default': '❌ Something went wrong. Please try again.'
    };

    const arMessages = {
        'not-allowed': '🔇 تم رفض الوصول إلى الميكروفون. الرجاء النقر على أيقونة الميكروفون واختيار "سماح".',
        'permission-denied': '🔇 تم رفض الوصول إلى الميكروفون. الرجاء التحقق من إعدادات المتصفح.',
        'no-speech': '🎤 لم يتم اكتشاف كلام. حاول التحدث بصوت أعلى أو الاقتراب من الميكروفون.',
        'audio-capture': '🎙️ لم يتم العثور على ميكروفون. الرجاء توصيل ميكروفون.',
        'network': '📶 خطأ في الشبكة. تحقق من اتصال الإنترنت.',
        'service-not-allowed': '⚙️ خدمة التعرف على الكلام غير متوفرة. حاول مرة أخرى بعد قليل.',
        'aborted': '⏹️ تم إيقاف التسجيل.',
        'language-not-supported': '🌐 هذه اللغة غير مدعومة حالياً.',
        'max-retries': '🔄 تعذر الاتصال. الرجاء تحديث الصفحة.',
        'default': '❌ حدث خطأ ما. الرجاء المحاولة مرة أخرى.'
    };

    const messages = language === 'ar' ? arMessages : enMessages;

    for (const [key, msg] of Object.entries(messages)) {

        if (errorCode.includes(key)) return msg;

    }

    return messages.default;

}

/* =========================================================
   AUDIO SUPPORT
========================================================= */

export function createAudioContext() {

    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) return null;

    try {

        return new AudioContext();

    }

    catch (e) {

        console.warn('AudioContext creation failed:', e);

        return null;

    }

}

/* =========================================================
   SECURITY CHECK
========================================================= */

export function isSecureContext() {

    return window.isSecureContext ||
        location.protocol === 'https:' ||
        location.hostname === 'localhost' ||
        location.hostname === '127.0.0.1';

}

/* =========================================================
   BROWSER SUPPORT STATUS
========================================================= */

export function getSupportStatus() {

    return {
        speechRecognition: isSpeechRecognitionSupported(),
        audioContext: !!(window.AudioContext || window.webkitAudioContext),
        secureContext: isSecureContext(),
        mobile: isMobile(),
        userGesture: false
    };

}

/* =========================================================
   PUBLIC API
========================================================= */

export default {
    isSpeechRecognitionSupported,
    getSpeechRecognition,
    isMobile,
    getRecognitionLanguage,
    hasArabic,
    hasEnglish,
    detectTextLanguage,
    cleanTranscript,
    tokenizeTranscript,
    filterResultsByConfidence,
    getBestTranscript,
    getErrorMessage,
    createAudioContext,
    isSecureContext,
    getSupportStatus
};