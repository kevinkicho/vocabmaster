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

const questionRegex = /(?:Q(?:UESTION)?|P(?:ERGUNTA)?|P(?:REGUNTA)?)?\s*\d*\s*[:.\-)?]?\s*([^\n]+)\n+(?:A\)|a\))\s*([^\n]+)\n+(?:B\)|b\))\s*([^\n]+)\n+(?:C\)|c\))\s*([^\n]+)\n+(?:D\)|d\))\s*([^\n]+)\n+(?:(?:ANSWER|CORRECT|RESPOSTA(?:\s+CORRETA)?|RESPUESTA(?:\s+CORRECTA)?|A)\s*[:.\-]?\s*)([A-D])/gi;

let match;
while ((match = questionRegex.exec(text)) !== null) {
    console.log("Q:", match[1]);
    console.log("A:", match[2]);
    console.log("B:", match[3]);
    console.log("C:", match[4]);
    console.log("D:", match[5]);
    console.log("Ans:", match[6]);
    console.log("---");
}
