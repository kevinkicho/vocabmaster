/* js/story_fallback.js */
window.StoryFallback = {
    templates: {
        en: {
            intro: "Today we learned some new words in class.",
            sentences: [
                "The teacher explained that '{word}' is very important.",
                "I wrote '{word}' in my notebook.",
                "We discussed the meaning of '{word}'.",
                "She told us a story about '{word}'."
            ],
            q1: "What did we learn in class today?",
            a1: ["Math", "New words", "History", "Science"],
            q2: "Where did I write the words?",
            a2: ["On the board", "In my notebook", "On my hand", "On the computer"]
        },
        es: {
            intro: "Hoy aprendimos algunas palabras nuevas en clase.",
            sentences: [
                "El profesor explicó que '{word}' es muy importante.",
                "Escribí '{word}' en mi cuaderno.",
                "Discutimos el significado de '{word}'.",
                "Nos contó una historia sobre '{word}'."
            ],
            q1: "¿Qué aprendimos hoy en clase?",
            a1: ["Matemáticas", "Palabras nuevas", "Historia", "Ciencias"],
            q2: "¿Dónde escribí las palabras?",
            a2: ["En la pizarra", "En mi cuaderno", "En mi mano", "En la computadora"]
        },
        ja: {
            intro: "今日、クラスで新しい単語をいくつか学びました。",
            sentences: [
                "先生は「{word}」がとても重要だと説明しました。",
                "私はノートに「{word}」と書きました。",
                "私たちは「{word}」の意味について話し合いました。",
                "先生は「{word}」についての話をしてくれました。"
            ],
            q1: "今日クラスで何を学びましたか？",
            a1: ["数学", "新しい単語", "歴史", "科学"],
            q2: "私はどこに単語を書きましたか？",
            a2: ["黒板", "ノート", "手", "コンピューター"]
        },
        ko: {
            intro: "오늘 수업에서 우리는 몇 가지 새로운 단어를 배웠습니다.",
            sentences: [
                "선생님은 '{word}'이(가) 매우 중요하다고 설명하셨습니다.",
                "나는 노트에 '{word}'을(를) 적었습니다.",
                "우리는 '{word}'의 의미에 대해 토론했습니다.",
                "선생님은 '{word}'에 대한 이야기를 해주셨습니다."
            ],
            q1: "오늘 수업에서 무엇을 배웠나요?",
            a1: ["수학", "새로운 단어", "역사", "과학"],
            q2: "나는 단어를 어디에 적었나요?",
            a2: ["칠판", "노트", "손", "컴퓨터"]
        },
        zh: {
            intro: "今天我们在课堂上学了一些新单词。",
            sentences: [
                "老师解释说“{word}”非常重要。",
                "我把“{word}”写在了笔记本上。",
                "我们讨论了“{word}”的含义。",
                "老师给我们讲了一个关于“{word}”的故事。"
            ],
            q1: "今天我们在课堂上学了什么？",
            a1: ["数学", "新单词", "历史", "科学"],
            q2: "我把单词写在哪里了？",
            a2: ["黑板上", "笔记本上", "手上", "电脑上"]
        },
        fr: {
            intro: "Aujourd'hui, nous avons appris de nouveaux mots en classe.",
            sentences: [
                "Le professeur a expliqué que '{word}' est très important.",
                "J'ai écrit '{word}' dans mon cahier.",
                "Nous avons discuté de la signification de '{word}'.",
                "Elle nous a raconté une histoire sur '{word}'."
            ],
            q1: "Qu'avons-nous appris en classe aujourd'hui ?",
            a1: ["Les mathématiques", "De nouveaux mots", "L'histoire", "Les sciences"],
            q2: "Où ai-je écrit les mots ?",
            a2: ["Sur le tableau", "Dans mon cahier", "Sur ma main", "Sur l'ordinateur"]
        },
        de: {
            intro: "Heute haben wir im Unterricht einige neue Wörter gelernt.",
            sentences: [
                "Der Lehrer erklärte, dass '{word}' sehr wichtig ist.",
                "Ich habe '{word}' in mein Notizbuch geschrieben.",
                "Wir haben über die Bedeutung von '{word}' diskutiert.",
                "Sie erzählte uns eine Geschichte über '{word}'."
            ],
            q1: "Was haben wir heute im Unterricht gelernt?",
            a1: ["Mathematik", "Neue Wörter", "Geschichte", "Wissenschaft"],
            q2: "Wo habe ich die Wörter aufgeschrieben?",
            a2: ["An der Tafel", "In meinem Notizbuch", "Auf meiner Hand", "Auf dem Computer"]
        }
    },

    generate: function(words, langCode) {
        // Fallback to English if language not supported
        const tmpl = this.templates[langCode] || this.templates['en'];
        
        let story = tmpl.intro + " ";
        const selectedSentences = [];
        
        // Pick random unique sentences for each word
        const availSentences = [...tmpl.sentences];
        
        words.forEach(vocab => {
            if (availSentences.length === 0) return;
            const idx = Math.floor(Math.random() * availSentences.length);
            const sentenceTmpl = availSentences.splice(idx, 1)[0];
            const wordText = vocab[langCode] || vocab.word || vocab.id || "";
            selectedSentences.push(sentenceTmpl.replace('{word}', wordText));
        });
        
        story += selectedSentences.join(" ");

        // Build questions structure expected by the app
        // Q1 is B (index 1), Q2 is B (index 1)
        const q1Choices = tmpl.a1.map((ans, i) => ({
            letter: String.fromCharCode(65 + i),
            text: ans
        }));
        
        const q2Choices = tmpl.a2.map((ans, i) => ({
            letter: String.fromCharCode(65 + i),
            text: ans
        }));

        const questions = [
            {
                text: tmpl.q1,
                choices: q1Choices,
                correct: 'B'
            },
            {
                text: tmpl.q2,
                choices: q2Choices,
                correct: 'B'
            }
        ];

        return {
            storyPart: story,
            questions: questions
        };
    }
};
