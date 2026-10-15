const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const scriptPath = path.join(__dirname, '..', 'source', 'js', 'theme-toggle.js');

function loadToggle({ stored = null, systemDark = false } = {}) {
  const values = new Map(stored === null ? [] : [['next-color-scheme', stored]]);
  const attributes = {};
  const listeners = {};
  const button = {
    attributes,
    className: '',
    innerHTML: '',
    type: '',
    setAttribute(name, value) {
      attributes[name] = value;
    },
    addEventListener(name, listener) {
      listeners[name] = listener;
    },
    click() {
      listeners.click();
    }
  };
  const sidebar = {
    appended: null,
    appendChild(element) {
      this.appended = element;
    }
  };
  const mediaListeners = {};
  const context = {
    document: {
      documentElement: { style: {}, dataset: {} },
      createElement: () => button,
      querySelector: selector => selector === '.sidebar-inner' ? sidebar : null
    },
    localStorage: {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value)
    },
    window: {
      matchMedia: () => ({
        matches: systemDark,
        addEventListener(name, listener) {
          mediaListeners[name] = listener;
        }
      })
    }
  };

  vm.runInNewContext(fs.readFileSync(scriptPath, 'utf8'), context);
  return { button, context, mediaListeners, sidebar, values };
}

test('restores the saved scheme and persists an accessible toggle choice', () => {
  const { button, context, sidebar, values } = loadToggle({ stored: 'dark' });

  assert.equal(sidebar.appended, button);
  assert.equal(context.document.documentElement.style.colorScheme, 'dark');
  assert.equal(button.attributes['aria-label'], '切换到浅色模式');
  assert.match(button.innerHTML, /fa-sun/);

  button.click();

  assert.equal(context.document.documentElement.style.colorScheme, 'light');
  assert.equal(values.get('next-color-scheme'), 'light');
  assert.equal(button.attributes['aria-label'], '切换到深色模式');
  assert.match(button.innerHTML, /fa-moon/);
});

test('uses and tracks the system preference until the visitor chooses a scheme', () => {
  const { button, context, mediaListeners } = loadToggle({ systemDark: true });

  assert.equal(context.document.documentElement.style.colorScheme, 'dark');
  mediaListeners.change({ matches: false });
  assert.equal(context.document.documentElement.style.colorScheme, 'light');
  assert.equal(button.attributes['aria-label'], '切换到深色模式');
});
