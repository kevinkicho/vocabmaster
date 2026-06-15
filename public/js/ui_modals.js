// Extracted Modals from ui.js
Object.assign(UIManager.prototype, {
    // UPDATED: NEW TABBED MODAL
    openEditModal() { 
        try {
            if(!app.game || app.game.i === undefined || !app.data || !app.game.list) return; 
            const item = app.game.list[app.game.i]; 
            if(!item) return; 
            
            const container = document.getElementById('edit-form-body'); 
            if(!container) return;
            
            document.getElementById('edit-id').innerText = `#${item.id}`; 
            
            let tabContainer = document.getElementById('edit-tabs');
            if(!tabContainer) {
                container.innerHTML = `
                <div id="edit-tabs" class="flex gap-2 mb-4 border-b border-slate-100 dark:border-neutral-800">
                    <button id="tab-vocab" class="px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors" onclick="app.ui.switchEditTab('vocab')">Vocab</button>
                    <button id="tab-dictionary" class="px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors" onclick="app.ui.switchEditTab('dictionary')">Dictionary</button>
                </div>
                <div id="view-vocab" class="block h-[60vh] overflow-y-auto thin-scroll pb-4"></div>
                <div id="view-dictionary" class="hidden h-[60vh] overflow-y-auto thin-scroll flex-col gap-4 pb-4"></div>
                `;
            } else {
                app.ui.switchEditTab('vocab');
            }

            const viewVocab = document.getElementById('view-vocab');
            const viewDict = document.getElementById('view-dictionary');
            
            viewVocab.innerHTML = '';
            if(typeof LANG_CONFIG !== 'undefined') { 
                LANG_CONFIG.forEach(conf => { 
                    const val = item[conf.key] || ""; 
                    const exVal = conf.exKey ? (item[conf.exKey] || "") : ""; 
                    const safeVal = escapeHtml(val);
                    const safeEx = escapeHtml(exVal);
                    let html = `<div class="bg-slate-50 dark:bg-neutral-800/50 p-3 rounded-2xl border border-slate-100 dark:border-neutral-800 mb-2"><label class="text-[10px] uppercase font-bold text-slate-400 mb-1 flex items-center gap-2"><span>${conf.icon}</span> ${conf.label}</label><input type="text" id="edit-field-${conf.key}" value="${safeVal}" placeholder="Word..." class="w-full bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-sm font-bold text-slate-700 dark:text-white outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all placeholder-slate-300 mb-2">`; 
                    if(conf.exKey) { html += `<textarea id="edit-field-${conf.exKey}" placeholder="Example Sentence..." rows="2" class="w-full bg-slate-100 dark:bg-neutral-900 border border-slate-200 dark:border-neutral-700 rounded-xl px-3 py-2 text-xs font-medium text-slate-600 dark:text-neutral-400 outline-none focus:border-indigo-500 transition-all placeholder-slate-400">${safeEx}</textarea>`; } 
                    html += `</div>`; 
                    viewVocab.innerHTML += html; 
                }); 
            }

            viewDict.innerHTML = '<div class="p-8 text-center"><i class="ph-bold ph-spinner animate-spin text-2xl text-indigo-500"></i><p class="text-xs font-bold text-slate-400 mt-2">Scanning...</p></div>';
            this.scanAndRenderDictionary(item);

            document.getElementById('modal-edit').classList.remove('hidden');
            if(viewVocab) viewVocab.scrollTop = 0;
            if(viewDict) viewDict.scrollTop = 0;

        } catch(e) { L("Open Edit Modal Error", e); }
    },

    switchEditTab(tab) {
        const vBtn = document.getElementById('tab-vocab');
        const dBtn = document.getElementById('tab-dictionary');
        const vView = document.getElementById('view-vocab');
        const dView = document.getElementById('view-dictionary');
        
        if (tab === 'vocab') {
            vBtn.className = "px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            dBtn.className = "px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors";
            vView.classList.remove('hidden');
            dView.classList.add('hidden');
            document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]').classList.remove('hidden');
        } else {
            dBtn.className = "px-4 py-2 text-sm font-bold text-indigo-600 border-b-2 border-indigo-600 transition-colors";
            vBtn.className = "px-4 py-2 text-sm font-bold text-slate-400 border-b-2 border-transparent hover:text-indigo-500 transition-colors";
            dView.classList.remove('hidden');
            vView.classList.add('hidden');
            document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]').classList.add('hidden');
        }
    },

    async scanAndRenderDictionary(item) {
        const viewDict = document.getElementById('view-dictionary');
        const cjkRegex = /[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/g;
        const charSet = new Set();
        Object.values(item).forEach(val => {
            if (typeof val === 'string') {
                const matches = val.match(cjkRegex);
                if (matches) matches.forEach(c => charSet.add(c));
            }
        });
        const chars = Array.from(charSet);

        if (chars.length === 0) {
            viewDict.innerHTML = '<div class="p-4 text-center text-slate-400">No Characters Found</div>';
            return;
        }

        viewDict.innerHTML = ''; 
        
        const entries = [];
        for (const char of chars) {
            const entry = await app.data.getKanji(char);
            entries.push({ char, data: entry });
        }

        entries.sort((a, b) => {
            if (!a.data && b.data) return -1;
            if (a.data && !b.data) return 1;
            return 0;
        });

        for (const { char, data: entry } of entries) {
            const data = entry || { id: null, s: char, t: char, p: '', k: '', e: '' };
            const isNew = !entry;

            const div = document.createElement('div');
            div.className = `bg-slate-50 dark:bg-neutral-800/50 p-4 rounded-xl border ${isNew ? 'border-amber-300 dark:border-amber-500/50 ring-1 ring-amber-100 dark:ring-amber-900/30' : 'border-slate-200 dark:border-neutral-700'}`;
            
            div.innerHTML = `
                <div class="flex items-center justify-between mb-2">
                    <h3 class="text-lg font-black text-slate-800 dark:text-white flex items-center gap-2">
                        ${escapeHtml(char)}
                        ${isNew ? '<span class="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-600 dark:bg-amber-900 dark:text-amber-300">NEW</span>' : ''}
                    </h3>
                    <button class="text-xs bg-indigo-500 text-white px-3 py-1 rounded-lg font-bold active:scale-95" onclick="app.ui.saveDictEntry(this, '${escapeHtml(char)}', ${data.id})">Save</button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Trad</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="t" value="${escapeHtml(data.t || char)}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Simp</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="s" value="${escapeHtml(data.s || char)}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Pinyin</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="p" value="${escapeHtml(data.p || '')}"></div>
                    <div><span class="text-[9px] uppercase font-bold text-slate-400">Korean</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="k" value="${escapeHtml(data.k || '')}"></div>
                    <div class="col-span-2"><span class="text-[9px] uppercase font-bold text-slate-400">English</span><input class="w-full bg-white dark:bg-neutral-900 border border-slate-200 dark:border-neutral-600 rounded p-1 text-sm font-bold" data-field="e" value="${escapeHtml(data.e || '')}"></div>
                </div>
            `;
            viewDict.appendChild(div);
        }
    },

    async saveDictEntry(btn, char, id) {
        const parent = btn.closest('div').parentElement;
        const getVal = (f) => parent.querySelector(`input[data-field="${f}"]`).value.trim();
        
        const update = {
            id: id || Date.now(),
            t: getVal('t'),
            s: getVal('s'),
            p: getVal('p'),
            k: getVal('k'),
            e: getVal('e')
        };

        const origText = btn.innerText;
        btn.innerText = "...";
        try {
            await app.data.saveDictionaryEntry(update);
            btn.innerText = "Done";
            btn.classList.add('bg-emerald-500');
            setTimeout(() => { btn.innerText = origText; btn.classList.remove('bg-emerald-500'); }, 1500);
        } catch(e) {
            app.ui.showToast("Save failed", 'error');
            btn.innerText = origText;
        }
    },
    
    closeEditModal() { document.getElementById('modal-edit').classList.add('hidden'); },
    async saveEdit() { if(!app.game || app.game.i === undefined) return; const currentItem = app.data.list[app.game.i]; const updates = { ...currentItem }; if(typeof LANG_CONFIG !== 'undefined') { LANG_CONFIG.forEach(conf => { const el = document.getElementById(`edit-field-${conf.key}`); if(el) updates[conf.key] = el.value.trim(); if(conf.exKey) { const elEx = document.getElementById(`edit-field-${conf.exKey}`); if(elEx) updates[conf.exKey] = elEx.value.trim(); } }); } const btn = document.querySelector('#modal-edit button[onclick="app.ui.saveEdit()"]'); const origText = btn.innerHTML; btn.innerHTML = `<i class="ph-bold ph-spinner animate-spin"></i> Saving...`; btn.disabled = true; try { await app.data.saveCorrection(updates); this.closeEditModal(); 
        if (app.game && typeof app.game.update === 'function') { app.game.update(); } 
        const bar = document.getElementById('status-bar'); bar.innerText = "Correction Saved!"; bar.classList.add('text-emerald-500'); setTimeout(() => bar.classList.remove('text-emerald-500'), 2000); } catch(e) { app.ui.showToast("Save failed: " + e.message, 'error'); } finally { btn.innerHTML = origText; btn.disabled = false; } },

    openProfileModal() { if (!auth.currentUser) return; const user = auth.currentUser; const modal = document.getElementById('modal-profile'); const container = document.getElementById('profile-content'); const created = new Date(user.metadata.creationTime).toLocaleDateString(); container.innerHTML = `<div class="flex flex-col items-center mb-6"><img src="${escapeHtml(user.photoURL)}" class="w-24 h-24 rounded-full shadow-lg border-4 border-white dark:border-neutral-700 mb-3"><h3 class="text-xl font-black text-slate-800 dark:text-white">${escapeHtml(user.displayName)}</h3><p class="text-xs font-bold text-slate-400">${escapeHtml(user.email)}</p></div><div class="bg-slate-50 dark:bg-neutral-800 rounded-2xl p-4 border border-slate-100 dark:border-neutral-700 mb-6 space-y-2"><div class="flex justify-between text-sm"><span class="text-slate-500 font-bold">Active Since</span><span class="font-bold text-slate-800 dark:text-neutral-300">${escapeHtml(created)}</span></div></div><button onclick="app.auth.logout(); document.getElementById('modal-profile').classList.add('hidden');" class="w-full bg-slate-200 dark:bg-neutral-700 hover:bg-slate-300 text-slate-700 dark:text-neutral-300 font-bold py-3 rounded-xl mb-3">Log Out</button><button onclick="app.data.deleteUserAccount()" class="w-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 hover:bg-rose-200 font-bold py-3 rounded-xl">Delete Account</button>`; modal.classList.remove('hidden'); }

});
