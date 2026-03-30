// static/reading/core/module-loader.js
// PURPOSE: Initialize modules in correct order with dependency management

import textReader from '../text-to-speech/index.js';
import highlighting from '../highlighting/index.js';
import recognition from '../speech-recognition/index.js';
import feedback from '../feedback/index.js';
import * as ui from '../ui/index.js';
import AppState from './app-state.js'; 
import { ErrorHandler } from './error-handler.js';
import EventBus from './event-bus.js';
import KeyboardShortcuts from './keyboard-shortcuts.js';

const moduleStatus = {
    ui: false,
    text: false,
    highlight: false,
    recognition: false,
    feedback: false,
    shortcuts: false
};

const moduleInstances = {};

export const ModuleLoader = {
    async initializeAll() {
        try {
            const config = AppState.getConfig();
            if (!config.autoInitModules) {
                console.log('⏸️ Module auto-init disabled');
                return;
            }

            console.log('🚀 Initializing modules...');
            const language = AppState.get('currentLanguage') || 'en';

            // 1. UI module
            await this.initUI(language);

            // 2. Text reader (TTS)
            await this.initTextReader(language);

            // 3. Highlighting
            await this.initHighlighting(language);

            // 4. Recognition (STT)
            await this.initRecognition(language);

            // 5. Feedback
            await this.initFeedback(language);

            // 6. Keyboard shortcuts
            await this.initShortcuts(language);

            // 7. Optional Progress Tracking
            if (ui.initProgressTracking) ui.initProgressTracking();

            this.verifyAllModulesLoaded();

            console.log('✅ All modules processed');

            EventBus.emit('app:ready', {
                modules: { ...moduleStatus },
                language,
                timestamp: Date.now()
            });

        } catch (error) {
            ErrorHandler.handle('Failed to initialize modules', {
                error,
                category: 'initialization',
                level: 'fatal',
                context: 'module-loader'
            });
        }
    },

    async initUI(language) {
    try {
        moduleInstances.ui = ui;
        
        // Initialize UI module
        if (typeof ui.initUI === 'function') {
            ui.initUI({ language });
        }
        
        moduleStatus.ui = true;
        AppState.updateModuleStatus('ui', true);
        EventBus.emit('module:ready', { module: 'ui' });
        return true;
    } catch (error) {
        ErrorHandler.handle('UI module failed', { error, context: 'loader:ui' });
        return false;
    }
},

    async initTextReader(language) {
        try {
            const ids = AppState.getElementIds() || {};
            
            if (!ids.text || !document.getElementById(ids.text)) {
                throw new Error(`Text container ID "${ids.text}" not found in DOM`);
            }

            // FIXED: Passing IDs directly on the top level to match TTS init expectations
            const ttsInstance = textReader.init({
                text: ids.text,
                voiceSelect: ids.voiceSelect,
                readBtn: ids.readBtn,
                pauseBtn: ids.pauseBtn,
                resumeBtn: ids.resumeBtn,
                stopBtn: ids.stopBtn,
                rate: AppState.isMobile() ? 0.9 : 1.0,
                autoScroll: true,
                language
            });

            moduleInstances.text = ttsInstance;
            moduleStatus.text = true;
            AppState.updateModuleStatus('text', true);
            EventBus.emit('module:ready', { module: 'text', instance: ttsInstance });
            return ttsInstance;
        } catch (error) {
            ErrorHandler.handle('TTS failed', { error, context: 'loader:text' });
            return null;
        }
    },

    async initHighlighting(language) {
        try {
            const ids = AppState.getElementIds() || {};
            
            if (!ids.text || !document.getElementById(ids.text)) {
                console.warn('⚠️ Highlighting skipped: Container not found');
                return;
            }

            // FIXED: Passing 'container' as expected by highlighter
            const highlightingInstance = highlighting.init({
                container: ids.text,
                language,
                ttsAPI: moduleInstances.text
            });

            moduleInstances.highlight = highlightingInstance;
            moduleStatus.highlight = true;
            AppState.updateModuleStatus('highlight', true);
            EventBus.emit('module:ready', { module: 'highlight' });
        } catch (error) {
            ErrorHandler.handle('Highlighting failed', { error, context: 'loader:highlight' });
        }
    },

    async initRecognition(language) {
        try {
            const ids = AppState.getElementIds() || {};
            const config = AppState.getConfig();

            if (!ids.startListeningBtn || !document.getElementById(ids.startListeningBtn)) {
                throw new Error(`Start button ID "${ids.startListeningBtn}" not found`);
            }

            // FIXED: Passing IDs directly to match Recognition init
            const recognitionInstance = recognition.init({
                startBtn: ids.startListeningBtn,
                stopBtn: ids.stopListeningBtn,
                status: ids.recordingStatus,
                feedbackContainer: ids.problemWords,
                lang: language === 'ar' ? 'ar-SA' : 'en-US',
                showVisualizer: !config.mobileOptimizations,
                language,
                ttsAPI: moduleInstances.text
            });

            moduleInstances.recognition = recognitionInstance;
            moduleStatus.recognition = true;
            AppState.updateModuleStatus('recognition', true);
            EventBus.emit('module:ready', { module: 'recognition' });
        } catch (error) {
            ErrorHandler.handle('STT failed', { error, context: 'loader:recognition' });
        }
    },

    async initFeedback(language) {
        try {
            const ids = AppState.getElementIds() || {};
            const endpoints = AppState.getApiEndpoints() || {};

            // FIXED: Mapping IDs to the top level for feedback
            const feedbackInstance = feedback.init({
                apiEndpoint: endpoints.feedback,
                scoreDisplay: ids.scoreDisplay,
                feedbackText: ids.feedbackText,
                problemWords: ids.problemWords,
                language
            });

            moduleInstances.feedback = feedbackInstance;
            moduleStatus.feedback = true;
            AppState.updateModuleStatus('feedback', true);
            EventBus.emit('module:ready', { module: 'feedback' });
        } catch (error) {
            ErrorHandler.handle('Feedback failed', { error, context: 'loader:feedback' });
        }
    },

    async initShortcuts(language) {
        try {
            if (KeyboardShortcuts && KeyboardShortcuts.init) {
                KeyboardShortcuts.init({ language, enabled: true });
                this._connectShortcuts();
                moduleStatus.shortcuts = true;
                EventBus.emit('module:ready', { module: 'shortcuts' });
            }
        } catch (error) {
            ErrorHandler.handle('Shortcuts failed', { error, context: 'loader:shortcuts' });
        }
    },

    _connectShortcuts() {
        EventBus.on('shortcut:toggle-recording', () => {
            const rec = moduleInstances.recognition;
            if (rec) rec.isListening() ? rec.stop() : rec.start();
        });

        EventBus.on('shortcut:read-text', () => {
            const tts = moduleInstances.text;
            if (tts) tts.isReading() ? tts.stop() : tts.startReading();
        });

        EventBus.on('shortcut:stop-all', () => {
            moduleInstances.recognition?.stop();
            moduleInstances.text?.stop();
        });
    },

    verifyAllModulesLoaded() {
        const required = ['ui', 'text', 'highlight', 'recognition', 'feedback'];
        const missing = required.filter(m => !moduleStatus[m]);
        
        if (missing.length > 0) {
            EventBus.emit('module:partial', { 
                loaded: required.filter(m => moduleStatus[m]), 
                missing 
            });
        }
    },

    getModule(name) { return moduleInstances[name] || null; },

    async waitForModule(name, timeout = 5000) {
        if (moduleStatus[name]) return true;
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                EventBus.off('module:ready', handler);
                reject(new Error(`Timeout: ${name}`));
            }, timeout);
            const handler = (data) => {
                if (data.module === name) {
                    clearTimeout(timer);
                    EventBus.off('module:ready', handler);
                    resolve(true);
                }
            };
            EventBus.on('module:ready', handler);
        });
    }
};

export default ModuleLoader;