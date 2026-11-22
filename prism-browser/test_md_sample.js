const path = require('path');
const { parseMarkdown } = require(path.join(__dirname, 'js/util/markdown.js'));

const sample = '```markdown\n# What I Can Do 🚀\n\nI\'m designed to be your fast, sleek browser assistant.\n\n- **Web & Research** - Summarize articles\n- **Writing & Editing** - Draft emails\n- **Coding & Tech** - Write code\n\n### Quick Examples\n- "Summarize this article"\n- "Fix this error"\n```';

console.log('OUTPUT:');
console.log(parseMarkdown(sample));
