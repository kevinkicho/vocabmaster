import os

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    idx = 0
    out = ""
    while True:
        pos = content.find("generateWithCritic(", idx)
        if pos == -1:
            out += content[idx:]
            break
            
        out += content[idx:pos+19]
        
        # parse args
        args_str = ""
        parens = 1
        i = pos + 19
        while i < len(content):
            if content[i] == '(':
                parens += 1
            elif content[i] == ')':
                parens -= 1
                if parens == 0:
                    break
            args_str += content[i]
            i += 1
            
        # now args_str contains the arguments string
        # split by comma, respecting quotes and braces
        parts = []
        curr = ""
        depth = 0
        in_quote = False
        quote_char = ""
        for c in args_str:
            if c in ("'", '"', '`') and not in_quote:
                in_quote = True
                quote_char = c
                curr += c
            elif c == quote_char and in_quote:
                in_quote = False
                curr += c
            elif not in_quote:
                if c in ('(', '{', '['): depth += 1
                elif c in (')', '}', ']'): depth -= 1
                
                if c == ',' and depth == 0:
                    parts.append(curr.strip())
                    curr = ""
                else:
                    curr += c
            else:
                curr += c
        parts.append(curr.strip())
        
        # Some methods just DEFINE generateWithCritic, don't change them here
        if len(parts) >= 4 and not parts[0].startswith('schemaName') and not parts[1].startswith('promptBuilder'):
            schema = parts[0]
            builder = parts[1]
            level = parts[2]
            lang = parts[3]
            prompt_args = parts[4:]
            
            on_progress = 'null'
            if prompt_args and prompt_args[-1] == 'onProgress':
                on_progress = prompt_args.pop()
                
            new_args = f"{{\n        schemaName: {schema},\n        promptBuilder: {builder},\n        level: {level},\n        langCode: {lang},\n        promptArgs: [{', '.join(prompt_args)}],\n        onProgress: {on_progress}\n    }}"
            out += new_args + ")"
        else:
            out += args_str + ")"
            
        idx = i + 1

    # fix signature if it's llm.js
    if "async generateWithCritic(" in out:
        old_sig = "async generateWithCritic(schemaName, promptBuilder, level, langCode, ...promptArgs) {"
        new_sig = "async generateWithCritic({ schemaName, promptBuilder, level, langCode, promptArgs = [], onProgress = null }) {"
        out = out.replace(old_sig, new_sig)
        
        old_internals = '''        let bestData = null;
        let bestScore = 0;
        const onProgress = promptArgs[promptArgs.length - 1];
        const actualArgs = typeof onProgress === 'function' ? promptArgs.slice(0, -1) : promptArgs;'''
        new_internals = '''        let bestData = null;
        let bestScore = 0;
        let actualArgs = [...promptArgs];'''
        out = out.replace(old_internals, new_internals)
        
        old_push = '''            if (critique.overallScore < 8) {
                L(`[Critic] Score too low, appending feedback for next attempt`);
                actualArgs.push(`[CRITIQUE FROM PREVIOUS ATTEMPT]\\n${critique.feedback}\\nPlease incorporate this feedback to improve your next attempt.`);
            }'''
        new_push = '''            if (critique.overallScore < 8) {
                L(`[Critic] Score too low, appending feedback for next attempt`);
                actualArgs = [...promptArgs, `[CRITIQUE FROM PREVIOUS ATTEMPT]\\n${critique.feedback}\\nPlease incorporate this feedback to improve your next attempt.`];
            }'''
        out = out.replace(old_push, new_push)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(out)

fix_file('public/js/llm.js')
fix_file('public/js/learning_loop.js')
