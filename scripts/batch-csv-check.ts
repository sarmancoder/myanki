import { parseBatchCards } from "@/lib/cards/batch";
import { parseCsvRows } from "@/lib/decks/transfer";

let failures = 0;

function check(name: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    failures += 1;
    console.error(`FALLO ${name}\n  esperado: ${b}\n  actual:   ${a}`);
  } else {
    console.log(`ok    ${name}`);
  }
}

// Cabecera opcional + filas simples.
check(
  "cabecera + filas",
  parseBatchCards("anverso,reverso\nbonjour,hola\nmerci,gracias"),
  { cards: [{ front: "bonjour", back: "hola" }, { front: "merci", back: "gracias" }], failures: [], ignored: 1 }
);

// Sin cabecera.
check(
  "sin cabecera",
  parseBatchCards("bonjour,hola").cards,
  [{ front: "bonjour", back: "hola" }]
);

// Cabecera inglesa y con acentos/mayúsculas.
check("cabecera front,back", parseBatchCards("front,back\na,b").cards, [{ front: "a", back: "b" }]);
check("cabecera Anverso,Reverso", parseBatchCards("Anverso, Reverso\na,b").cards, [{ front: "a", back: "b" }]);
check("cabecera invertida NO es cabecera", parseBatchCards("reverso,anverso\na,b").cards, [
  { front: "reverso", back: "anverso" },
  { front: "a", back: "b" },
]);

// Línea en blanco antes de la cabecera: la cabecera sigue detectándose.
check("cabecera tras línea vacía", parseBatchCards("\n\nanverso,reverso\na,b").cards, [
  { front: "a", back: "b" },
]);

// Cabecera con el aviso del idioma entre paréntesis, tal y como la muestra el
// formulario de alta en lote: se descarta igual que `anverso,reverso`.
check(
  "cabecera con idioma",
  parseBatchCards("anverso (Francés),reverso\nbonjour,hola"),
  { cards: [{ front: "bonjour", back: "hola" }], failures: [], ignored: 1 }
);
check("cabecera con idioma y espacios", parseBatchCards("Anverso (inglés), Reverso\na,b").cards, [
  { front: "a", back: "b" },
]);
check("cabecera con bandera", parseBatchCards("anverso (🇬🇧 Inglés),reverso\na,b").cards, [
  { front: "a", back: "b" },
]);
// El aviso solo se descarta si va al final: un anverso real con paréntesis se conserva.
check("paréntesis en contenido", parseBatchCards("bonjour (formal),hola").cards, [
  { front: "bonjour (formal)", back: "hola" },
]);

// Comas dentro de un campo entrecomillado.
check(
  "comas entrecomilladas",
  parseBatchCards('"voir, comprendre",comprender').cards,
  [{ front: "voir, comprendre", back: "comprender" }]
);

// Comillas dobles escapadas con "".
check(
  "comillas escapadas",
  parseBatchCards('"dice ""hola""",saludo').cards,
  [{ front: 'dice "hola"', back: "saludo" }]
);

// Comilla literal dentro de un campo sin entrecomillar (no debe tragarse la fila).
check(
  "comilla no inicial",
  parseBatchCards('hola "qué tal",saludo').cards,
  [{ front: 'hola "qué tal"', back: "saludo" }]
);

// Salto de línea dentro de un campo entrecomillado.
check(
  "salto de línea entrecomillado",
  parseBatchCards('"uno\ndos",tres\ncuatro,cinco').cards,
  [{ front: "uno\ndos", back: "tres" }, { front: "cuatro", back: "cinco" }]
);

// La numeración de líneas sigue siendo la del texto original pese al campo multilínea:
// la fila válida ocupa las líneas 1-2, así que los fallos empiezan en la 3.
check(
  "línea reportada tras campo multilínea",
  parseBatchCards('"uno\ndos",tres\nroto\n"a","b","c"\n,e\nd,e').failures.map((f) => f.line),
  [3, 4, 5]
);

// Detección de errores por fila.
check(
  "errores por fila",
  parseBatchCards("a,b\nsincoma\nd,e,f\n,e").failures.map((f) => f.message),
  [
    'Falta la coma que separa anverso y reverso (ej. "bonjour,hola")',
    "La fila tiene 3 columnas y se esperan 2. Entrecomilla las comas del contenido, p. ej. \"voir, comprendre\",comprender",
    "El anverso está vacío",
  ]
);

// El tabulador ya no es separador válido.
check("tabulador rechazado", parseBatchCards("bonjour\thola").failures.length, 1);
check("flecha rechazada", parseBatchCards("bonjour -> hola").cards, []);

// Filas vacías y CRLF.
check("filas vacías + CRLF", parseBatchCards("a,b\r\n\r\nc,d\r\n"), {
  cards: [{ front: "a", back: "b" }, { front: "c", back: "d" }],
  failures: [],
  ignored: 1,
});

// Techo de 500 tarjetas: la 501 se reporta como fallo, no como tarjeta.
const overflow = parseBatchCards(
  Array.from({ length: 501 }, (_, i) => `f${i},b${i}`).join("\n")
);
check("techo de tarjetas", [overflow.cards.length, overflow.failures.length], [500, 1]);

// El importador por archivo sigue descartando filas vacías.
check("parseCsvRows descarta vacías", parseCsvRows("a,b\n\n\nc,d\n"), [
  ["a", "b"],
  ["c", "d"],
]);
check("parseCsvRows multilínea", parseCsvRows('"x\ny",z\nc,d'), [
  ["x\ny", "z"],
  ["c", "d"],
]);

console.log(failures === 0 ? "\nTodo correcto." : `\n${failures} comprobación(es) fallida(s).`);
process.exit(failures === 0 ? 0 : 1);