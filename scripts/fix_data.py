import re

# Update data.js
with open("public/js/data.js", "r") as f:
    data = f.read()

# Add get activeList() after constructor
data = re.sub(r"this\.currentCollection = 'all';\s*\}", "this.currentCollection = 'all';\n    }\n\n    get activeList() {\n        return this._reviewList || this.list;\n    }", data)

# Fix startReviewSession
data = re.sub(r'this\._originalList = this\.list;\s*// Temporarily override for this session\s*this\.list = reviewWords;', '', data)

# Fix startSpecificReview
data = re.sub(r'this\._originalList = this\.list;\s*this\.list = words;', '', data)

# Fix endReviewSession
data = re.sub(r'if \(this\._originalList\) \{\s*this\.list = this\._originalList;\s*this\._originalList = null;\s*\}\s*this\._reviewList = null;', 'this._reviewList = null;', data)

with open("public/js/data.js", "w") as f:
    f.write(data)

def repl(filepath, old, new):
    with open(filepath, "r") as f:
        c = f.read()
    c = c.replace(old, new)
    with open(filepath, "w") as f:
        f.write(c)

repl("public/js/game_core.js", "this.list = (app.data && app.data.list) ? app.data.list : [];", "this.list = (app.data && app.data.activeList) ? app.data.activeList : [];")
repl("public/js/store.js", "game.list = app.data.list;", "game.list = app.data.activeList;")
repl("public/js/game_story.js", "app.data.list : []", "app.data.activeList : []")
repl("public/js/ui.js", "app.game.list = app.data.list;", "app.game.list = app.data.activeList;")
repl("public/js/ui_settings.js", "app.game.list = app.data.list;", "app.game.list = app.data.activeList;")

# Fix the bugs where it used app.data.list[app.game.i] instead of app.game.list[app.game.i]
repl("public/js/ui.js", "const currentItem = app.data.list[app.game.i];", "const currentItem = app.game.list[app.game.i];")
repl("public/js/ui_modals.js", "const currentItem = app.data.list[app.game.i];", "const currentItem = app.game.list[app.game.i];")
