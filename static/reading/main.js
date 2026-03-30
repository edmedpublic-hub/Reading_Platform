// static/reading/main.js
// PURPOSE: Application bootstrapper (starts the entire reading system)

import ModuleLoader from './core/module-loader.js';
import EventBus from './core/event-bus.js';
import AppState from './core/app-state.js'; // Use default import for consistency
import { ErrorHandler } from './core/error-handler.js';

const ReadingApp = {
    initialized: false,

    /**
     * Start the application
     */
    async init() {
        if (this.initialized) return;
        this.initialized = true;

        console.log('🚀 Reading Platform: Booting application...');

        try {
            this.syncWithDOM();
            this.initCore();

            // 1. Start all feature modules
            await ModuleLoader.initializeAll();

            this.setupGlobalListeners();

            // 2. NEW: Load the actual lesson content
            await this.loadInitialContent();

            console.log('✅ Reading Platform Ready');

            EventBus.emit('app:ready', {
                timestamp: Date.now(),
                language: AppState.get('currentLanguage') || 'en'
            });

        } catch (error) {
            ErrorHandler.handle('Application bootstrap failed', {
                error, context: 'main'
            });
        }
    },

    /**
     * Fetch and distribute lesson content to modules
     */
    async loadInitialContent() {
        const lesson = AppState.get('currentLesson');
        if (!lesson || !lesson.id) return;

        try {
            const response = await fetch(`/reading/api/lessons/${lesson.id}/`);
            const data = await response.json();

            if (data && data.content) {
                const tts = ModuleLoader.getModule('text');
                const highlighter = ModuleLoader.getModule('highlight');
                const recognition = ModuleLoader.getModule('recognition');

                // 1. IMPORTANT: Set the Highlighter FIRST and tell it to wrap sentences
                if (highlighter) {
                    // Use prepare(text, false) to force-create the spans/sentences
                    highlighter.prepare(data.content, false); 
                }

                // 2. Set the others
                if (tts) tts.setText(data.content);
                if (recognition) recognition.setExpectedText(data.content);
                
                // 3. Give the DOM a tiny breath to render the new spans
                setTimeout(() => {
                    // Force the TTS to look for the spans the highlighter just created
                    const sentences = document.querySelectorAll('.reading-sentence');
                    console.log(`🔍 Found ${sentences.length} sentences for TTS`);
                    
                    if (tts && typeof tts.setQueue === 'function') {
                        tts.setQueue(Array.from(sentences));
                    }
                }, 100); 
            }
        } catch (error) {
            console.error('❌ Failed to load lesson content:', error);
        }
    },
    /**
     * Synchronize AppState with current HTML template data
     */
    syncWithDOM() {
        const container = document.getElementById('reading-app');
        if (!container) {
            console.error('❌ Critical Error: #reading-app container not found in HTML');
            return;
        }

        // Initialize AppState with data attributes from the HTML
        AppState.initAppState({
            config: {
                autoInitModules: container.dataset.autoInit === 'true'
            }
        });

        // Set the current lesson if provided by Django template
        const lessonId = container.dataset.lessonId;
        if (lessonId) {
            AppState.set('currentLesson', { id: lessonId });
        }

        // PRE-FLIGHT VALIDATION: Check for essential elements
        const ids = AppState.getElementIds();
        const essential = ['text', 'readBtn', 'startListeningBtn'];
        
        essential.forEach(key => {
            const elId = ids[key];
            if (!document.getElementById(elId)) {
                console.warn(`⚠️ UI Warning: Essential element "${key}" (ID: ${elId}) is missing from the page.`);
            }
        });
    },

    /**
     * Initialize core system state
     */
    initCore() {
        try {
            const config = AppState.getConfig();
            console.log('⚙️ Configuration loaded:', config);

            const isMobile = AppState.isMobile();
            const currentLang = AppState.get('currentLanguage') || 'en';

            EventBus.emit('core:initialized', {
                mobile: isMobile,
                language: currentLang
            });

        } catch (error) {
            ErrorHandler.handle('Core initialization failed', {
                error,
                context: 'main:initCore'
            });
        }
    },

    /**
     * Global event listeners
     */
    setupGlobalListeners() {
        EventBus.on('module:partial', (data) => {
            console.warn('⚠️ Some modules failed to load', data);
        });

        EventBus.on('app:ready', () => {
            console.log('🎯 Modules initialized and ready');
        });

        window.addEventListener('error', (event) => {
            ErrorHandler.handle('Global runtime error', {
                error: event.error,
                context: 'window'
            });
        });

        window.addEventListener('unhandledrejection', (event) => {
            ErrorHandler.handle('Unhandled promise rejection', {
                error: event.reason,
                context: 'promise'
            });
        });
    }
};

/**
 * Start app when DOM ready
 */
document.addEventListener('DOMContentLoaded', () => {
    ReadingApp.init();
});

export default ReadingApp;