const fs = require('fs');

// Simple mock of the game_story_generator logic
const text = `STORY:
Maria estava triste. Ela perdeu o certificado de ensino.
Recentemente, ela encontrou um novo. Ela teve que se acostumar.

Pergunta 1. Por que Maria estava triste?
A) Porque perdeu o cachorro
B) Porque perdeu o certificado de ensino
C) Porque choveu
D) Porque não tinha dinheiro
Resposta Correta: B

Pergunta 2. O que Maria encontrou recentemente?
A) Um gato
B) Um carro
C) Um novo certificado
D) Um livro
Resposta Correta: C`;

function _extractQuestions(text) {
    const questionRegex = /(?:Q(?:UESTION)?|P(?:ERGUNTA)?|P(?:REGUNTA)?)?\s*\d*\s*[:.\-]?\s*([^\n]+)\n+(?:A\)|a\))\s*([^\n]+)\n+(?:B\)|b\))\s*([^\n]+)\n+(?:C\)|c\))\s*([^\n]+)\n+(?:D\)|d\))\s*([^\n]+)\n+(?:(?:ANSWER|CORRECT|RESPOSTA|RESPUESTA|A)\s*[:.\-]?\s*)([A-D])/gi;

    const questions = [];
    let match;
    while ((match = questionRegex.exec(text)) !== null) {
        questions.push({
            question: match[1].trim(),
            options: [match[2].trim(), match[3].trim(), match[4].trim(), match[5].trim()],
            correctIndex: match[6].toUpperCase().charCodeAt(0) - 65
        });
    }
    return questions;
}

console.log(_extractQuestions(text));
