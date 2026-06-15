import re

with open('public/js/llm.js', 'r', encoding='utf-8') as f:
    code = f.read()

# 1. Add abort signal to _ollamaRequest
code = code.replace(
    "async _ollamaRequest(path, payload, { stream = false, timeout = 45000, method = null } = {}) {",
    "async _ollamaRequest(path, payload, { stream = false, timeout = 45000, method = null, signal = null } = {}) {"
)
code = code.replace(
    "signal: AbortSignal.timeout(timeout)",
    "signal: signal ? (AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : signal) : AbortSignal.timeout(timeout)"
)

# 2. Fix _enqueue
old_enqueue = """    _enqueue(fn) {
        this._queue = this._queue.then(fn, fn);
        return this._queue;
    }"""
new_enqueue = """    _enqueue(fn) {
        const next = this._queue.then(() => fn(), () => fn());
        this._queue = next.catch(() => {});
        return next;
    }"""
code = code.replace(old_enqueue, new_enqueue)

# 3. Fix streamGenerate capacitor HttpProxy
stream_start = """    async streamGenerate(opts, onToken) {
        let model = this.resolvedModel || this.model;"""
stream_new = """    async streamGenerate(opts, onToken) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.HttpProxy) {
            L('[LLM] Capacitor HttpProxy detected, falling back to non-streaming generate to avoid crashes.');
            const fullText = await this.generate(opts);
            if (onToken) onToken(fullText);
            return;
        }

        let model = this.resolvedModel || this.model;"""
code = code.replace(stream_start, stream_new)

# 4. Fix generate and streamGenerate timeout propagation and pass signal
code = code.replace(
    "timeout: opts.timeout || 45000\n                });",
    "timeout: opts.timeout || 45000,\n                    signal: opts.signal\n                });"
)
code = code.replace(
    "timeout: opts.timeout || 180000\n                });",
    "timeout: opts.timeout || 180000,\n                    signal: opts.signal\n                });"
)

# 5. Fix obj.error throw in streamGenerate
err_throw_old = """                        if (obj.error) {
                            L('[LLM] stream error from backend for model', this.resolvedModel || model, ':', obj.error);
                        }"""
err_throw_new = """                        if (obj.error) {
                            L('[LLM] stream error from backend for model', this.resolvedModel || model, ':', obj.error);
                            if (fullText.length < 10) throw new Error(obj.error);
                        }"""
code = code.replace(err_throw_old, err_throw_new)

# 6. Fix buildListeningPrompt missing '}'
list_prompt_old = '''    "answer": "A"
  
  Rules:'''
list_prompt_new = '''    "answer": "A"
  }
  
  Rules:'''
code = code.replace(list_prompt_old, list_prompt_new)

with open('public/js/llm.js', 'w', encoding='utf-8') as f:
    f.write(code)

print("Done")
