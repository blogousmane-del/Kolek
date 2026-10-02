// Rend une maquette du compagnon lisible seule, hors du serveur : document complet,
// sans script, sans clic de sélection. Pour Docs/maquettes/, comme référence de conception.
import { readFileSync, writeFileSync } from 'node:fs';

const [fragment, sortie, titre] = process.argv.slice(2);
const corps = readFileSync(fragment, 'utf8').replace(/ onclick="toggleSelect\(this\)"/g, '');
const page = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${titre}</title>
<style>
:root{--text-primary:#171A17;--text-secondary:#5B6058;--bg-secondary:#FFFFFF;--border:#E3E5E0;--selected-border:#14402C}
*{box-sizing:border-box}
body{margin:0;padding:32px 24px 48px;background:#F7F8F6;color:var(--text-primary);font-family:system-ui,-apple-system,'Segoe UI',sans-serif;line-height:1.5}
h2{font-size:1.5rem;font-weight:600;margin:0 0 .5rem}
h3{font-size:1.1rem;font-weight:600;margin:0 0 .25rem}
.subtitle{color:var(--text-secondary);margin:0 0 1.5rem;max-width:72ch}
.card{background:var(--bg-secondary);border:1px solid var(--border);border-radius:12px;overflow:hidden}
.note-maquette{font-size:.8rem;color:var(--text-secondary);margin:0 0 1.5rem}
</style>
</head>
<body>
<p class="note-maquette">Maquette validée le 2026-10-02 dans le compagnon visuel. Référence de conception, pas du code de production : les polices viennent ici de Google Fonts, l'application les sert elle-même.</p>
${corps}
</body>
</html>
`;
writeFileSync(sortie, page);
console.log('écrit :', sortie, `${(page.length / 1024).toFixed(1)} ko`);
