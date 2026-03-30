// static/reading/core/keyboard-shortcuts.js
// PURPOSE: Handle keyboard shortcuts with configurable bindings and bilingual support (EN/UR)

import EventBus from './event-bus.js';

let shortcutsEnabled = true;
let helpVisible = false;
let initialized = false;

const DEFAULT_SHORTCUTS = {
    TOGGLE_RECORDING: { key: 'Space', ctrl: true, alt: false, shift: false },
    READ_TEXT: { key: 'KeyR', ctrl: true, alt: false, shift: false },
    PAUSE_RESUME: { key: 'KeyP', ctrl: true, alt: false, shift: false },
    STOP_ALL: { key: 'Escape', ctrl: false, alt: false, shift: false },
    GET_FEEDBACK: { key: 'KeyF', ctrl: true, alt: false, shift: false },
    TOGGLE_HELP: { key: 'KeyH', ctrl: true, alt: false, shift: false }
};

let shortcuts = { ...DEFAULT_SHORTCUTS };

// Updated to URDU to match project goals
const HELP_TEXTS = {
    en: {
        title: '⌨️ Keyboard Shortcuts',
        close: 'Close',
        shortcuts: [
            { keys: ['Ctrl', 'Space'], description: 'Start/Stop speaking' },
            { keys: ['Ctrl', 'R'], description: 'Read full text' },
            { keys: ['Ctrl', 'P'], description: 'Pause/Resume reading' },
            { keys: ['Esc'], description: 'Stop everything' },
            { keys: ['Ctrl', 'F'], description: 'Get pronunciation feedback' },
            { keys: ['Ctrl', 'H'], description: 'Show this help' }
        ],
        note: 'Shortcuts do not work while typing in text fields.',
        footer: 'Press Ctrl+H again to close'
    },
    ur: {
        title: '⌨️ کی بورڈ شارٹ کٹس',
        close: 'بند کریں',
        shortcuts: [
            { keys: ['Ctrl', 'Space'], description: 'بولنا شروع/بند کریں' },
            { keys: ['Ctrl', 'R'], description: 'پورا متن پڑھیں' },
            { keys: ['Ctrl', 'P'], description: 'پڑھنا روکیں/دوبارہ شروع کریں' },
            { keys: ['Esc'], description: 'سب کچھ روک دیں' },
            { keys: ['Ctrl', 'F'], description: 'تلفظ کا فیڈ بیک لیں' },
            { keys: ['Ctrl', 'H'], description: 'یہ مدد دکھائیں' }
        ],
        note: 'ٹیکسٹ فیلڈز میں ٹائپ کرتے وقت شارٹ کٹس کام نہیں کرتے۔',
        footer: 'بند کرنے کے لیے دوبارہ Ctrl+H دبائیں'
    }
};

export const KeyboardShortcuts = {
    init(options = {}) {
        if (initialized) return this;
        
        if (options.shortcuts) shortcuts = { ...shortcuts, ...options.shortcuts };
        if (options.enabled !== undefined) shortcutsEnabled = options.enabled;
        
        // Use arrow function or bind to keep 'this' context
        this._keydownHandler = (e) => this._handleKeyDown(e);
        document.addEventListener('keydown', this._keydownHandler);
        
        initialized = true;
        console.log('⌨️ Keyboard shortcuts initialized');
        return this;
    },

    _handleKeyDown(e) {
        if (!shortcutsEnabled) return;
        if (this._isInputField(e.target)) return;

        for (const [action, config] of Object.entries(shortcuts)) {
            if (this._matchesShortcut(e, config)) {
                this._executeAction(action, e);
                break; 
            }
        }
    },

    _isInputField(element) {
        const tag = element.tagName;
        return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || element.isContentEditable;
    },

    _matchesShortcut(e, shortcut) {
        if (shortcut.ctrl !== undefined && e.ctrlKey !== shortcut.ctrl) return false;
        if (shortcut.alt !== undefined && e.altKey !== shortcut.alt) return false;
        if (shortcut.shift !== undefined && e.shiftKey !== shortcut.shift) return false;
        return e.code === shortcut.key;
    },

    _executeAction(action, e) {
        e.preventDefault();
        
        // Map keyboard actions to internal events
        const actionMap = {
            'TOGGLE_RECORDING': 'shortcut:toggle-recording',
            'READ_TEXT': 'shortcut:read-text',
            'PAUSE_RESUME': 'shortcut:pause-resume',
            'STOP_ALL': 'shortcut:stop-all',
            'GET_FEEDBACK': 'shortcut:get-feedback'
        };

        if (action === 'TOGGLE_HELP') {
            this.toggleHelp();
        } else if (actionMap[action]) {
            EventBus.emit(actionMap[action], { source: 'keyboard' });
            if (action === 'STOP_ALL') this.hideHelp();
        }
        
        this._showFeedback(action);
    },

    _showFeedback(action) {
        const messages = {
            TOGGLE_RECORDING: { en: '🎤 Recording toggled', ur: '🎤 ریکارڈنگ تبدیل ہو گئی' },
            READ_TEXT: { en: '📖 Reading text', ur: '📖 متن پڑھا جا رہا ہے' },
            PAUSE_RESUME: { en: '⏯️ Playback toggled', ur: '⏯️ پلے بیک تبدیل ہو گیا' },
            STOP_ALL: { en: '⏹️ Stopped', ur: '⏹️ روک دیا گیا' },
            GET_FEEDBACK: { en: '📊 Getting feedback', ur: '📊 فیڈ بیک لیا جا رہا ہے' }
        };
        
        const lang = document.documentElement.lang === 'ur' ? 'ur' : 'en';
        const message = messages[action]?.[lang];
        
        if (message) {
            EventBus.emit('ui:show-toast', { message, type: 'info', timeout: 1500 });
        }
    },

    showHelp() {
        if (helpVisible) return;
        helpVisible = true;
        
        const lang = document.documentElement.lang === 'ur' ? 'ur' : 'en';
        const texts = HELP_TEXTS[lang];
        
        const helpDiv = document.createElement('div');
        helpDiv.id = 'keyboard-help';
        helpDiv.className = `keyboard-help-overlay ${lang === 'ur' ? 'rtl' : ''}`;
        
        const shortcutsHtml = texts.shortcuts.map(s => `
            <tr>
                <td>${s.keys.map(k => `<kbd>${k}</kbd>`).join(' + ')}</td>
                <td>${s.description}</td>
            </tr>
        `).join('');
        
        helpDiv.innerHTML = `
            <div class="keyboard-help-content">
                <h3>${texts.title}</h3>
                <button class="help-close" id="help-close-btn">✕</button>
                <table class="shortcuts-table">${shortcutsHtml}</table>
                <p class="help-note">${texts.note}</p>
                <p class="help-footer">${texts.footer}</p>
            </div>
        `;
        
        document.body.appendChild(helpDiv);
        document.getElementById('help-close-btn').onclick = () => this.hideHelp();
        helpDiv.onclick = (e) => { if (e.target === helpDiv) this.hideHelp(); };
    },

    hideHelp() {
        const help = document.getElementById('keyboard-help');
        if (help) { help.remove(); helpVisible = false; }
    },

    toggleHelp() { helpVisible ? this.hideHelp() : this.showHelp(); },
    
    destroy() {
        document.removeEventListener('keydown', this._keydownHandler);
        this.hideHelp();
        initialized = false;
    }
};

export default KeyboardShortcuts;