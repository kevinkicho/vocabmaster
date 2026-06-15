import re

with open('public/js/llm.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the method signature
content = content.replace('async generateWithCritic(schemaName, promptBuilder, level, langCode, ...promptArgs) {',
                          'async generateWithCritic({ schemaName, promptBuilder, level, langCode, promptArgs = [], onProgress = null }) {')

# Fix the internals
old_internals = """        let bestData = null;
        let bestScore = 0;
        const onProgress = promptArgs[promptArgs.length - 1];
        const actualArgs = typeof onProgress === 'function' ? promptArgs.slice(0, -1) : promptArgs;"""

new_internals = """        let bestData = null;
        let bestScore = 0;
        let actualArgs = [...promptArgs];"""
content = content.replace(old_internals, new_internals)

# Fix the push mutation
old_push = """            if (critique.overallScore < 8) {
                L(`[Critic] Score too low, appending feedback for next attempt`);
                actualArgs.push(`[CRITIQUE FROM PREVIOUS ATTEMPT]\\n${critique.feedback}\\nPlease incorporate this feedback to improve your next attempt.`);
            }"""

new_push = """            if (critique.overallScore < 8) {
                L(`[Critic] Score too low, appending feedback for next attempt`);
                actualArgs = [...promptArgs, `[CRITIQUE FROM PREVIOUS ATTEMPT]\\n${critique.feedback}\\nPlease incorporate this feedback to improve your next attempt.`];
            }"""
content = content.replace(old_push, new_push)

# Now fix the call sites in llm.js
def repl(m):
    args_str = m.group(1)
    # Be careful splitting by comma because arguments might contain function calls or strings.
    # Actually, all calls in llm.js are simple arguments or bind calls.
    # Let's write a simple parser or just split carefully.
    parts = []
    current = ""
    parens = 0
    quotes = False
    quote_char = ""
    for char in args_str:
        if char in ("'", '"') and not quotes:
            quotes = True
            quote_char = char
        elif char == quote_char and quotes:
            quotes = False
            
        if not quotes:
            if char == '(': parens += 1
            if char == ')': parens -= 1
            
        if char == ',' and parens == 0 and not quotes:
            parts.append(current.strip())
            current = ""
        else:
            current += char
    parts.append(current.strip())
    
    schema = parts[0]
    builder = parts[1]
    level = parts[2]
    lang = parts[3]
    prompt_args = parts[4:]
    
    on_progress = 'null'
    if prompt_args and prompt_args[-1] == 'onProgress':
        on_progress = prompt_args.pop()
        
    prompt_args_str = ", ".join(prompt_args)
    return f"this.validator.generateWithCritic({{\n        schemaName: {schema},\n        promptBuilder: {builder},\n        level: {level},\n        langCode: {lang},\n        promptArgs: [{prompt_args_str}],\n        onProgress: {on_progress}\n    }})"

# Only match the ones to this.validator.generateWithCritic
content = re.sub(r'this\.validator\.generateWithCritic\((.*?)\)', repl, content, flags=re.DOTALL)

with open('public/js/llm.js', 'w', encoding='utf-8') as f:
    f.write(content)

with open('public/js/learning_loop.js', 'r', encoding='utf-8') as f:
    content2 = f.read()

content2 = re.sub(r'this\.validator\.generateWithCritic\((.*?)\)', repl, content2, flags=re.DOTALL)

with open('public/js/learning_loop.js', 'w', encoding='utf-8') as f:
    f.write(content2)
