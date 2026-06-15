const fs = require('fs');

const text = `STORY:
Maria estava triste. Ela perdeu o certificado de ensino.
Recentemente, ela encontrou um novo. Ela teve que se acostumar.

1. Por que Maria estava triste?
A) Porque perdeu o cachorro
B) Porque perdeu o certificado de ensino
C) Porque choveu
D) Porque não tinha dinheiro
Resposta Correta: B

2. O que Maria encontrou recentemente?
A) Um gato
B) Um carro
C) Um novo certificado
D) Um livro
Resposta Correta: C`;

const questions = [];
const qBlocks = text.matchAll(/(?:Q\d|P\d|QUESTION|PERGUNTA|PREGUNTA|\d\.)[:\s]\s*([\s\S]*?)(?:ANSWER|CORRECT(?: ANSWER)?|RESPOSTA(?:\s+CORRETA)?|RESPUESTA(?:\s+CORRECTA)?)[:\s]*\*?([A-D])\*?/gi);

for (const m of qBlocks) {
    const block = m[1].trim();
    const correctLetter = m[2].toUpperCase();
    console.log("BLOCK:\n" + block);
    console.log("ANS:", correctLetter);
    console.log("---");
}
